"""
Call Transfer API
Handles blind and attended call transfers between users.

Transfer Types:
- Blind Transfer: The call is immediately transferred to the target user.
  The original caller hangs up, and a new call is initiated between
  the remaining party and the transfer target.
- Attended Transfer: The transferring user first calls the target to consult,
  then completes the transfer connecting the original party to the target.

Flow (Blind Transfer):
1. User A and User B are in a call.
2. User A initiates a blind transfer to User C.
3. Server creates a transfer record, ends A's side of the call.
4. Server sends a "transfer_incoming" signal to User C (like an incoming call).
5. Server sends a "transfer_notify" signal to User B (your call is being transferred).
6. If User C accepts, a new call session is created between B and C.
7. If User C declines, B is notified the transfer failed.

Flow (Attended Transfer):
1. User A and User B are in a call.
2. User A initiates an attended transfer to User C.
3. User A is put in a consultation call with User C (B is on hold).
4. User A confirms the transfer → B and C are connected, A is dropped.
5. Or User A cancels → A reconnects with B.
"""

import frappe
from frappe import _
import json
from datetime import datetime

# Import dual-write helper from signaling
from f_icecore.f_icecore.api.signaling import _publish_and_queue, create_call_session


@frappe.whitelist()
def initiate_transfer(call_id, transfer_target, transfer_type="blind", reason=None):
	"""
	Initiate a call transfer.

	Args:
		call_id: The current call session ID
		transfer_target: Email of the user to transfer the call to
		transfer_type: "blind" or "attended"
		reason: Optional reason for the transfer

	Returns:
		dict: {success, transfer_id}
	"""
	user = frappe.session.user

	# Check if transfer is enabled
	enabled = frappe.db.get_single_value("F IceCore Settings", "enable_call_transfer")
	if not enabled:
		return {"success": False, "message": _("Call transfer is disabled by administrator")}

	# Validate the call
	call_doc = frappe.get_doc("F IceCore Call Session", call_id)
	if call_doc.from_user != user and call_doc.to_user != user:
		frappe.throw(_("You are not a participant in this call"))

	if call_doc.status != "Active":
		frappe.throw(_("Call is not active"))

	# Determine the other party (the person being transferred)
	to_user = call_doc.to_user if call_doc.from_user == user else call_doc.from_user

	# Validate transfer target
	if not frappe.db.exists("User", transfer_target):
		frappe.throw(_("Transfer target user not found"))

	if transfer_target == user:
		frappe.throw(_("Cannot transfer call to yourself"))

	if transfer_target == to_user:
		frappe.throw(_("Cannot transfer call to the other party"))

	# Create transfer record
	transfer_doc = frappe.get_doc({
		"doctype": "F IceCore Call Transfer",
		"original_call": call_id,
		"transfer_type": transfer_type,
		"status": "Initiated",
		"from_user": user,
		"to_user": to_user,
		"transfer_target": transfer_target,
		"initiated_at": datetime.now(),
		"reason": reason
	})
	transfer_doc.insert(ignore_permissions=True)
	frappe.db.commit()

	transfer_id = transfer_doc.name
	user_name = frappe.db.get_value("User", user, "full_name") or user
	to_user_name = frappe.db.get_value("User", to_user, "full_name") or to_user

	print(f"\n🔄 F-IceCore Transfer: {user} transferring call {call_id} to {transfer_target}")
	print(f"   Type: {transfer_type}, Other party: {to_user}")

	if transfer_type == "blind":
		# Blind transfer: immediately send notification to target
		transfer_doc.status = "Ringing"
		transfer_doc.save(ignore_permissions=True)
		frappe.db.commit()

		# Notify the transfer target (like an incoming call, but with transfer context)
		_publish_and_queue(
			event="f_icecore:transfer_incoming",
			message={
				"transfer_id": transfer_id,
				"call_id": call_id,
				"from_user": to_user,  # The person they'll be connected to
				"from_user_name": to_user_name,
				"transferred_by": user,
				"transferred_by_name": user_name,
				"call_type": call_doc.call_type,
				"transfer_type": "blind",
				"timestamp": datetime.now().isoformat()
			},
			user=transfer_target,
			after_commit=True
		)

		# Notify the other party that the call is being transferred
		_publish_and_queue(
			event="f_icecore:transfer_notify",
			message={
				"transfer_id": transfer_id,
				"call_id": call_id,
				"transferred_by": user,
				"transferred_by_name": user_name,
				"transfer_target": transfer_target,
				"transfer_target_name": frappe.db.get_value("User", transfer_target, "full_name") or transfer_target,
				"transfer_type": "blind",
				"timestamp": datetime.now().isoformat()
			},
			user=to_user,
			after_commit=True
		)

	elif transfer_type == "attended":
		# Attended transfer: just mark as initiated.
		# The frontend will handle the consultation call flow.
		# The transferring user will call the target separately,
		# then call complete_transfer() to finalize.
		_publish_and_queue(
			event="f_icecore:transfer_notify",
			message={
				"transfer_id": transfer_id,
				"call_id": call_id,
				"transferred_by": user,
				"transferred_by_name": user_name,
				"transfer_target": transfer_target,
				"transfer_target_name": frappe.db.get_value("User", transfer_target, "full_name") or transfer_target,
				"transfer_type": "attended",
				"message": _("Call is being transferred. Please hold..."),
				"timestamp": datetime.now().isoformat()
			},
			user=to_user,
			after_commit=True
		)

	return {
		"success": True,
		"transfer_id": transfer_id
	}


