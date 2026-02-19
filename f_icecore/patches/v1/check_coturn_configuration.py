"""
Patch: Auto-detect Coturn configuration and populate F IceCore Settings.

Checks if Coturn is installed and properly configured.
If credentials file exists from install_coturn.sh, auto-populates settings.
If configuration is missing or invalid, logs a warning.
"""

import frappe
import os
import subprocess
import json


def execute():
	"""
	Check Coturn installation and populate TURN settings if needed.
	Runs as a post_model_sync patch (once) and also from after_migrate hook.
	"""
	try:
		_check_and_populate_turn_config()
	except Exception as e:
		frappe.log_error(f"F-IceCore: TURN config check failed: {e}", "TURN Config Check")


def _check_and_populate_turn_config():
	"""Core logic: detect Coturn, validate config, populate if needed."""

	settings = frappe.get_doc("F IceCore Settings", "F IceCore Settings")

	# Check if TURN config is already properly set
	from frappe.utils.password import get_decrypted_password
	existing_secret = get_decrypted_password(
		"F IceCore Settings", "F IceCore Settings", "turn_secret", raise_exception=False
	)

	if settings.turn_server and existing_secret:
		# Config exists — validate it
		is_valid = _validate_turn_config(settings.turn_server, existing_secret,
			settings.stun_port or 3478, settings.turn_port or 3478, settings.turns_port or 5349)
		if is_valid:
			print("✅ F-IceCore: TURN/STUN configuration is valid")
			return
		else:
			print("⚠️ F-IceCore: TURN/STUN configuration exists but may be invalid")

	# No valid config — try to auto-detect from Coturn credentials file
	cred_file = _find_credentials_file()
	if cred_file:
		print(f"📄 F-IceCore: Found Coturn credentials file: {cred_file}")
		populated = _populate_from_credentials_file(cred_file, settings)
		if populated:
			print("✅ F-IceCore: TURN settings auto-populated from Coturn credentials")
			return

	# Try to detect from turnserver.conf
	conf_data = _read_turnserver_conf()
	if conf_data:
		print("📄 F-IceCore: Found turnserver.conf, extracting configuration...")
		populated = _populate_from_turnserver_conf(conf_data, settings)
		if populated:
			print("✅ F-IceCore: TURN settings auto-populated from turnserver.conf")
			return

	# No Coturn found — check if coturn binary exists
	coturn_installed = _is_coturn_installed()
	if coturn_installed:
		print("⚠️ F-IceCore: Coturn is installed but not configured in F IceCore Settings")
		print("   → Run: sudo bash install_scripts/install_coturn.sh")
		print("   → Or use 'Generate & Populate Credentials' button in F IceCore Settings")
	else:
		print("ℹ️ F-IceCore: Coturn is not installed. WebRTC calls will use fallback STUN only.")
		print("   → For reliable NAT traversal, install Coturn:")
		print("   → sudo bash install_scripts/install_coturn.sh")


def _validate_turn_config(server, secret, stun_port, turn_port, turns_port):
	"""Validate that the TURN config makes sense."""
	try:
		if not server or not secret:
			return False
		if len(secret) < 10:
			return False
		if not stun_port or not turn_port:
			return False
		# Try generating test credentials
		import hmac, hashlib, base64, time
		timestamp = int(time.time()) + 300
		username = f"{timestamp}:test_user"
		cred = hmac.new(secret.encode('utf-8'), username.encode('utf-8'), hashlib.sha1).digest()
		cred_b64 = base64.b64encode(cred).decode('utf-8')
		return bool(cred_b64)
	except Exception:
		return False


