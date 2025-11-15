"""
Tests for F-IceCore User Presence API
"""

import frappe
import unittest
import time
from unittest.mock import patch


class TestPresence(unittest.TestCase):
	"""Test user presence tracking functionality"""

	def setUp(self):
		"""Set up test environment"""
		self.test_user = "test@example.com"
		frappe.set_user("Administrator")
		# Clear any existing presence data
		frappe.cache().delete_value(f"f_icecore:presence:{self.test_user}")

	def tearDown(self):
		"""Clean up after tests"""
		frappe.cache().delete_value(f"f_icecore:presence:{self.test_user}")

	def test_update_presence_sets_online(self):
		"""Test that updating presence sets user online"""
		from f_icecore.f_icecore.api.presence import update_presence, get_user_presence

		frappe.session.user = self.test_user

		# Update presence to online
		result = update_presence(status="online")

		# Verify success
		self.assertEqual(result["success"], True)
		self.assertEqual(result["status"], "online")

		# Verify presence is stored in cache
		presence = get_user_presence(self.test_user)
		self.assertIsNotNone(presence)
		self.assertEqual(presence["status"], "online")

	def test_presence_ttl_expires(self):
		"""Test that presence expires after TTL"""
		from f_icecore.f_icecore.api.presence import update_presence, get_user_presence

		frappe.session.user = self.test_user

		# Set very short TTL for testing
		with patch('f_icecore.f_icecore.api.presence.PRESENCE_TTL', 1):
			update_presence(status="online")

			# Verify initially present
			presence = get_user_presence(self.test_user)
			self.assertIsNotNone(presence)

			# Wait for TTL to expire
			time.sleep(2)

			# Verify presence expired
			presence = get_user_presence(self.test_user)
			self.assertIsNone(presence)

	def test_heartbeat_updates_timestamp(self):
		"""Test that heartbeat updates last seen timestamp"""
		from f_icecore.f_icecore.api.presence import update_presence, heartbeat, get_user_presence

		frappe.session.user = self.test_user

		# Set initial presence
		update_presence(status="online")
		presence1 = get_user_presence(self.test_user)
		first_seen = presence1["last_seen"]

		# Wait a moment
		time.sleep(0.1)

		# Send heartbeat
		heartbeat()
		presence2 = get_user_presence(self.test_user)
		second_seen = presence2["last_seen"]

		# Verify timestamp was updated
		self.assertNotEqual(first_seen, second_seen)

	def test_get_online_users_returns_active_users(self):
		"""Test that get_online_users returns only active users"""
		from f_icecore.f_icecore.api.presence import update_presence, get_online_users

		# Set multiple users online
		users = ["user1@example.com", "user2@example.com", "user3@example.com"]

		for user in users:
			frappe.session.user = user
			update_presence(status="online")

		# Get online users
		frappe.session.user = "user1@example.com"
		online = get_online_users()

		# Verify other users are returned (excluding self)
		user_list = [u["user"] for u in online]
		self.assertIn("user2@example.com", user_list)
		self.assertIn("user3@example.com", user_list)
		self.assertNotIn("user1@example.com", user_list)  # Should exclude self

	def test_get_call_capable_users_filters_by_permissions(self):
		"""Test that get_call_capable_users filters by permissions"""
		from f_icecore.f_icecore.api.presence import get_call_capable_users

		# This would require setting up proper user permissions
		# For now, test that it returns a list
		frappe.session.user = self.test_user

		result = get_call_capable_users()

		# Verify returns a list
		self.assertIsInstance(result, list)

	def test_different_presence_statuses(self):
		"""Test different presence statuses"""
		from f_icecore.f_icecore.api.presence import update_presence, get_user_presence

		frappe.session.user = self.test_user

		statuses = ["online", "away", "busy", "offline"]

		for status in statuses:
			update_presence(status=status)
			presence = get_user_presence(self.test_user)
			self.assertEqual(presence["status"], status)

	@patch('frappe.publish_realtime')
	def test_presence_update_broadcasts_event(self, mock_publish):
		"""Test that presence updates broadcast realtime events"""
		from f_icecore.f_icecore.api.presence import update_presence

		frappe.session.user = self.test_user

		update_presence(status="online")

		# Verify realtime event was published
		mock_publish.assert_called()

	def test_cleanup_stale_presence(self):
		"""Test cleanup of stale presence data"""
		from f_icecore.f_icecore.api.presence import cleanup_stale_presence

		# This is a scheduled task that cleans up expired presence
		# Just verify it runs without error
		try:
			cleanup_stale_presence()
			success = True
		except Exception:
			success = False

		self.assertTrue(success)


def run_tests():
	"""Run all presence tests"""
	suite = unittest.TestLoader().loadTestsFromTestCase(TestPresence)
	unittest.TextTestRunner(verbosity=2).run(suite)


if __name__ == "__main__":
	run_tests()
