"""
Tests for F-IceCore WebRTC Signaling API
"""

import frappe
import unittest
from unittest.mock import patch, MagicMock


class TestSignaling(unittest.TestCase):
	"""Test WebRTC signaling functionality"""

	def setUp(self):
		"""Set up test environment"""
		self.test_user = "test@example.com"
		self.remote_user = "remote@example.com"
		frappe.set_user("Administrator")

	def tearDown(self):
		"""Clean up after tests"""
		frappe.db.rollback()

	@patch('frappe.publish_realtime')
	def test_initiate_call_creates_session(self, mock_publish):
		"""Test that initiating a call creates a call session"""
		from f_icecore.f_icecore.api.signaling import initiate_call

		# Mock current user
		frappe.session.user = self.test_user

		# Initiate call
		result = initiate_call(
			to_user=self.remote_user,
			call_type="audio"
		)

		# Verify session created
		self.assertIsNotNone(result)
		self.assertIn("call_id", result)
		self.assertEqual(result["status"], "Initiated")

		# Verify realtime event was published
		mock_publish.assert_called_once()
		call_args = mock_publish.call_args
		self.assertIn("f_icecore:incoming_call", call_args[1]["event"])

	@patch('frappe.publish_realtime')
	def test_send_offer_publishes_to_remote_user(self, mock_publish):
		"""Test that sending offer publishes SDP to remote user"""
		from f_icecore.f_icecore.api.signaling import send_offer

		frappe.session.user = self.test_user

		test_sdp = "v=0\r\no=- 123456 1 IN IP4 127.0.0.1"

		result = send_offer(
			to_user=self.remote_user,
			offer_sdp=test_sdp
		)

		# Verify success
		self.assertEqual(result["success"], True)

		# Verify realtime published
		mock_publish.assert_called_once()
		call_args = mock_publish.call_args
		self.assertEqual(call_args[1]["user"], self.remote_user)
		self.assertIn("offer", call_args[1]["message"])

	@patch('frappe.publish_realtime')
	def test_send_answer_publishes_to_caller(self, mock_publish):
		"""Test that sending answer publishes SDP to caller"""
		from f_icecore.f_icecore.api.signaling import send_answer

		frappe.session.user = self.remote_user

		test_sdp = "v=0\r\no=- 654321 1 IN IP4 127.0.0.1"

		result = send_answer(
			to_user=self.test_user,
			answer_sdp=test_sdp
		)

		# Verify success
		self.assertEqual(result["success"], True)

		# Verify realtime published
		mock_publish.assert_called_once()

	@patch('frappe.publish_realtime')
	def test_send_ice_candidate_publishes_to_peer(self, mock_publish):
		"""Test that ICE candidates are sent to peer"""
		from f_icecore.f_icecore.api.signaling import send_ice_candidate

		frappe.session.user = self.test_user

		test_candidate = {
			"candidate": "candidate:1 1 UDP 2130706431 192.168.1.100 54321 typ host",
			"sdpMid": "0",
			"sdpMLineIndex": 0
		}

		result = send_ice_candidate(
			to_user=self.remote_user,
			candidate=test_candidate
		)

		# Verify success
		self.assertEqual(result["success"], True)

		# Verify realtime published
		mock_publish.assert_called_once()
		call_args = mock_publish.call_args
		self.assertIn("ice_candidate", call_args[1]["message"])

	def test_cannot_call_self(self):
		"""Test that users cannot call themselves"""
		from f_icecore.f_icecore.api.signaling import initiate_call

		frappe.session.user = self.test_user

		# Try to call self
		with self.assertRaises(frappe.ValidationError):
			initiate_call(
				to_user=self.test_user,
				call_type="audio"
			)

	def test_invalid_call_type_rejected(self):
		"""Test that invalid call types are rejected"""
		from f_icecore.f_icecore.api.signaling import initiate_call

		frappe.session.user = self.test_user

		# Try invalid call type
		with self.assertRaises(frappe.ValidationError):
			initiate_call(
				to_user=self.remote_user,
				call_type="invalid_type"
			)


def run_tests():
	"""Run all signaling tests"""
	suite = unittest.TestLoader().loadTestsFromTestCase(TestSignaling)
	unittest.TextTestRunner(verbosity=2).run(suite)


if __name__ == "__main__":
	run_tests()