def _find_credentials_file():
	"""Look for the Coturn credentials file created by install_coturn.sh."""
	possible_paths = [
		"/etc/coturn/f_icecore_credentials.txt",
		"/usr/local/etc/coturn/f_icecore_credentials.txt",
		"/usr/local/etc/f_icecore_credentials.txt",
		"/opt/homebrew/etc/f_icecore_credentials.txt",
		os.path.expanduser("~/.f_icecore/coturn_credentials.txt"),
	]
	# Also check Homebrew prefix if on macOS
	try:
		result = subprocess.run(['brew', '--prefix'], capture_output=True, text=True, timeout=5)
		if result.returncode == 0:
			brew_prefix = result.stdout.strip()
			possible_paths.insert(0, os.path.join(brew_prefix, "etc", "f_icecore_credentials.txt"))
	except Exception:
		pass

	for path in possible_paths:
		if os.path.exists(path):
			return path
	return None


def _populate_from_credentials_file(filepath, settings):
	"""Parse the credentials file and populate settings."""
	try:
		data = {}
		with open(filepath, 'r') as f:
			for line in f:
				line = line.strip()
				if '=' in line and not line.startswith('#'):
					key, val = line.split('=', 1)
					data[key.strip()] = val.strip()

		server = data.get('TURN_SERVER') or data.get('SERVER') or data.get('server')
		secret = data.get('TURN_SECRET') or data.get('SECRET') or data.get('secret')

		if not server or not secret:
			return False

		stun_port = int(data.get('STUN_PORT', '3478'))
		turn_port = int(data.get('TURN_PORT', '3478'))
		turns_port = int(data.get('TURNS_PORT', '5349'))

		settings.turn_server = server
		settings.turn_secret = secret
		settings.stun_port = stun_port
		settings.turn_port = turn_port
		settings.turns_port = turns_port
		settings.save(ignore_permissions=True)
		frappe.db.commit()
		return True

	except Exception as e:
		print(f"⚠️ F-IceCore: Failed to read credentials file: {e}")
		return False


def _read_turnserver_conf():
	"""Read turnserver.conf and extract relevant settings."""
	possible_paths = [
		"/etc/turnserver.conf",
		"/etc/coturn/turnserver.conf",
		"/usr/local/etc/turnserver.conf",
		"/opt/homebrew/etc/turnserver.conf",
	]
	# Also check Homebrew prefix if on macOS
	try:
		result = subprocess.run(['brew', '--prefix'], capture_output=True, text=True, timeout=5)
		if result.returncode == 0:
			brew_prefix = result.stdout.strip()
			possible_paths.insert(0, os.path.join(brew_prefix, "etc", "turnserver.conf"))
	except Exception:
		pass
	for path in possible_paths:
		if os.path.exists(path):
			try:
				with open(path, 'r') as f:
					return f.read()
			except PermissionError:
				continue
	return None


def _populate_from_turnserver_conf(conf_content, settings):
	"""Parse turnserver.conf and populate settings."""
	try:
		data = {}
		for line in conf_content.split('\n'):
			line = line.strip()
			if line and not line.startswith('#'):
				if '=' in line:
					key, val = line.split('=', 1)
					data[key.strip()] = val.strip()

		secret = data.get('static-auth-secret')
		realm = data.get('realm')
		external_ip = data.get('external-ip')
		listening_port = data.get('listening-port', '3478')
		tls_port = data.get('tls-listening-port', '5349')

		if not secret:
			return False

		# Determine server address: external-ip > realm > localhost
		server = external_ip or realm or 'localhost'
		# Remove CIDR notation if present (e.g., "1.2.3.4/24")
		if '/' in server:
			server = server.split('/')[0]

		settings.turn_server = server
		settings.turn_secret = secret
		settings.stun_port = int(listening_port)
		settings.turn_port = int(listening_port)
		settings.turns_port = int(tls_port)
		settings.save(ignore_permissions=True)
		frappe.db.commit()
		return True

	except Exception as e:
		print(f"⚠️ F-IceCore: Failed to parse turnserver.conf: {e}")
		return False


def _is_coturn_installed():
	"""Check if the coturn binary is available."""
	try:
		result = subprocess.run(['which', 'turnserver'], capture_output=True, text=True, timeout=5)
		return result.returncode == 0
	except Exception:
		return False
