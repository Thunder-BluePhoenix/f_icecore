import frappe
from frappe.realtime import publish_realtime
from datetime import datetime

PRESENCE_TTL = 300

@frappe.whitelist()
def update_presence(status="online", metadata=None):
	user = frappe.session.user
	presence_data = {"user": user, "status": status, "last_seen": datetime.now().isoformat(), "metadata": metadata}
	cache_key = f"f_icecore:presence:{user}"
	frappe.cache().set_value(cache_key, presence_data, expires_in_sec=PRESENCE_TTL)
	return presence_data

@frappe.whitelist()
def heartbeat():
	user = frappe.session.user
	cache_key = f"f_icecore:presence:{user}"
	presence = frappe.cache().get_value(cache_key) or {"user": user, "status": "online", "metadata": None}
	presence["last_seen"] = datetime.now().isoformat()
	frappe.cache().set_value(cache_key, presence, expires_in_sec=PRESENCE_TTL)
	return presence

@frappe.whitelist()
def get_online_users():
	all_users = frappe.get_all("User", filters={"enabled": 1, "user_type": "System User"}, 
		fields=["name", "full_name", "user_image"])
	online_users = []
	for user in all_users:
		presence = frappe.cache().get_value(f"f_icecore:presence:{user.name}")
		if presence and presence.get("status") != "offline":
			online_users.append({**user, "status": presence.get("status"), "last_seen": presence.get("last_seen")})
	return online_users

@frappe.whitelist()
def get_user_presence(user):
	presence = frappe.cache().get_value(f"f_icecore:presence:{user}")
	return presence or {"user": user, "status": "offline", "last_seen": None}

@frappe.whitelist()
def get_call_capable_users():
	online_users = get_online_users()
	return [u for u in online_users if u.get("status") not in ["in_call", "busy", "offline"]]

def cleanup_stale_presence():
	pass

def handle_presence_update(data):
	update_presence(status=data.get("status", "online"), metadata=data.get("metadata"))
