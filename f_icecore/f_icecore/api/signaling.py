"""
WebRTC Signaling API
Handles offer, answer, and ICE candidate exchange between peers
Uses Frappe's realtime (SocketIO) for signaling
+ HTTP Polling fallback for clients with broken SocketIO (e.g. mobile via IP address)
"""

import frappe
from frappe import _
from frappe.realtime import publish_realtime
import json
from datetime import datetime
import time


# ============================================================
# Signal Queue - Redis-based queue for polling fallback
# ============================================================

def _queue_signal(user, event, message):
	"""
	Queue a signal in Redis for a specific user.
	This is called alongside publish_realtime so that clients
	without a working SocketIO connection can still receive signals
	by polling via HTTP.

	Signals are stored as a Redis list with a TTL of 120 seconds.
	Each signal is a JSON object with event name, message data, and timestamp.
	"""
	try:
		cache_key = f"f_icecore:signal_queue:{user}"
		signal = json.dumps({
			"event": event,
			"message": message,
			"ts": time.time()
		})
		# Use Redis list - push to the right
		r = frappe.cache()
		r.rpush(cache_key, signal)
		# Set expiry to 120 seconds (signals older than that are stale anyway)
		r.expire(cache_key, 120)
	except Exception as e:
		frappe.logger().error(f"F-IceCore: Failed to queue signal for {user}: {e}")


@frappe.whitelist()
def poll_signals():
	"""
	Poll for pending signals for the current user.
	Returns all queued signals and clears the queue.

	This is the HTTP polling fallback for clients whose SocketIO
	connection is broken (e.g. mobile connecting via IP address).

	Returns:
		list: Array of signal objects [{event, message, ts}, ...]
	"""
	user = frappe.session.user
	cache_key = f"f_icecore:signal_queue:{user}"

	try:
		r = frappe.cache()
		signals = []

		# Pop all items from the list atomically
		while True:
			item = r.lpop(cache_key)
			if item is None:
				break
			try:
				if isinstance(item, bytes):
					item = item.decode('utf-8')
				signal = json.loads(item)
				signals.append(signal)
			except (json.JSONDecodeError, UnicodeDecodeError) as e:
				frappe.logger().error(f"F-IceCore: Failed to parse queued signal: {e}")

		return signals
	except Exception as e:
		frappe.logger().error(f"F-IceCore: Failed to poll signals: {e}")
		return []


# ============================================================
# Helper: publish + queue (dual-write)
# ============================================================

def _publish_and_queue(event, message, user, after_commit=False):
	"""
	Send a signal via both SocketIO (publish_realtime) AND Redis queue.
	The SocketIO path works when the client has a working connection.
	The Redis queue path works when polled via HTTP.
	"""
	# SocketIO path (may not reach client if their socket is disconnected)
	publish_realtime(
		event=event,
		message=message,
		user=user,
		after_commit=after_commit
	)
	# Redis queue path (always works - client polls via HTTP)
	_queue_signal(user, event, message)


# ============================================================
# Call lifecycle APIs
# ============================================================

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

	# Send incoming call notification to the target user
	print(f"\n\n🔔🔔🔔 F-IceCore: Broadcasting incoming_call from {from_user} to {to_user}\n")
	frappe.logger().info(f"🔔 F-IceCore: Broadcasting incoming_call from {from_user} to {to_user}")

	call_data = {
		"call_id": call_session["name"],
		"from_user": from_user,
		"from_user_name": frappe.db.get_value("User", from_user, "full_name"),
		"to_user": to_user,
		"call_type": call_type,
		"metadata": metadata,
		"timestamp": str(call_session["creation"])
	}

	print(f"🔔 F-IceCore: call_data = {call_data}\n")

	# Send via both SocketIO AND Redis queue
	print(f"🔔 F-IceCore: Sending incoming_call to user={to_user} (SocketIO + Redis queue)\n")
	_publish_and_queue(
		event="f_icecore:incoming_call",
		message=call_data,
		user=to_user,
		after_commit=True
	)
	print(f"✅✅✅ F-IceCore: publish_and_queue completed!\n\n")

	frappe.logger().info(f"✅ F-IceCore: Broadcasted incoming_call event")

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

	# Notify the caller that call was accepted (via both SocketIO + queue)
	_publish_and_queue(
		event="call_accepted",
		message={"call_id": call_id, "accepted_by": user, "from_user": call_doc.from_user, "to_user": call_doc.to_user, "timestamp": datetime.now().isoformat()},
		user=call_doc.from_user,
		after_commit=True
	)

	frappe.logger().info(f"✅ F-IceCore: Broadcasted call_accepted event for {call_id}")

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

	# Notify the other party (via both SocketIO + queue)
	_publish_and_queue(
		event="call_rejected",
		message={"call_id": call_id, "rejected_by": user, "reason": reason, "from_user": call_doc.from_user, "to_user": call_doc.to_user, "timestamp": datetime.now().isoformat()},
		user=other_user,
		after_commit=True
	)

	frappe.logger().info(f"✅ F-IceCore: Broadcasted call_rejected event for {call_id}")

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

	# Notify the other party (via both SocketIO + queue)
	_publish_and_queue(
		event="call_ended",
		message={"call_id": call_id, "ended_by": user, "from_user": call_doc.from_user, "to_user": call_doc.to_user, "timestamp": datetime.now().isoformat()},
		user=other_user,
		after_commit=True
	)

	frappe.logger().info(f"✅ F-IceCore: Broadcasted call_ended event for {call_id}")

	return {"success": True}


