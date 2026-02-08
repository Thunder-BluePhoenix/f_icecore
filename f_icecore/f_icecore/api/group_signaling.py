"""
Group Call Signaling API
Handles group call lifecycle and WebRTC signaling for multi-user calls (full mesh topology).

Protocol:
- When a new user joins, all already-connected participants send offers to the new joiner.
- The joiner only responds with answers, never initiates offers.
- This prevents offer collision in the mesh.
"""

import frappe
from frappe import _
from frappe.realtime import publish_realtime
import json
from datetime import datetime

# Import dual-write helper from 1:1 signaling
from f_icecore.f_icecore.api.signaling import _publish_and_queue, _queue_signal


@frappe.whitelist()
def initiate_group_call(participants_json, call_type="audio"):
	"""
	Initiate a group call with multiple participants.

	Args:
		participants_json: JSON array of user emails to invite, e.g. '["a@x.com","b@x.com"]'
		call_type: "audio" or "video"

	Returns:
		dict: {success, group_call_id, participants}
	"""
	initiator = frappe.session.user
	participants = json.loads(participants_json) if isinstance(participants_json, str) else participants_json

	# Validate
	if not participants or len(participants) < 1:
		frappe.throw(_("At least one other participant is required"))

	if initiator in participants:
		participants.remove(initiator)

	if len(participants) < 1:
		frappe.throw(_("At least one other participant is required"))

	# Check max participants from settings
	max_participants = frappe.db.get_single_value("F IceCore Settings", "max_group_call_participants") or 5
	total = len(participants) + 1  # +1 for initiator
	if total > max_participants:
		frappe.throw(_("Maximum {0} participants allowed in a group call").format(max_participants))

	# Validate all users exist
	for user in participants:
		if not frappe.db.exists("User", user):
			frappe.throw(_("User {0} not found").format(user))

	# Create Group Call Session document
	group_doc = frappe.get_doc({
		"doctype": "F IceCore Group Call Session",
		"initiator": initiator,
		"call_type": call_type,
		"status": "Ringing",
		"max_participants": max_participants,
		"created_at": datetime.now()
	})

	# Add initiator as first participant (Connected immediately)
	group_doc.append("participants", {
		"user": initiator,
		"status": "Connected",
		"is_initiator": 1,
		"joined_at": datetime.now()
	})

	# Add each invitee as Invited
	for user in participants:
		group_doc.append("participants", {
			"user": user,
			"status": "Invited",
			"is_initiator": 0
		})

	group_doc.insert(ignore_permissions=True)
	frappe.db.commit()

	group_call_id = group_doc.name
	initiator_name = frappe.db.get_value("User", initiator, "full_name") or initiator

	print(f"\n🔔 F-IceCore Group: Initiated group call {group_call_id} by {initiator}")
	print(f"   Participants: {participants}")

	# Send incoming group call notification to each invitee
	for user in participants:
		call_data = {
			"group_call_id": group_call_id,
			"initiator": initiator,
			"initiator_name": initiator_name,
			"call_type": call_type,
			"participants": [initiator] + participants,
			"timestamp": datetime.now().isoformat()
		}

		_publish_and_queue(
			event="f_icecore:incoming_group_call",
			message=call_data,
			user=user,
			after_commit=True
		)
		print(f"   📤 Sent incoming_group_call to {user}")

	return {
		"success": True,
		"group_call_id": group_call_id,
		"participants": [initiator] + participants
	}


@frappe.whitelist()
def accept_group_call(group_call_id):
	"""
	Accept a group call invitation. Marks the user as Connected.
	Returns list of already-connected users so the joiner knows who to expect offers from.

	Args:
		group_call_id: The group call session name

	Returns:
		dict: {success, connected_users}
	"""
	user = frappe.session.user
	group_doc = frappe.get_doc("F IceCore Group Call Session", group_call_id)

	# Find this user's participant row
	participant_row = None
	for p in group_doc.participants:
		if p.user == user:
			participant_row = p
			break

	if not participant_row:
		frappe.throw(_("You are not a participant in this call"))

	if participant_row.status in ("Connected",):
		# Already connected - return connected users
		connected_users = [p.user for p in group_doc.participants if p.status == "Connected" and p.user != user]
		return {"success": True, "connected_users": connected_users}

	# Update participant status
	participant_row.status = "Connected"
	participant_row.joined_at = datetime.now()
	group_doc.save(ignore_permissions=True)

	# If this is the first person accepting, set call to Active
	if group_doc.status == "Ringing":
		group_doc.status = "Active"
		group_doc.save(ignore_permissions=True)

	frappe.db.commit()

	user_name = frappe.db.get_value("User", user, "full_name") or user

	# Get list of already-connected users (excluding the joiner)
	connected_users = [p.user for p in group_doc.participants if p.status == "Connected" and p.user != user]

	print(f"\n✅ F-IceCore Group: {user} joined {group_call_id}")
	print(f"   Already connected: {connected_users}")

	# Notify all connected participants that a new user joined
	for connected_user in connected_users:
		_publish_and_queue(
			event="f_icecore:group_participant_joined",
			message={
				"group_call_id": group_call_id,
				"user": user,
				"user_name": user_name,
				"timestamp": datetime.now().isoformat()
			},
			user=connected_user,
			after_commit=True
		)

	return {
		"success": True,
		"connected_users": connected_users
	}


