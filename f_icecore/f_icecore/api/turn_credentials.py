import frappe
from frappe.utils.password import get_decrypted_password
import hmac, hashlib, base64, time

@frappe.whitelist()
def get_turn_credentials(ttl=86400):
	turn_config = get_turn_config()
	if not turn_config.get("secret"):
		frappe.throw("TURN server not configured")

	server = turn_config['server']
	# Remove port from server string if it's already there (e.g. "1.2.3.4:3478")
	if ":" in server:
		server = server.split(":")[0]

	username, credential = generate_turn_credentials(turn_config["secret"], ttl)
	ice_servers = [
		{"urls": f"stun:{server}:{turn_config.get('stun_port', 3478)}"},
		{"urls": [f"turn:{server}:{turn_config.get('turn_port', 3478)}?transport=udp"],
		 "username": username, "credential": credential, "credentialType": "password"}
	]
	return {"ice_servers": ice_servers, "ttl": ttl, "expires_at": int(time.time()) + ttl}

def generate_turn_credentials(secret, ttl=86400):
	user = frappe.session.user
	timestamp = int(time.time()) + ttl
	username = f"{timestamp}:{user}"
	credential = hmac.new(secret.encode('utf-8'), username.encode('utf-8'), hashlib.sha1).digest()
	credential = base64.b64encode(credential).decode('utf-8')
	return username, credential

def get_turn_config():
	"""
	Get TURN configuration from F IceCore Settings DocType
	Properly decrypts password field using get_password()
	"""
	# First try to get from F IceCore Settings DocType
	if frappe.db.exists("F IceCore Settings", "F IceCore Settings"):
		settings = frappe.get_doc("F IceCore Settings", "F IceCore Settings")

		# Get the decrypted password using get_decrypted_password()
		# This is the correct way to read Password fields in Frappe
		turn_secret = get_decrypted_password(
			"F IceCore Settings",
			"F IceCore Settings",
			"turn_secret",
			raise_exception=False
		)

		if settings.turn_server and turn_secret:
			return {
				"server": settings.turn_server,
				"secret": turn_secret,  # Decrypted value
				"stun_port": settings.stun_port or 3478,
				"turn_port": settings.turn_port or 3478,
				"turns_port": settings.turns_port or 5349
			}

	# Fallback to frappe.conf (for backward compatibility)
	turn_config = frappe.conf.get("f_icecore_turn", {})
	if turn_config and turn_config.get("secret"):
		return turn_config

	# Return empty config if nothing found
	return {
		"server": frappe.conf.get("host_name", "localhost"),
		"secret": "",
		"stun_port": 3478,
		"turn_port": 3478,
		"turns_port": 5349
	}

@frappe.whitelist()
def get_ice_servers():
	creds = get_turn_credentials()
	return creds["ice_servers"]

@frappe.whitelist()
def test_turn_connection():
	"""
	Test TURN server connection
	Returns detailed config info for verification
	"""
	turn_config = get_turn_config()

	# Check if server is configured
	if not turn_config.get("server"):
		return {
			"success": False,
			"message": "TURN server address not configured"
		}

	# Check if secret is configured
	if not turn_config.get("secret"):
		return {
			"success": False,
			"message": "TURN server secret not configured"
		}

	# Generate test credentials
	try:
		username, credential = generate_turn_credentials(turn_config["secret"], ttl=300)
	except Exception as e:
		return {
			"success": False,
			"message": f"Error generating credentials: {str(e)}"
		}

	# Return success with full config
	return {
		"success": True,
		"message": "TURN server configured correctly",
		"config": {
			"server": turn_config["server"],
			"ports": {
				"stun": turn_config.get("stun_port", 3478),
				"turn": turn_config.get("turn_port", 3478),
				"turns": turn_config.get("turns_port", 5349)
			},
			"username_format": username.split(":")[1] if ":" in username else "unknown",
			"credential_generated": bool(credential)
		}
	}
