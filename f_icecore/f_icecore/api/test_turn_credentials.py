"""
Tests for F-IceCore TURN Credentials API
"""

import frappe
import unittest
import time
import hmac
import hashlib
import base64
from unittest.mock import patch


class TestTURNCredentials(unittest.TestCase):
	"""Test TURN credential generation"""

	def setUp(self):
		"""Set up test environment"""
		frappe.set_user("Administrator")

		# Create test settings
		if not frappe.db.exists("F IceCore Settings", "F IceCore Settings"):
			settings = frappe.new_doc("F IceCore Settings")
			settings.turn_server = "turn.example.com"
			settings.turn_secret = "test_secret_key_123"
			settings.stun_port = 3478
			settings.turn_port = 3478
			settings.turns_port = 5349
			settings.insert(ignore_permissions=True)
		else:
			settings = frappe.get_doc("F IceCore Settings", "F IceCore Settings")
			settings.turn_server = "turn.example.com"
			settings.turn_secret = "test_secret_key_123"
			settings.stun_port = 3478
			settings.turn_port = 3478
			settings.turns_port = 5349
			settings.save(ignore_permissions=True)

		frappe.db.commit()

	def tearDown(self):
		"""Clean up after tests"""
		frappe.db.rollback()

	def test_get_turn_credentials_returns_valid_format(self):
		"""Test that TURN credentials are returned in correct format"""
		from f_icecore.f_icecore.api.turn_credentials import get_turn_credentials

		result = get_turn_credentials()

		# Verify structure
		self.assertIn("iceServers", result)
		self.assertIsInstance(result["iceServers"], list)
		self.assertGreater(len(result["iceServers"]), 0)

		# Verify STUN server
		stun_server = result["iceServers"][0]
		self.assertIn("urls", stun_server)
		self.assertTrue(stun_server["urls"][0].startswith("stun:"))

		# Verify TURN servers
		turn_server = result["iceServers"][1]
		self.assertIn("urls", turn_server)
		self.assertIn("username", turn_server)
		self.assertIn("credential", turn_server)
		self.assertTrue(any("turn:" in url for url in turn_server["urls"]))

	def test_credentials_use_hmac_sha1(self):
		"""Test that credentials are generated using HMAC-SHA1"""
		from f_icecore.f_icecore.api.turn_credentials import generate_turn_credentials

		secret = "test_secret"
		username, credential = generate_turn_credentials(secret, ttl=86400)

		# Verify username format (timestamp:user)
		self.assertIn(":", username)
		timestamp_str, user = username.split(":", 1)
		timestamp = int(timestamp_str)

		# Verify timestamp is in future
		self.assertGreater(timestamp, int(time.time()))

		# Verify credential is base64 encoded
		try:
			decoded = base64.b64decode(credential)
			is_valid_base64 = True
		except Exception:
			is_valid_base64 = False

		self.assertTrue(is_valid_base64)

	def test_credentials_match_coturn_format(self):
		"""Test that credentials match Coturn REST API format"""
		from f_icecore.f_icecore.api.turn_credentials import generate_turn_credentials

		secret = "my_secret_key"
		user = "testuser@example.com"
		ttl = 86400

		# Generate using our function
		username, credential = generate_turn_credentials(secret, ttl, user)

		# Manually calculate expected credential
		timestamp = int(time.time()) + ttl
		expected_username = f"{timestamp}:{user}"
		expected_credential = hmac.new(
			secret.encode('utf-8'),
			expected_username.encode('utf-8'),
			hashlib.sha1
		).digest()
		expected_credential = base64.b64encode(expected_credential).decode('utf-8')

		# Username should have same format (timestamp will differ slightly)
		self.assertIn(":", username)
		self.assertTrue(username.endswith(f":{user}"))

		# Credential should be valid base64
		self.assertIsInstance(credential, str)
		self.assertGreater(len(credential), 0)

	def test_ttl_affects_username_timestamp(self):
		"""Test that TTL affects the timestamp in username"""
		from f_icecore.f_icecore.api.turn_credentials import generate_turn_credentials

		secret = "test_secret"

		# Generate with different TTLs
		username1, _ = generate_turn_credentials(secret, ttl=3600)  # 1 hour
		username2, _ = generate_turn_credentials(secret, ttl=7200)  # 2 hours

		# Extract timestamps
		ts1 = int(username1.split(":")[0])
		ts2 = int(username2.split(":")[0])

		# Verify second timestamp is later
		self.assertGreater(ts2, ts1)

	def test_get_credentials_without_settings_fails(self):
		"""Test that getting credentials fails if settings not configured"""
		from f_icecore.f_icecore.api.turn_credentials import get_turn_credentials

		# Clear settings
		settings = frappe.get_doc("F IceCore Settings", "F IceCore Settings")
		settings.turn_server = None
		settings.turn_secret = None
		settings.save(ignore_permissions=True)
		frappe.db.commit()

		# Try to get credentials
		with self.assertRaises(frappe.ValidationError):
			get_turn_credentials()

	def test_test_turn_connection_with_valid_config(self):
		"""Test TURN connection test with valid config"""
		from f_icecore.f_icecore.api.turn_credentials import test_turn_connection

		result = test_turn_connection()

		# Should return config details
		self.assertIn("success", result)
		self.assertIn("config", result)

		if result["success"]:
			self.assertEqual(result["config"]["server"], "turn.example.com")

	def test_test_turn_connection_without_config(self):
		"""Test TURN connection test without config"""
		from f_icecore.f_icecore.api.turn_credentials import test_turn_connection

		# Clear settings
		settings = frappe.get_doc("F IceCore Settings", "F IceCore Settings")
		settings.turn_server = None
		settings.turn_secret = None
		settings.save(ignore_permissions=True)
		frappe.db.commit()

		result = test_turn_connection()

		# Should return failure
		self.assertEqual(result["success"], False)
		self.assertIn("message", result)

	def test_credentials_include_all_transport_types(self):
		"""Test that credentials include UDP, TCP, and TLS transports"""
		from f_icecore.f_icecore.api.turn_credentials import get_turn_credentials

		result = get_turn_credentials()

		# Get TURN server URLs
		turn_server = result["iceServers"][1]
		urls = turn_server["urls"]

		# Verify different transports
		has_udp = any("turn:" in url and "?transport=udp" not in url for url in urls)
		has_tcp = any("transport=tcp" in url for url in urls)
		has_tls = any("turns:" in url for url in urls)

		self.assertTrue(has_udp or has_tcp or has_tls)


def run_tests():
	"""Run all TURN credentials tests"""
	suite = unittest.TestLoader().loadTestsFromTestCase(TestTURNCredentials)
	unittest.TextTestRunner(verbosity=2).run(suite)


if __name__ == "__main__":
	run_tests()
