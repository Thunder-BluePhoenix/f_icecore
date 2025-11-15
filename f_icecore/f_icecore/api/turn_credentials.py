import frappe
import hmac, hashlib, base64, time

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
	turn_config = frappe.conf.get("f_icecore_turn", {})
	if turn_config and turn_config.get("secret"):
		return turn_config
	return {"server": frappe.conf.get("host_name", "localhost"), "secret": "", "stun_port": 3478, "turn_port": 3478, "turns_port": 5349}

@frappe.whitelist()
def get_ice_servers():
	creds = get_turn_credentials()
	return creds["ice_servers"]

@frappe.whitelist()
def test_turn_connection():
	turn_config = get_turn_config()
	if not turn_config.get("secret"):
		return {"success": False, "message": "TURN server secret not configured"}
	username, credential = generate_turn_credentials(turn_config["secret"], ttl=300)
	return {"success": True, "message": "TURN server configured", 
		"config": {"server": turn_config["server"], "ports": {"stun": turn_config.get("stun_port", 3478)}}}
