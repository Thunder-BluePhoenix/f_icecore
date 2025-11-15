"""
WebRTC Signaling API
Handles offer, answer, and ICE candidate exchange between peers
Uses Frappe's realtime (SocketIO) for signaling
"""

import frappe
from frappe import _
from frappe.realtime import publish_realtime
import json
from datetime import datetime


@frappe.whitelist()
def initiate_call(to_user, call_type="audio", metadata=None):
	"""
	Initiate a call to another user

	Args:
		to_user: Target user to call
		call_type: "audio", "video", or "screen"
		metadata: Additional call metadata

	Returns:
		dict: Call session information
	"""
	from_user = frappe.session.user

	# Validate users
	if not frappe.db.exists("User", to_user):
		frappe.throw(_("User not found"))

	if from_user == to_user:
		frappe.throw(_("Cannot call yourself"))

	# Check if user is online
	is_online = check_user_online(to_user)
	if not is_online:
		return {
			"success": False,
			"message": _("User is not online")
		}

	# Create call session
	call_session = create_call_session(from_user, to_user, call_type, metadata)

	# Notify the target user via realtime
	# Note: When using user= parameter, don't include user in event name
	publish_realtime(
		event="f_icecore:incoming_call",
		message={
			"call_id": call_session["name"],
			"from_user": from_user,
			"from_user_name": frappe.db.get_value("User", from_user, "full_name"),
			"call_type": call_type,
			"metadata": metadata,
			"timestamp": call_session["creation"]
		},
		user=to_user,
		after_commit=True
	)

	return {
		"success": True,
		"call_session": call_session
	}


@frappe.whitelist()
def accept_call(call_id):
	"""Accept an incoming call"""
	user = frappe.session.user
	call_doc = frappe.get_doc("F IceCore Call Session", call_id)

	if call_doc.to_user != user:
		frappe.throw(_("Not authorized to accept this call"))

	call_doc.status = "Active"
	call_doc.accepted_at = datetime.now()
	call_doc.save(ignore_permissions=True)

	publish_realtime(
		event="f_icecore:call_accepted",
		message={"call_id": call_id, "accepted_by": user, "timestamp": datetime.now().isoformat()},
		user=call_doc.from_user,
		after_commit=True
	)

	return {"success": True, "call_session": call_doc.as_dict()}


@frappe.whitelist()
def reject_call(call_id, reason=None):
	"""Reject an incoming call"""
	user = frappe.session.user
	call_doc = frappe.get_doc("F IceCore Call Session", call_id)

	if call_doc.to_user != user and call_doc.from_user != user:
		frappe.throw(_("Not authorized"))

	call_doc.status = "Rejected"
	call_doc.ended_at = datetime.now()
	call_doc.end_reason = reason or "User rejected"
	call_doc.save(ignore_permissions=True)

	other_user = call_doc.from_user if user == call_doc.to_user else call_doc.to_user
	publish_realtime(
		event="f_icecore:call_rejected",
		message={"call_id": call_id, "rejected_by": user, "reason": reason, "timestamp": datetime.now().isoformat()},
		user=other_user,
		after_commit=True
	)

	return {"success": True}


@frappe.whitelist()
def end_call(call_id):
	"""End an active call"""
	user = frappe.session.user
	call_doc = frappe.get_doc("F IceCore Call Session", call_id)

	if call_doc.from_user != user and call_doc.to_user != user:
		frappe.throw(_("Not authorized"))

	call_doc.status = "Ended"
	call_doc.ended_at = datetime.now()
	call_doc.save(ignore_permissions=True)

	other_user = call_doc.to_user if user == call_doc.from_user else call_doc.from_user
	publish_realtime(
		event="f_icecore:call_ended",
		message={"call_id": call_id, "ended_by": user, "timestamp": datetime.now().isoformat()},
		user=other_user,
		after_commit=True
	)

	return {"success": True}


@frappe.whitelist()
def send_offer(to_user, offer_sdp, call_id=None):
	"""Send WebRTC offer to peer"""
	from_user = frappe.session.user
	publish_realtime(
		event=f"f_icecore:webrtc_offer:{to_user}",
		message={"from_user": from_user, "offer": offer_sdp, "call_id": call_id, "timestamp": datetime.now().isoformat()},
		user=to_user
	)
	return {"success": True}


@frappe.whitelist()
def send_answer(to_user, answer_sdp, call_id=None):
	"""Send WebRTC answer to peer"""
	from_user = frappe.session.user
	publish_realtime(
		event=f"f_icecore:webrtc_answer:{to_user}",
		message={"from_user": from_user, "answer": answer_sdp, "call_id": call_id, "timestamp": datetime.now().isoformat()},
		user=to_user
	)
	return {"success": True}


@frappe.whitelist()
def send_ice_candidate(to_user, candidate, call_id=None):
	"""Send ICE candidate to peer"""
	from_user = frappe.session.user
	publish_realtime(
		event=f"f_icecore:ice_candidate:{to_user}",
		message={"from_user": from_user, "candidate": candidate, "call_id": call_id, "timestamp": datetime.now().isoformat()},
		user=to_user
	)
	return {"success": True}


def handle_signal(data):
	"""Generic signal handler for SocketIO events"""
	pass


def create_call_session(from_user, to_user, call_type, metadata):
	"""Create a new call session document"""
	doc = frappe.get_doc({
		"doctype": "F IceCore Call Session",
		"from_user": from_user,
		"to_user": to_user,
		"call_type": call_type,
		"status": "Ringing",
		"metadata": json.dumps(metadata) if metadata else None
	})
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return doc.as_dict()


def check_user_online(user):
	"""Check if a user is currently online"""
	cache_key = f"f_icecore:presence:{user}"
	presence = frappe.cache().get_value(cache_key)
	if presence:
		return presence.get("status") == "online"
	return False
