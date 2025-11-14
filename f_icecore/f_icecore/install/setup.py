import frappe

def post_install():
	frappe.msgprint("F-IceCore installed successfully! 🎉", title="Installation Complete", indicator="green")
	frappe.log_error("F-IceCore: Installation completed", "F-IceCore Installation")
