import frappe
from datetime import datetime

@frappe.whitelist()
def debug_redis_presence():
	"""
	Debug: Show ALL presence data in Redis
	"""
	# Get all system users
	all_users = frappe.get_all(
		"User",
		filters={"enabled": 1, "user_type": "System User"},
		fields=["name", "full_name"]
	)

	result = {
		"total_users": len(all_users),
		"current_user": frappe.session.user,
		"presence_data": []
	}

	for user in all_users:
		cache_key = f"f_icecore:presence:{user.name}"
		presence = frappe.cache().get_value(cache_key)

		result["presence_data"].append({
			"user": user.name,
			"full_name": user.full_name or user.name,
			"cache_key": cache_key,
			"has_presence": presence is not None,
			"presence": presence
		})

	return result