@frappe.whitelist()
def reject_group_call(group_call_id):
	"""
	Reject a group call invitation.

	Args:
		group_call_id: The group call session name
	"""
	user = frappe.session.user
	group_doc = frappe.get_doc("F IceCore Group Call Session", group_call_id)

	for p in group_doc.participants:
		if p.user == user:
			p.status = "Rejected"
			break

	group_doc.save(ignore_permissions=True)
	frappe.db.commit()

	print(f"\n❌ F-IceCore Group: {user} rejected {group_call_id}")

	# Check if all invitees have rejected — end the call
	non_initiator = [p for p in group_doc.participants if not p.is_initiator]
	if all(p.status in ("Rejected", "Disconnected") for p in non_initiator):
		_end_group_call(group_doc, "All invitees declined")

	return {"success": True}


@frappe.whitelist()
def leave_group_call(group_call_id):
	"""
	Leave a group call. If no connected participants remain, auto-end the call.

	Args:
		group_call_id: The group call session name
	"""
	user = frappe.session.user
	group_doc = frappe.get_doc("F IceCore Group Call Session", group_call_id)

	for p in group_doc.participants:
		if p.user == user:
			p.status = "Disconnected"
			p.left_at = datetime.now()
			break

	group_doc.save(ignore_permissions=True)
	frappe.db.commit()

	user_name = frappe.db.get_value("User", user, "full_name") or user

	print(f"\n📤 F-IceCore Group: {user} left {group_call_id}")

	# Notify remaining connected participants
	connected = [p.user for p in group_doc.participants if p.status == "Connected"]
	for connected_user in connected:
		_publish_and_queue(
			event="f_icecore:group_participant_left",
			message={
				"group_call_id": group_call_id,
				"user": user,
				"user_name": user_name,
				"timestamp": datetime.now().isoformat()
			},
			user=connected_user,
			after_commit=True
		)

	# If no one is connected anymore, end the call
	if len(connected) <= 1:
		# Reload to get latest state
		group_doc.reload()
		_end_group_call(group_doc, "All participants left")

		# If 1 person remains, notify them the call ended
		if len(connected) == 1:
			_publish_and_queue(
				event="f_icecore:group_call_ended",
				message={
					"group_call_id": group_call_id,
					"reason": "All other participants left",
					"timestamp": datetime.now().isoformat()
				},
				user=connected[0],
				after_commit=True
			)

	return {"success": True}


# ============================================================
# Mid-call: Add participants / Upgrade 1:1 to group call
# ============================================================

@frappe.whitelist()
def add_participant_to_group_call(group_call_id, new_user):
	"""
	Add a new participant to an existing group call (mid-call invite).

	Args:
		group_call_id: The group call session name
		new_user: Email of the user to add

	Returns:
		dict: {success, message}
	"""
	current_user = frappe.session.user
	group_doc = frappe.get_doc("F IceCore Group Call Session", group_call_id)

	if group_doc.status == "Ended":
		frappe.throw(_("This group call has already ended"))

	# Check if user is already a participant
	for p in group_doc.participants:
		if p.user == new_user:
			if p.status in ("Connected", "Invited", "Ringing"):
				return {"success": False, "message": _("User is already in this call")}
			# If previously disconnected/rejected, re-invite
			p.status = "Invited"
			p.left_at = None
			group_doc.save(ignore_permissions=True)
			frappe.db.commit()
			break
	else:
		# Check max participants
		max_participants = group_doc.max_participants or 5
		active_count = sum(1 for p in group_doc.participants if p.status in ("Connected", "Invited", "Ringing"))
		if active_count + 1 > max_participants:
			frappe.throw(_("Maximum {0} participants allowed").format(max_participants))

		# Validate user exists
		if not frappe.db.exists("User", new_user):
			frappe.throw(_("User {0} not found").format(new_user))

		# Add new participant row
		group_doc.append("participants", {
			"user": new_user,
			"status": "Invited",
			"is_initiator": 0
		})
		group_doc.save(ignore_permissions=True)
		frappe.db.commit()

	# Get initiator name and all current participants
	initiator_name = frappe.db.get_value("User", group_doc.initiator, "full_name") or group_doc.initiator
	all_participants = [p.user for p in group_doc.participants]

	# Send incoming group call notification to the new user
	_publish_and_queue(
		event="f_icecore:incoming_group_call",
		message={
			"group_call_id": group_call_id,
			"initiator": group_doc.initiator,
			"initiator_name": initiator_name,
			"call_type": group_doc.call_type,
			"participants": all_participants,
			"added_by": current_user,
			"timestamp": datetime.now().isoformat()
		},
		user=new_user,
		after_commit=True
	)

	print(f"\n👥 F-IceCore Group: {current_user} added {new_user} to {group_call_id}")

	return {"success": True, "message": _("Invitation sent")}


