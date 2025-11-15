"""
Tests for F-IceCore Call Session API
"""

import frappe
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch


class TestCallSession(unittest.TestCase):
	"""Test call session management"""

	def setUp(self):
		"""Set up test environment"""
		frappe.set_user("Administrator")
		self.test_user = "caller@example.com"
		self.remote_user = "callee@example.com"

	def tearDown(self):
		"""Clean up after tests"""
		# Delete test call sessions
		frappe.db.delete("F IceCore Call Session")
		frappe.db.commit()

	def test_create_call_session(self):
		"""Test creating a call session"""
		from f_icecore.f_icecore.api.call_session import create_call_session

		session = create_call_session(
			from_user=self.test_user,
			to_user=self.remote_user,
			call_type="audio"
		)

		# Verify session created
		self.assertIsNotNone(session)
		self.assertEqual(session["from_user"], self.test_user)
		self.assertEqual(session["to_user"], self.remote_user)
		self.assertEqual(session["call_type"], "audio")
		self.assertEqual(session["status"], "Initiated")

	def test_update_call_status(self):
		"""Test updating call status"""
		from f_icecore.f_icecore.api.call_session import (
			create_call_session,
			update_call_status
		)

		# Create session
		session = create_call_session(
			from_user=self.test_user,
			to_user=self.remote_user,
			call_type="video"
		)

		# Update to ringing
		updated = update_call_status(session["name"], "Ringing")
		self.assertEqual(updated["status"], "Ringing")

		# Update to answered
		updated = update_call_status(session["name"], "Answered")
		self.assertEqual(updated["status"], "Answered")
		self.assertIsNotNone(updated.get("start_time"))

	def test_end_call_sets_duration(self):
		"""Test that ending call calculates duration"""
		from f_icecore.f_icecore.api.call_session import (
			create_call_session,
			update_call_status,
			end_call
		)

		# Create and answer call
		session = create_call_session(
			from_user=self.test_user,
			to_user=self.remote_user,
			call_type="audio"
		)
		update_call_status(session["name"], "Answered")

		# End call
		ended = end_call(session["name"])

		# Verify status and duration
		self.assertEqual(ended["status"], "Ended")
		self.assertIsNotNone(ended.get("end_time"))
		self.assertIsNotNone(ended.get("duration"))
		self.assertGreaterEqual(ended["duration"], 0)

	def test_get_call_history(self):
		"""Test getting call history"""
		from f_icecore.f_icecore.api.call_session import (
			create_call_session,
			get_call_history
		)

		frappe.session.user = self.test_user

		# Create multiple call sessions
		create_call_session(self.test_user, self.remote_user, "audio")
		create_call_session(self.test_user, "other@example.com", "video")
		create_call_session(self.remote_user, self.test_user, "audio")

		# Get history
		history = get_call_history(limit=10)

		# Verify results
		self.assertIsInstance(history, list)
		self.assertGreater(len(history), 0)

		# Verify all calls involve test user
		for call in history:
			involves_user = (
				call["from_user"] == self.test_user or
				call["to_user"] == self.test_user
			)
			self.assertTrue(involves_user)

	def test_get_call_stats(self):
		"""Test getting call statistics"""
		from f_icecore.f_icecore.api.call_session import (
			create_call_session,
			update_call_status,
			end_call,
			get_call_stats
		)

		frappe.session.user = self.test_user

		# Create answered call
		session1 = create_call_session(self.test_user, self.remote_user, "audio")
		update_call_status(session1["name"], "Answered")
		end_call(session1["name"])

		# Create missed call
		session2 = create_call_session(self.remote_user, self.test_user, "video")
		update_call_status(session2["name"], "Missed")

		# Get stats
		stats = get_call_stats()

		# Verify stats
		self.assertIn("total_calls", stats)
		self.assertIn("answered_calls", stats)
		self.assertIn("missed_calls", stats)
		self.assertIn("total_duration_minutes", stats)
		self.assertIn("answer_rate", stats)

		self.assertGreater(stats["total_calls"], 0)

	def test_cleanup_old_sessions(self):
		"""Test cleanup of old call sessions"""
		from f_icecore.f_icecore.api.call_session import cleanup_old_sessions

		# Create old session (simulate by modifying creation date)
		session = frappe.new_doc("F IceCore Call Session")
		session.from_user = self.test_user
		session.to_user = self.remote_user
		session.call_type = "audio"
		session.status = "Ended"
		session.insert(ignore_permissions=True)

		# Manually set old creation date
		old_date = datetime.now() - timedelta(days=100)
		frappe.db.set_value(
			"F IceCore Call Session",
			session.name,
			"creation",
			old_date
		)
		frappe.db.commit()

		# Run cleanup
		deleted_count = cleanup_old_sessions(days=90)

		# Verify cleanup ran
		self.assertIsInstance(deleted_count, int)

	def test_call_history_enriched_with_user_details(self):
		"""Test that call history includes user full names"""
		from f_icecore.f_icecore.api.call_session import (
			create_call_session,
			get_call_history
		)

		frappe.session.user = self.test_user

		# Create call
		create_call_session(self.test_user, self.remote_user, "audio")

		# Get history
		history = get_call_history(limit=10)

		# Verify enrichment
		if len(history) > 0:
			call = history[0]
			self.assertIn("other_user", call)
			self.assertIn("other_user_name", call)
			self.assertIn("direction", call)

	def test_call_types_validated(self):
		"""Test that call types are validated"""
		from f_icecore.f_icecore.api.call_session import create_call_session

		# Valid call types should work
		for call_type in ["audio", "video", "screen"]:
			session = create_call_session(
				self.test_user,
				self.remote_user,
				call_type
			)
			self.assertEqual(session["call_type"], call_type)

		# Invalid call type should fail
		with self.assertRaises(frappe.ValidationError):
			create_call_session(
				self.test_user,
				self.remote_user,
				"invalid_type"
			)

	def test_call_status_transitions(self):
		"""Test valid call status transitions"""
		from f_icecore.f_icecore.api.call_session import (
			create_call_session,
			update_call_status
		)

		session = create_call_session(
			self.test_user,
			self.remote_user,
			"audio"
		)

		# Valid transitions
		valid_statuses = ["Initiated", "Ringing", "Answered", "Ended"]

		for status in valid_statuses[1:]:  # Skip Initiated (already set)
			updated = update_call_status(session["name"], status)
			self.assertEqual(updated["status"], status)


def run_tests():
	"""Run all call session tests"""
	suite = unittest.TestLoader().loadTestsFromTestCase(TestCallSession)
	unittest.TextTestRunner(verbosity=2).run(suite)


if __name__ == "__main__":
	run_tests()
