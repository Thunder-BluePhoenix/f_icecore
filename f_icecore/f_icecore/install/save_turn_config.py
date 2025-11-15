"""
Save TURN configuration to F IceCore Settings
Called after Coturn installation
"""

import frappe
import sys


def save_turn_credentials(server, secret, stun_port=3478, turn_port=3478, turns_port=5349):
	"""
	Save TURN credentials to F IceCore Settings

	Args:
		server: TURN server hostname/IP
		secret: TURN shared secret
		stun_port: STUN port (default: 3478)
		turn_port: TURN port (default: 3478)
		turns_port: TURNS port (default: 5349)
	"""
	try:
		# Initialize Frappe
		frappe.init(site=frappe.local.site)
		frappe.connect()

		# Get or create settings
		if not frappe.db.exists("F IceCore Settings", "F IceCore Settings"):
			settings = frappe.new_doc("F IceCore Settings")
		else:
			settings = frappe.get_doc("F IceCore Settings", "F IceCore Settings")

		# Update settings
		settings.turn_server = server
		settings.turn_secret = secret
		settings.stun_port = stun_port
		settings.turn_port = turn_port
		settings.turns_port = turns_port

		# Save
		settings.save(ignore_permissions=True)
		frappe.db.commit()

		print(f"✅ TURN credentials saved to F IceCore Settings")
		print(f"   Server: {server}")
		print(f"   Ports: STUN={stun_port}, TURN={turn_port}, TURNS={turns_port}")

		return True

	except Exception as e:
		print(f"❌ Failed to save TURN credentials: {str(e)}")
		return False

	finally:
		frappe.destroy()


if __name__ == "__main__":
	if len(sys.argv) < 3:
		print("Usage: python save_turn_config.py <site> <server> <secret> [stun_port] [turn_port] [turns_port]")
		sys.exit(1)

	site = sys.argv[1]
	server = sys.argv[2]
	secret = sys.argv[3]
	stun_port = int(sys.argv[4]) if len(sys.argv) > 4 else 3478
	turn_port = int(sys.argv[5]) if len(sys.argv) > 5 else 3478
	turns_port = int(sys.argv[6]) if len(sys.argv) > 6 else 5349

	# Set site
	frappe.local.site = site

	# Save credentials
	success = save_turn_credentials(server, secret, stun_port, turn_port, turns_port)

	sys.exit(0 if success else 1)