@frappe.whitelist()
def upgrade_to_group_call(current_call_id, new_user, call_type="audio"):
	"""
	Upgrade a 1:1 call to a group call by creating a new group call session
	with the current two participants + the new user.

	The existing 1:1 call will be ended, and both existing parties
	will be notified to join the new group call.

	Args:
		current_call_id: The existing 1:1 F IceCore Call Session name
		new_user: Email of the user to add
		call_type: 'audio' or 'video'

	Returns:
		dict: {success, group_call_id}
	"""
	current_user = frappe.session.user

	# Get the 1:1 call session
	call_doc = frappe.get_doc("F IceCore Call Session", current_call_id)

	# Determine the other user in the 1:1 call
	if call_doc.from_user == current_user:
		other_user = call_doc.to_user
	elif call_doc.to_user == current_user:
		other_user = call_doc.from_user
	else:
		frappe.throw(_("You are not a participant in this call"))

	# Validate the new user
	if not frappe.db.exists("User", new_user):
		frappe.throw(_("User {0} not found").format(new_user))

	if new_user == current_user or new_user == other_user:
		frappe.throw(_("User is already in this call"))

	# Check max participants
	max_participants = frappe.db.get_single_value("F IceCore Settings", "max_group_call_participants") or 5

	# Create a new group call session
	group_doc = frappe.get_doc({
		"doctype": "F IceCore Group Call Session",
		"initiator": current_user,
		"call_type": call_type,
		"status": "Active",
		"max_participants": max_participants,
		"created_at": datetime.now(),
		"metadata": json.dumps({"upgraded_from": current_call_id})
	})

	# Add current user as Connected
	group_doc.append("participants", {
		"user": current_user,
		"status": "Connected",
		"is_initiator": 1,
		"joined_at": datetime.now()
	})

	# Add other user from 1:1 call as Connected (they're already in the call)
	group_doc.append("participants", {
		"user": other_user,
		"status": "Invited",
		"is_initiator": 0
	})

	# Add new user as Invited
	group_doc.append("participants", {
		"user": new_user,
		"status": "Invited",
		"is_initiator": 0
	})

	group_doc.insert(ignore_permissions=True)
	frappe.db.commit()

	group_call_id = group_doc.name
	initiator_name = frappe.db.get_value("User", current_user, "full_name") or current_user
	all_participants = [current_user, other_user, new_user]

	print(f"\n🔄 F-IceCore Group: Upgrading 1:1 call {current_call_id} → group call {group_call_id}")
	print(f"   Participants: {all_participants}")

	# Notify the other user (already in 1:1 call) to switch to group call
	_publish_and_queue(
		event="f_icecore:upgrade_to_group_call",
		message={
			"group_call_id": group_call_id,
			"old_call_id": current_call_id,
			"initiator": current_user,
			"initiator_name": initiator_name,
			"call_type": call_type,
			"participants": all_participants,
			"timestamp": datetime.now().isoformat()
		},
		user=other_user,
		after_commit=True
	)

	# Notify the new user with a standard incoming group call
	_publish_and_queue(
		event="f_icecore:incoming_group_call",
		message={
			"group_call_id": group_call_id,
			"initiator": current_user,
			"initiator_name": initiator_name,
			"call_type": call_type,
			"participants": all_participants,
			"timestamp": datetime.now().isoformat()
		},
		user=new_user,
		after_commit=True
	)

	# End the old 1:1 call
	call_doc.status = "Ended"
	call_doc.ended_at = datetime.now()
	call_doc.end_reason = f"Upgraded to group call {group_call_id}"
	call_doc.save(ignore_permissions=True)
	frappe.db.commit()

	return {
		"success": True,
		"group_call_id": group_call_id,
		"participants": all_participants
	}


