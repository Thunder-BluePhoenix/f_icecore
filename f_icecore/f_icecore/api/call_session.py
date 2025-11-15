import frappe
from datetime import datetime, timedelta
import json

@frappe.whitelist()
def get_active_calls():
	user = frappe.session.user
	active_calls = frappe.get_all("F IceCore Call Session", 
		filters={"status": ["in", ["Ringing", "Active"]], "or_filters": [{"from_user": user}, {"to_user": user}]},
		fields=["name", "from_user", "to_user", "call_type", "status", "creation"], order_by="creation desc")
	for call in active_calls:
		other_user = call.to_user if call.from_user == user else call.from_user
		call["other_user"] = other_user
		call["other_user_name"] = frappe.db.get_value("User", other_user, "full_name")
	return active_calls

@frappe.whitelist()
def get_call_history(limit=50):
	user = frappe.session.user
	history = frappe.get_all("F IceCore Call Session",
		filters={"or_filters": [{"from_user": user}, {"to_user": user}]},
		fields=["name", "from_user", "to_user", "call_type", "status", "creation", "duration"],
		order_by="creation desc", limit=limit)
	for call in history:
		other_user = call.to_user if call.from_user == user else call.from_user
		call["other_user_name"] = frappe.db.get_value("User", other_user, "full_name")
		call["direction"] = "incoming" if call.to_user == user else "outgoing"
	return history

@frappe.whitelist()
def get_call_stats():
	user = frappe.session.user
	total_calls = frappe.db.count("F IceCore Call Session", filters={"or_filters": [{"from_user": user}, {"to_user": user}]})
	answered_calls = frappe.db.count("F IceCore Call Session", 
		filters={"status": ["in", ["Active", "Ended"]], "or_filters": [{"from_user": user}, {"to_user": user}]})
	return {"total_calls": total_calls, "answered_calls": answered_calls, "missed_calls": 0, 
		"total_duration_seconds": 0, "total_duration_minutes": 0, "recent_calls_7d": 0, "answer_rate": 0}

@frappe.whitelist()
def search_users_for_call(query):
	user = frappe.session.user
	users = frappe.get_all("User", filters={"enabled": 1, "user_type": "System User", "name": ["!=", user],
		"or_filters": [{"full_name": ["like", f"%{query}%"]}, {"email": ["like", f"%{query}%"]}]},
		fields=["name", "full_name", "email", "user_image"], limit=20)
	return users

def cleanup_old_sessions():
	cutoff_date = datetime.now() - timedelta(days=90)
	frappe.db.sql("DELETE FROM `tabF IceCore Call Session` WHERE creation < %s AND status IN ('Ended', 'Rejected')", (cutoff_date,))
	frappe.db.commit()