# ============================================================
# WebRTC signaling APIs (offer, answer, ICE candidates)
# ============================================================

@frappe.whitelist()
def send_offer(to_user, offer_sdp, call_id=None, call_type=None):
	"""Send WebRTC offer to peer"""
	from_user = frappe.session.user
	# Get call_type from call session if not provided
	if not call_type and call_id:
		call_type = frappe.db.get_value("F IceCore Call Session", call_id, "call_type") or "audio"

	message = {"from_user": from_user, "offer": offer_sdp, "call_id": call_id, "call_type": call_type or "audio", "timestamp": datetime.now().isoformat()}

	# SocketIO path (user-specific event)
	publish_realtime(
		event=f"f_icecore:webrtc_offer:{to_user}",
		message=message,
		user=to_user
	)
	# Redis queue path (generic event name - client will parse)
	_queue_signal(to_user, "f_icecore:webrtc_offer", message)

	return {"success": True}


@frappe.whitelist()
def send_answer(to_user, answer_sdp, call_id=None):
	"""Send WebRTC answer to peer"""
	from_user = frappe.session.user
	message = {"from_user": from_user, "answer": answer_sdp, "call_id": call_id, "timestamp": datetime.now().isoformat()}

	# SocketIO path
	publish_realtime(
		event=f"f_icecore:webrtc_answer:{to_user}",
		message=message,
		user=to_user
	)
	# Redis queue path
	_queue_signal(to_user, "f_icecore:webrtc_answer", message)

	return {"success": True}


@frappe.whitelist()
def send_ice_candidate(to_user, candidate, call_id=None):
	"""Send ICE candidate to peer"""
	from_user = frappe.session.user
	message = {"from_user": from_user, "candidate": candidate, "call_id": call_id, "timestamp": datetime.now().isoformat()}

	# SocketIO path
	publish_realtime(
		event=f"f_icecore:ice_candidate:{to_user}",
		message=message,
		user=to_user
	)
	# Redis queue path
	_queue_signal(to_user, "f_icecore:ice_candidate", message)

	return {"success": True}


# ============================================================
# Debug / Test endpoints
# ============================================================

@frappe.whitelist()
def test_realtime(to_user):
	"""
	Debug endpoint: Test if realtime events reach a target user.
	Call this from caller's browser console:
	  frappe.call({method: 'f_icecore.f_icecore.api.signaling.test_realtime', args: {to_user: 'testecice@ice.com'}})
	Then check recipient's browser console for the log.
	"""
	from_user = frappe.session.user

	# Test 1: Send to specific user (user= param)
	_publish_and_queue(
		event="f_icecore:test_ping",
		message={"from_user": from_user, "test": "user_targeted", "timestamp": datetime.now().isoformat()},
		user=to_user,
		after_commit=True
	)

	# Test 2: Also send incoming_call event to specific user
	_publish_and_queue(
		event="f_icecore:incoming_call",
		message={
			"call_id": "TEST-CALL",
			"from_user": from_user,
			"from_user_name": frappe.db.get_value("User", from_user, "full_name"),
			"to_user": to_user,
			"call_type": "audio",
			"metadata": None,
			"timestamp": datetime.now().isoformat()
		},
		user=to_user,
		after_commit=True
	)

	print(f"\n🧪 TEST: Sent test_ping + incoming_call to user={to_user}\n")

	return {
		"success": True,
		"message": f"Test events sent to {to_user}. Check their browser console or poll_signals."
	}


# ============================================================
# Helper functions
# ============================================================

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