# ============================================================
# Group WebRTC Signaling (offer, answer, ICE candidate routing)
# ============================================================

@frappe.whitelist()
def send_group_offer(group_call_id, to_user, offer_sdp):
	"""
	Send a WebRTC offer to a specific peer in the group call.
	Only already-connected participants send offers to new joiners.

	Args:
		group_call_id: The group call session name
		to_user: Target user to send offer to
		offer_sdp: JSON string of the SDP offer
	"""
	from_user = frappe.session.user

	message = {
		"group_call_id": group_call_id,
		"from_user": from_user,
		"offer": offer_sdp,
		"timestamp": datetime.now().isoformat()
	}

	# SocketIO path (user-specific event)
	publish_realtime(
		event=f"f_icecore:group_webrtc_offer:{to_user}",
		message=message,
		user=to_user
	)
	# Redis queue path
	_queue_signal(to_user, "f_icecore:group_webrtc_offer", message)

	return {"success": True}


@frappe.whitelist()
def send_group_answer(group_call_id, to_user, answer_sdp):
	"""
	Send a WebRTC answer to a specific peer in the group call.
	Joiners send answers back to the peers who sent offers.

	Args:
		group_call_id: The group call session name
		to_user: Target user to send answer to
		answer_sdp: JSON string of the SDP answer
	"""
	from_user = frappe.session.user

	message = {
		"group_call_id": group_call_id,
		"from_user": from_user,
		"answer": answer_sdp,
		"timestamp": datetime.now().isoformat()
	}

	# SocketIO path
	publish_realtime(
		event=f"f_icecore:group_webrtc_answer:{to_user}",
		message=message,
		user=to_user
	)
	# Redis queue path
	_queue_signal(to_user, "f_icecore:group_webrtc_answer", message)

	return {"success": True}


@frappe.whitelist()
def send_group_ice_candidate(group_call_id, to_user, candidate):
	"""
	Send an ICE candidate to a specific peer in the group call.

	Args:
		group_call_id: The group call session name
		to_user: Target user to send ICE candidate to
		candidate: ICE candidate data (string or dict)
	"""
	from_user = frappe.session.user

	message = {
		"group_call_id": group_call_id,
		"from_user": from_user,
		"candidate": candidate,
		"timestamp": datetime.now().isoformat()
	}

	# SocketIO path
	publish_realtime(
		event=f"f_icecore:group_ice_candidate:{to_user}",
		message=message,
		user=to_user
	)
	# Redis queue path
	_queue_signal(to_user, "f_icecore:group_ice_candidate", message)

	return {"success": True}


@frappe.whitelist()
def get_group_call_status(group_call_id):
	"""
	Get the current status of a group call including all participants.

	Args:
		group_call_id: The group call session name

	Returns:
		dict: Call status and participant list
	"""
	group_doc = frappe.get_doc("F IceCore Group Call Session", group_call_id)

	participants = []
	for p in group_doc.participants:
		user_name = frappe.db.get_value("User", p.user, "full_name") or p.user
		participants.append({
			"user": p.user,
			"user_name": user_name,
			"status": p.status,
			"is_initiator": p.is_initiator,
			"joined_at": str(p.joined_at) if p.joined_at else None,
			"left_at": str(p.left_at) if p.left_at else None
		})

	return {
		"group_call_id": group_call_id,
		"status": group_doc.status,
		"call_type": group_doc.call_type,
		"initiator": group_doc.initiator,
		"participants": participants,
		"created_at": str(group_doc.created_at) if group_doc.created_at else None
	}


# ============================================================
# Internal helpers
# ============================================================

def _end_group_call(group_doc, reason=""):
	"""
	End a group call session. Sets status to Ended, calculates duration.
	"""
	if group_doc.status == "Ended":
		return

	group_doc.status = "Ended"
	group_doc.ended_at = datetime.now()
	group_doc.end_reason = reason

	# Calculate duration
	if group_doc.created_at:
		delta = datetime.now() - group_doc.created_at
		group_doc.duration = int(delta.total_seconds())

	# Disconnect any remaining connected participants
	for p in group_doc.participants:
		if p.status == "Connected":
			p.status = "Disconnected"
			p.left_at = datetime.now()

	group_doc.save(ignore_permissions=True)
	frappe.db.commit()

	print(f"\n📵 F-IceCore Group: Call {group_doc.name} ended — {reason}")