@frappe.whitelist()
def accept_transfer(transfer_id):
	"""
	Accept an incoming transfer (blind or attended).
	Creates a new call session between the remaining party and the transfer target.

	Args:
		transfer_id: The transfer document name

	Returns:
		dict: {success, new_call_id}
	"""
	user = frappe.session.user
	transfer_doc = frappe.get_doc("F IceCore Call Transfer", transfer_id)

	if transfer_doc.transfer_target != user:
		frappe.throw(_("Not authorized to accept this transfer"))

	if transfer_doc.status not in ("Initiated", "Ringing"):
		frappe.throw(_("Transfer is no longer pending"))

	# Get the original call details
	original_call = frappe.get_doc("F IceCore Call Session", transfer_doc.original_call)
	call_type = original_call.call_type

	# The person being transferred (the remaining party)
	remaining_user = transfer_doc.to_user

	# End the original call
	original_call.status = "Ended"
	original_call.ended_at = datetime.now()
	original_call.end_reason = f"Transferred to {user} (Transfer: {transfer_id})"
	original_call.save(ignore_permissions=True)

	# Create new call session between remaining party and transfer target
	new_call = create_call_session(remaining_user, user, call_type, json.dumps({
		"transferred_from": transfer_doc.original_call,
		"transfer_id": transfer_id
	}))

	# Update the new call to Active status
	new_call_doc = frappe.get_doc("F IceCore Call Session", new_call["name"])
	new_call_doc.status = "Active"
	new_call_doc.accepted_at = datetime.now()
	new_call_doc.save(ignore_permissions=True)

	# Update transfer record
	transfer_doc.status = "Completed"
	transfer_doc.completed_at = datetime.now()
	transfer_doc.new_call_session = new_call["name"]
	transfer_doc.save(ignore_permissions=True)
	frappe.db.commit()

	new_call_id = new_call["name"]
	remaining_user_name = frappe.db.get_value("User", remaining_user, "full_name") or remaining_user

	print(f"\n✅ F-IceCore Transfer: {user} accepted transfer {transfer_id}")
	print(f"   New call: {new_call_id} between {remaining_user} and {user}")

	# Notify the remaining party to connect to the new target
	_publish_and_queue(
		event="f_icecore:transfer_completed",
		message={
			"transfer_id": transfer_id,
			"old_call_id": transfer_doc.original_call,
			"new_call_id": new_call_id,
			"new_peer": user,
			"new_peer_name": frappe.db.get_value("User", user, "full_name") or user,
			"call_type": call_type,
			"timestamp": datetime.now().isoformat()
		},
		user=remaining_user,
		after_commit=True
	)

	# Notify the original transferrer that transfer completed
	_publish_and_queue(
		event="f_icecore:transfer_completed",
		message={
			"transfer_id": transfer_id,
			"old_call_id": transfer_doc.original_call,
			"new_call_id": new_call_id,
			"status": "completed",
			"timestamp": datetime.now().isoformat()
		},
		user=transfer_doc.from_user,
		after_commit=True
	)

	return {
		"success": True,
		"new_call_id": new_call_id,
		"remaining_user": remaining_user,
		"remaining_user_name": remaining_user_name,
		"call_type": call_type
	}


@frappe.whitelist()
def reject_transfer(transfer_id, reason=None):
	"""
	Reject an incoming transfer.

	Args:
		transfer_id: The transfer document name
		reason: Optional rejection reason

	Returns:
		dict: {success}
	"""
	user = frappe.session.user
	transfer_doc = frappe.get_doc("F IceCore Call Transfer", transfer_id)

	if transfer_doc.transfer_target != user:
		frappe.throw(_("Not authorized"))

	transfer_doc.status = "Rejected"
	transfer_doc.completed_at = datetime.now()
	transfer_doc.reason = reason or "Transfer declined"
	transfer_doc.save(ignore_permissions=True)
	frappe.db.commit()

	target_name = frappe.db.get_value("User", user, "full_name") or user

	# Notify both the remaining party and the original transferrer
	# Notify remaining party (B) — their call continues / they should know transfer failed
	_publish_and_queue(
		event="f_icecore:transfer_failed",
		message={
			"transfer_id": transfer_id,
			"call_id": transfer_doc.original_call,
			"reason": f"{target_name} declined the transfer",
			"timestamp": datetime.now().isoformat()
		},
		user=transfer_doc.to_user,
		after_commit=True
	)

	# Notify transferrer (A)
	_publish_and_queue(
		event="f_icecore:transfer_failed",
		message={
			"transfer_id": transfer_id,
			"call_id": transfer_doc.original_call,
			"reason": f"{target_name} declined the transfer",
			"timestamp": datetime.now().isoformat()
		},
		user=transfer_doc.from_user,
		after_commit=True
	)

	print(f"\n❌ F-IceCore Transfer: {user} rejected transfer {transfer_id}")

	return {"success": True}


