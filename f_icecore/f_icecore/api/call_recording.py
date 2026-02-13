"""
Call Recording API
Handles creating, completing, and managing call recording documents.

Recording is done client-side using MediaRecorder API on the browser.
The recorded blob is uploaded as a Frappe file attachment, and
a Call Recording document tracks the metadata.
"""

import frappe
from frappe import _
import json
from datetime import datetime


@frappe.whitelist()
def start_recording(call_id=None, group_call_id=None, call_type="audio"):
	"""
	Start a call recording. Creates a Call Recording document with status=Recording.

	The actual recording is done client-side via MediaRecorder API.
	This just creates the tracking document.

	Args:
		call_id: 1:1 call session ID (optional)
		group_call_id: Group call session ID (optional)
		call_type: 'audio', 'video', or 'screen'

	Returns:
		dict: {success, recording_id}
	"""
	user = frappe.session.user

	# Check if recording is enabled in settings
	try:
		enabled = frappe.db.get_single_value("F IceCore Settings", "enable_call_recording")
		# enabled=0 means explicitly disabled; enabled=1 or None means allow
		if enabled == 0:
			return {"success": False, "message": _("Call recording is disabled by administrator")}
	except Exception:
		pass  # Settings doc may not exist yet, allow recording

	# Validate that at least one call reference is provided
	if not call_id and not group_call_id:
		frappe.throw(_("Either call_id or group_call_id is required"))

	# Determine participants
	participants = [user]
	if call_id:
		call_doc = frappe.get_doc("F IceCore Call Session", call_id)
		other_user = call_doc.to_user if call_doc.from_user == user else call_doc.from_user
		participants.append(other_user)
	elif group_call_id:
		group_doc = frappe.get_doc("F IceCore Group Call Session", group_call_id)
		for p in group_doc.participants:
			if p.user != user and p.status == "Connected":
				participants.append(p.user)

	# Create recording document
	rec_doc = frappe.get_doc({
		"doctype": "F IceCore Call Recording",
		"call_session": call_id,
		"group_call_session": group_call_id,
		"recorded_by": user,
		"call_type": call_type,
		"status": "Recording",
		"started_at": datetime.now(),
		"participants": json.dumps(participants)
	})
	rec_doc.insert(ignore_permissions=True)
	frappe.db.commit()

	print(f"\n🔴 F-IceCore Recording: Started by {user} — {rec_doc.name}")

	return {
		"success": True,
		"recording_id": rec_doc.name
	}


@frappe.whitelist()
def stop_recording(recording_id):
	"""
	Stop a recording and mark it as completed.
	The actual file upload is handled separately via upload_recording.

	Args:
		recording_id: The Call Recording document name

	Returns:
		dict: {success}
	"""
	user = frappe.session.user
	rec_doc = frappe.get_doc("F IceCore Call Recording", recording_id)

	if rec_doc.recorded_by != user:
		frappe.throw(_("Not authorized"))

	rec_doc.status = "Completed"
	rec_doc.ended_at = datetime.now()

	# Calculate duration
	if rec_doc.started_at:
		start = rec_doc.started_at
		if isinstance(start, str):
			start = datetime.fromisoformat(start)
		rec_doc.duration = int((datetime.now() - start).total_seconds())

	rec_doc.save(ignore_permissions=True)
	frappe.db.commit()

	print(f"\n⏹️ F-IceCore Recording: Stopped {recording_id} — duration: {rec_doc.duration}s")

	return {"success": True}


@frappe.whitelist()
def upload_recording(recording_id, filename=None):
	"""
	Upload a recorded file and attach it to the recording document.
	The file content is sent via the standard Frappe file upload mechanism.

	This endpoint is called after the recording blob has been uploaded
	via the frappe.call with file data.

	Args:
		recording_id: The Call Recording document name
		filename: Optional filename override

	Returns:
		dict: {success, file_url}
	"""
	user = frappe.session.user
	rec_doc = frappe.get_doc("F IceCore Call Recording", recording_id)

	if rec_doc.recorded_by != user:
		frappe.throw(_("Not authorized"))

	# Check if file was uploaded with this request
	if not frappe.request or not frappe.request.files:
		frappe.throw(_("No file uploaded"))

	file_data = frappe.request.files.get("file") or frappe.request.files.get("recording_file")
	if not file_data:
		frappe.throw(_("No recording file found in upload"))

	# Generate filename if not provided
	if not filename:
		ext = "webm"
		timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
		filename = f"recording_{recording_id}_{timestamp}.{ext}"

	# Save file using Frappe's file manager
	file_doc = frappe.get_doc({
		"doctype": "File",
		"file_name": filename,
		"content": file_data.read(),
		"attached_to_doctype": "F IceCore Call Recording",
		"attached_to_name": recording_id,
		"is_private": 1
	})
	file_doc.save(ignore_permissions=True)

	# Update recording document
	rec_doc.recording_file = file_doc.file_url
	rec_doc.file_size = file_doc.file_size
	rec_doc.save(ignore_permissions=True)
	frappe.db.commit()

	print(f"\n💾 F-IceCore Recording: File saved for {recording_id} — {file_doc.file_url}")

	return {
		"success": True,
		"file_url": file_doc.file_url
	}


