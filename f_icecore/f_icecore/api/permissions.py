import frappe

def has_app_permission(user=None):
	if not user:
		user = frappe.session.user
	if user == "Administrator":
		return True
	if frappe.db.get_value("User", user, "user_type") != "System User":
		return False
	return frappe.db.get_value("User", user, "enabled")

def can_call_user(caller, target):
	if caller == target:
		return False, "Cannot call yourself"
	if not has_app_permission(caller):
		return False, "You don't have permission"
	if not frappe.db.exists("User", {"name": target, "enabled": 1}):
		return False, "User not found"
	return True, ""

@frappe.whitelist()
def check_call_permission(target_user):
	caller = frappe.session.user
	can_call, reason = can_call_user(caller, target_user)
	return {"can_call": can_call, "reason": reason}