@frappe.whitelist()
def cancel_transfer(transfer_id):
	"""
	Cancel a pending transfer (by the transferrer).

	Args:
		transfer_id: The transfer document name

	Returns:
		dict: {success}
	"""
	user = frappe.session.user
	transfer_doc = frappe.get_doc("F IceCore Call Transfer", transfer_id)

	if transfer_doc.from_user != user:
		frappe.throw(_("Not authorized to cancel this transfer"))

	if transfer_doc.status in ("Completed", "Failed"):
		return {"success": False, "message": _("Transfer already finalized")}

	transfer_doc.status = "Cancelled"
	transfer_doc.completed_at = datetime.now()
	transfer_doc.save(ignore_permissions=True)
	frappe.db.commit()

	# Notify the target that the transfer was cancelled
	_publish_and_queue(
		event="f_icecore:transfer_cancelled",
		message={
			"transfer_id": transfer_id,
			"call_id": transfer_doc.original_call,
			"timestamp": datetime.now().isoformat()
		},
		user=transfer_doc.transfer_target,
		after_commit=True
	)

	# Notify the remaining party
	_publish_and_queue(
		event="f_icecore:transfer_cancelled",
		message={
			"transfer_id": transfer_id,
			"call_id": transfer_doc.original_call,
			"message": _("Transfer was cancelled"),
			"timestamp": datetime.now().isoformat()
		},
		user=transfer_doc.to_user,
		after_commit=True
	)

	print(f"\n🚫 F-IceCore Transfer: {user} cancelled transfer {transfer_id}")

	return {"success": True}


@frappe.whitelist()
def complete_attended_transfer(transfer_id):
	"""
	Complete an attended transfer after the transferrer has consulted with the target.
	This connects the remaining party with the transfer target and drops the transferrer.

	Args:
		transfer_id: The transfer document name

	Returns:
		dict: {success, new_call_id}
	"""
	user = frappe.session.user
	transfer_doc = frappe.get_doc("F IceCore Call Transfer", transfer_id)

	if transfer_doc.from_user != user:
		frappe.throw(_("Not authorized"))

	if transfer_doc.transfer_type != "attended":
		frappe.throw(_("This is not an attended transfer"))

	if transfer_doc.status in ("Completed", "Failed", "Cancelled"):
		frappe.throw(_("Transfer already finalized"))

	# Get original call details
	original_call = frappe.get_doc("F IceCore Call Session", transfer_doc.original_call)
	call_type = original_call.call_type
	remaining_user = transfer_doc.to_user
	target_user = transfer_doc.transfer_target

	# End the original call
	original_call.status = "Ended"
	original_call.ended_at = datetime.now()
	original_call.end_reason = f"Attended transfer completed to {target_user} (Transfer: {transfer_id})"
	original_call.save(ignore_permissions=True)

	# Create new call session
	new_call = create_call_session(remaining_user, target_user, call_type, json.dumps({
		"transferred_from": transfer_doc.original_call,
		"transfer_id": transfer_id,
		"transfer_type": "attended"
	}))

	new_call_doc = frappe.get_doc("F IceCore Call Session", new_call["name"])
	new_call_doc.status = "Active"
	new_call_doc.accepted_at = datetime.now()
	new_call_doc.save(ignore_permissions=True)

	# Update transfer record
	transfer_doc.status = "Completed"
	transfer_doc.completed_at = datetime.now()
	transfer_doc.new_call_session = new_call["name"]
	transfer_doc.save(ignore_permissions=True)
	frappe.db.commit()

	new_call_id = new_call["name"]
	target_name = frappe.db.get_value("User", target_user, "full_name") or target_user
	remaining_user_name = frappe.db.get_value("User", remaining_user, "full_name") or remaining_user

	# Notify the remaining party to connect to the target
	_publish_and_queue(
		event="f_icecore:transfer_completed",
		message={
			"transfer_id": transfer_id,
			"old_call_id": transfer_doc.original_call,
			"new_call_id": new_call_id,
			"new_peer": target_user,
			"new_peer_name": target_name,
			"call_type": call_type,
			"timestamp": datetime.now().isoformat()
		},
		user=remaining_user,
		after_commit=True
	)

	# Notify the target to connect to the remaining party
	_publish_and_queue(
		event="f_icecore:transfer_completed",
		message={
			"transfer_id": transfer_id,
			"old_call_id": transfer_doc.original_call,
			"new_call_id": new_call_id,
			"new_peer": remaining_user,
			"new_peer_name": remaining_user_name,
			"call_type": call_type,
			"timestamp": datetime.now().isoformat()
		},
		user=target_user,
		after_commit=True
	)

	print(f"\n✅ F-IceCore Transfer: Attended transfer {transfer_id} completed")
	print(f"   New call: {new_call_id} between {remaining_user} and {target_user}")

	return {
		"success": True,
		"new_call_id": new_call_id
	}