@frappe.whitelist()
def save_recording_blob(recording_id, blob_b64, filename=None):
	"""
	Save a recording from a base64-encoded blob.
	This is an alternative to the file upload method — useful when
	sending the blob via JSON in frappe.call.

	Args:
		recording_id: The Call Recording document name
		blob_b64: Base64-encoded recording data
		filename: Optional filename

	Returns:
		dict: {success, file_url}
	"""
	import base64

	user = frappe.session.user
	rec_doc = frappe.get_doc("F IceCore Call Recording", recording_id)

	if rec_doc.recorded_by != user:
		frappe.throw(_("Not authorized"))

	# Decode base64
	try:
		file_content = base64.b64decode(blob_b64)
	except Exception as e:
		frappe.throw(_("Invalid recording data: {0}").format(str(e)))

	# Generate filename
	if not filename:
		ext = "webm"
		timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
		filename = f"recording_{recording_id}_{timestamp}.{ext}"

	# Save file
	file_doc = frappe.get_doc({
		"doctype": "File",
		"file_name": filename,
		"content": file_content,
		"attached_to_doctype": "F IceCore Call Recording",
		"attached_to_name": recording_id,
		"is_private": 1
	})
	file_doc.save(ignore_permissions=True)

	# Update recording document
	rec_doc.recording_file = file_doc.file_url
	rec_doc.file_size = len(file_content)
	rec_doc.format = "webm"
	rec_doc.save(ignore_permissions=True)
	frappe.db.commit()

	print(f"\n💾 F-IceCore Recording: Blob saved for {recording_id} — {file_doc.file_url} ({len(file_content)} bytes)")

	return {
		"success": True,
		"file_url": file_doc.file_url
	}


@frappe.whitelist()
def get_recordings(call_id=None, group_call_id=None, limit=20):
	"""
	Get recordings for the current user, optionally filtered by call.

	Args:
		call_id: Filter by 1:1 call session (optional)
		group_call_id: Filter by group call session (optional)
		limit: Max results (default 20)

	Returns:
		list: Recording documents
	"""
	user = frappe.session.user
	filters = {"recorded_by": user, "status": ["!=", "Deleted"]}

	if call_id:
		filters["call_session"] = call_id
	if group_call_id:
		filters["group_call_session"] = group_call_id

	recordings = frappe.get_all(
		"F IceCore Call Recording",
		filters=filters,
		fields=["name", "call_session", "group_call_session", "call_type",
				"status", "duration", "file_size", "recording_file",
				"started_at", "ended_at", "participants", "format"],
		order_by="creation desc",
		limit_page_length=int(limit)
	)

	return recordings


@frappe.whitelist()
def delete_recording(recording_id):
	"""
	Soft-delete a recording (marks as Deleted, removes file).

	Args:
		recording_id: The Call Recording document name

	Returns:
		dict: {success}
	"""
	user = frappe.session.user
	rec_doc = frappe.get_doc("F IceCore Call Recording", recording_id)

	if rec_doc.recorded_by != user:
		frappe.throw(_("Not authorized to delete this recording"))

	# Remove the actual file
	if rec_doc.recording_file:
		try:
			file_doc = frappe.get_doc("File", {"file_url": rec_doc.recording_file})
			file_doc.delete(ignore_permissions=True)
		except Exception as e:
			frappe.logger().warning(f"F-IceCore: Could not delete recording file: {e}")

	rec_doc.status = "Deleted"
	rec_doc.recording_file = None
	rec_doc.save(ignore_permissions=True)
	frappe.db.commit()

	return {"success": True}


def cleanup_old_recordings():
	"""
	Scheduled task: delete recordings older than the configured retention period.
	"""
	try:
		days = frappe.db.get_single_value("F IceCore Settings", "cleanup_old_recordings") or 30
		if days == 0:
			return  # Never delete

		from frappe.utils import add_days, now_datetime
		cutoff = add_days(now_datetime(), -int(days))

		old_recordings = frappe.get_all(
			"F IceCore Call Recording",
			filters={
				"creation": ["<", cutoff],
				"status": ["in", ["Completed", "Failed"]]
			},
			pluck="name"
		)

		for rec_name in old_recordings:
			try:
				rec_doc = frappe.get_doc("F IceCore Call Recording", rec_name)
				# Delete attached file
				if rec_doc.recording_file:
					try:
						file_docs = frappe.get_all("File", filters={"file_url": rec_doc.recording_file}, pluck="name")
						for fd in file_docs:
							frappe.delete_doc("File", fd, ignore_permissions=True)
					except Exception:
						pass
				frappe.delete_doc("F IceCore Call Recording", rec_name, ignore_permissions=True)
			except Exception as e:
				frappe.logger().error(f"F-IceCore: Failed to cleanup recording {rec_name}: {e}")

		if old_recordings:
			frappe.db.commit()
			frappe.logger().info(f"F-IceCore: Cleaned up {len(old_recordings)} old recordings")

	except Exception as e:
		frappe.logger().error(f"F-IceCore: Recording cleanup failed: {e}")
