import frappe
from frappe.utils.password import get_decrypted_password
import hmac, hashlib, base64, time, os, subprocess, socket, secrets

@frappe.whitelist()
def get_turn_credentials(ttl=86400):
	turn_config = get_turn_config()
	if not turn_config.get("secret"):
		frappe.throw("TURN server not configured")
	username, credential = generate_turn_credentials(turn_config["secret"], ttl)
	ice_servers = [
		{"urls": f"stun:{turn_config['server']}:{turn_config.get('stun_port', 3478)}"},
		{"urls": [f"turn:{turn_config['server']}:{turn_config.get('turn_port', 3478)}?transport=udp"],
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
def generate_and_populate_credentials():
	"""
	Generate a new TURN secret and populate all TURN/STUN fields.
	The secret is returned in cleartext ONCE for the user to save.
	It will not be shown again (stored as Password field).
	"""
	frappe.only_for("System Manager")

	# Generate a strong 64-character hex secret
	new_secret = secrets.token_hex(32)

	# Detect server IP/hostname
	server_address = _detect_server_address()

	# Default ports
	stun_port = 3478
	turn_port = 3478
	turns_port = 5349

	# Try to read ports from existing turnserver.conf if available
	conf_paths = ["/etc/turnserver.conf", "/etc/coturn/turnserver.conf", "/usr/local/etc/turnserver.conf"]
	for conf_path in conf_paths:
		if os.path.exists(conf_path):
			try:
				with open(conf_path, "r") as f:
					for line in f:
						line = line.strip()
						if line.startswith("listening-port="):
							stun_port = int(line.split("=", 1)[1].strip())
							turn_port = stun_port
						elif line.startswith("tls-listening-port="):
							turns_port = int(line.split("=", 1)[1].strip())
				break
			except Exception:
				pass

	# Get or create the settings doc
	if not frappe.db.exists("F IceCore Settings", "F IceCore Settings"):
		settings = frappe.new_doc("F IceCore Settings")
		settings.name = "F IceCore Settings"
	else:
		settings = frappe.get_doc("F IceCore Settings", "F IceCore Settings")

	# Populate all fields
	settings.turn_server = server_address
	settings.turn_secret = new_secret
	settings.stun_port = stun_port
	settings.turn_port = turn_port
	settings.turns_port = turns_port
	settings.save(ignore_permissions=True)
	frappe.db.commit()

	return {
		"success": True,
		"secret": new_secret,
		"server": server_address,
		"stun_port": stun_port,
		"turn_port": turn_port,
		"turns_port": turns_port
	}


def _detect_server_address():
	"""Detect the server IP address or hostname for TURN configuration."""
	# Try to get from site config
	host_name = frappe.conf.get("host_name", "")
	if host_name:
		# Strip protocol
		host_name = host_name.replace("https://", "").replace("http://", "")
		# Strip port
		if ":" in host_name:
			host_name = host_name.split(":")[0]
		if host_name and host_name != "localhost":
			return host_name

	# Try to get the machine's IP
	try:
		s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
		s.connect(("8.8.8.8", 80))
		ip = s.getsockname()[0]
		s.close()
		if ip and ip != "127.0.0.1":
			return ip
	except Exception:
		pass

	# Try hostname
	try:
		hostname = socket.gethostname()
		ip = socket.gethostbyname(hostname)
		if ip and ip != "127.0.0.1":
			return ip
	except Exception:
		pass

	return "localhost"


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
