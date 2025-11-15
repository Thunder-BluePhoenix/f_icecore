"""
Configure TURN server settings properly
"""
import frappe
from frappe.utils.password import get_decrypted_password


def update_turn_settings():
	"""Update TURN server settings using Frappe document API (handles password encryption)"""
	try:
		# Get or create settings document
		if frappe.db.exists("F IceCore Settings", "F IceCore Settings"):
			settings = frappe.get_doc("F IceCore Settings", "F IceCore Settings")
		else:
			settings = frappe.new_doc("F IceCore Settings")
			settings.name = "F IceCore Settings"

		# Update TURN server settings (from original Coturn installation)
		settings.turn_server = "10.85.98.242"
		settings.turn_secret = "89da14c8d0c26d45217130ae7bc20042b6858a795d25716d3b4d6b25c930992b"
		settings.stun_port = 3478
		settings.turn_port = 3478
		settings.turns_port = 5349

		# Enable features
		settings.enable_audio_calls = 1
		settings.enable_video_calls = 1
		settings.enable_screen_sharing = 1
		settings.enable_call_history = 1

		# Save (this handles password encryption automatically)
		settings.save()
		frappe.db.commit()

		print("✅ TURN settings saved successfully!")
		print(f"   TURN Server: {settings.turn_server}")
		print(f"   STUN Port: {settings.stun_port}")
		print(f"   TURN Port: {settings.turn_port}")

		# Verify password was encrypted and can be decrypted
		try:
			decrypted = get_decrypted_password(
				"F IceCore Settings",
				"F IceCore Settings",
				"turn_secret"
			)

			if decrypted:
				print(f"\n✅ Password encrypted and can be decrypted!")
				matches = decrypted == "e6b3db1de9a07c303033ee7b952c487913b6a29d69b90a49f4fa9150cc21ff85"
				print(f"   Decrypted value matches original: {matches}")
				return {"success": True, "message": "TURN server configured successfully"}
			else:
				print("\n❌ WARNING: Password is None!")
				return {"success": False, "message": "Password is None"}
		except Exception as decrypt_error:
			print(f"\n❌ Decryption error: {decrypt_error}")
			import traceback
			traceback.print_exc()
			return {"success": False, "message": f"Decryption error: {decrypt_error}"}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "TURN Configuration Error")
		print(f"\n❌ Error: {str(e)}")
		import traceback
		traceback.print_exc()
		return {"success": False, "message": str(e)}
