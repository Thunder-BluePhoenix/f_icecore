import frappe
from frappe.realtime import publish_realtime
from datetime import datetime
import math

PRESENCE_TTL = 300  # 5 minutes

@frappe.whitelist()
def update_presence(status="online", metadata=None):
	"""
	Update user presence in Redis and broadcast via Socket.IO
	"""
	user = frappe.session.user

	presence_data = {
		"user": user,
		"status": status,
		"last_seen": datetime.now().isoformat(),
		"metadata": metadata,
		"full_name": frappe.db.get_value("User", user, "full_name") or user
	}

	# Store in Redis cache
	cache_key = f"f_icecore:presence:{user}"
	frappe.cache().set_value(cache_key, presence_data, expires_in_sec=PRESENCE_TTL)

	# Broadcast to all users via Socket.IO
	publish_realtime(
		event="f_icecore:presence_update",
		message=presence_data,
		after_commit=True
	)

	return presence_data

@frappe.whitelist()
def heartbeat():
	"""
	Heartbeat to keep user online
	Called every 60 seconds from client
	"""
	user = frappe.session.user
	cache_key = f"f_icecore:presence:{user}"

	presence = frappe.cache().get_value(cache_key)

	if not presence:
		# First heartbeat - set as online
		return update_presence(status="online")

	# Update last_seen timestamp
	presence["last_seen"] = datetime.now().isoformat()
	frappe.cache().set_value(cache_key, presence, expires_in_sec=PRESENCE_TTL)

	return presence

@frappe.whitelist()
def get_online_users():
	"""
	Get all online users (excluding current user)
	"""
	current_user = frappe.session.user

	all_users = frappe.get_all(
		"User",
		filters={
			"enabled": 1,
			"user_type": "System User",
			"name": ["!=", current_user]  # Exclude self
		},
		fields=["name", "full_name", "user_image"]
	)

	online_users = []

	for user in all_users:
		cache_key = f"f_icecore:presence:{user.name}"
		presence = frappe.cache().get_value(cache_key)

		if presence and presence.get("status") != "offline":
			online_users.append({
				"user": user.name,
				"full_name": user.full_name or user.name,
				"user_image": user.user_image,
				"status": presence.get("status", "online"),
				"last_seen": presence.get("last_seen")
			})

	return online_users

@frappe.whitelist()
def get_user_presence(user):
	presence = frappe.cache().get_value(f"f_icecore:presence:{user}")
	return presence or {"user": user, "status": "offline", "last_seen": None}

@frappe.whitelist()
def get_call_capable_users():
	"""
	Get users who can receive calls (online and not busy/in_call)
	"""
	online_users = get_online_users()

	# Filter out users who are in a call or busy
	call_capable = [
		u for u in online_users
		if u.get("status") not in ["in_call", "busy", "offline"]
	]

	return call_capable

@frappe.whitelist()
def search_users(query="", page=1, page_size=10):
	"""
	Search users by name (email), full_name, phone, mobile_no.
	Returns paginated results with online/offline presence status.

	Args:
		query: Search string (matches across name, full_name, phone, mobile_no)
		page: Page number (1-indexed)
		page_size: Results per page (default 10)

	Returns:
		dict: {users: [...], total: int, page: int, page_size: int, total_pages: int}
	"""
	current_user = frappe.session.user
	page = max(1, int(page))
	page_size = min(50, max(1, int(page_size)))
	offset = (page - 1) * page_size

	conditions = """
		`enabled` = 1
		AND `user_type` = 'System User'
		AND `name` != %(current_user)s
		AND `name` NOT IN ('Administrator', 'Guest')
	"""
	params = {"current_user": current_user}

	if query and query.strip():
		query = query.strip()
		conditions += """
			AND (
				`name` LIKE %(q)s
				OR `full_name` LIKE %(q)s
				OR `phone` LIKE %(q)s
				OR `mobile_no` LIKE %(q)s
			)
		"""
		params["q"] = f"%{query}%"

	total = frappe.db.sql(
		f"SELECT COUNT(*) FROM `tabUser` WHERE {conditions}",
		params
	)[0][0]

	users_raw = frappe.db.sql(
		f"""SELECT `name`, `full_name`, `user_image`, `phone`, `mobile_no`
			FROM `tabUser`
			WHERE {conditions}
			ORDER BY `full_name` ASC
			LIMIT %(limit)s OFFSET %(offset)s""",
		{**params, "limit": page_size, "offset": offset},
		as_dict=True
	)

	# Enrich with presence data from Redis
	users = []
	for user in users_raw:
		cache_key = f"f_icecore:presence:{user.name}"
		presence = frappe.cache().get_value(cache_key)

		status = "offline"
		last_seen = None
		if presence and presence.get("status") != "offline":
			status = presence.get("status", "offline")
			last_seen = presence.get("last_seen")

		users.append({
			"user": user.name,
			"full_name": user.full_name or user.name,
			"user_image": user.user_image,
			"phone": user.phone,
			"mobile_no": user.mobile_no,
			"status": status,
			"last_seen": last_seen
		})

	total_pages = math.ceil(total / page_size) if total > 0 else 1

	return {
		"users": users,
		"total": total,
		"page": page,
		"page_size": page_size,
		"total_pages": total_pages
	}


def cleanup_stale_presence():
	pass

def handle_presence_update(data):
	update_presence(status=data.get("status", "online"), metadata=data.get("metadata"))
