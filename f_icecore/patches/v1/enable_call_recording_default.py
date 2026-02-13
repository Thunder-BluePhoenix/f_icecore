"""
Patch: Set enable_call_recording to 1 (enabled) by default.

This field was added after the F IceCore Settings doc was created,
so existing installations have it as 0 (unchecked). This patch
ensures call recording works out of the box.
"""

import frappe


def execute():
	try:
		frappe.db.set_single_value("F IceCore Settings", "enable_call_recording", 1)
		frappe.db.commit()
	except Exception:
		pass
