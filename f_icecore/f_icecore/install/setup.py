import frappe
import subprocess
import os
import sys
import platform


def post_install():
	"""
	Runs after bench install-app f_icecore.
	1. Auto-installs Coturn STUN/TURN server (with sudo prompt or skip)
	2. Auto-populates F IceCore Settings with credentials
	"""
	print("\n❄️  F-IceCore: Post-installation setup starting...")
	print("=" * 50)

	# Step 1: Auto-install Coturn
	coturn_installed = _auto_install_coturn()

	# Step 2: Check and populate TURN config (in case install script's auto-save didn't work)
	try:
		from f_icecore.patches.v1.check_coturn_configuration import _check_and_populate_turn_config
		_check_and_populate_turn_config()
	except Exception as e:
		print(f"⚠️ F-IceCore: TURN config auto-populate: {e}")

	print("\n" + "=" * 50)
	print("✅ F-IceCore installed successfully! 🎉")
	print("=" * 50)

	if coturn_installed:
		frappe.msgprint(
			"F-IceCore installed successfully! 🎉<br><br>"
			"Coturn STUN/TURN server has been auto-configured.<br>"
			"Go to <b>F IceCore Settings</b> to verify your TURN configuration.",
			title="Installation Complete",
			indicator="green"
		)
	else:
		frappe.msgprint(
			"F-IceCore installed successfully! 🎉<br><br>"
			"<b>Coturn STUN/TURN server was not installed.</b><br>"
			"WebRTC calls will work on local network but may fail across NATs.<br><br>"
			"To install Coturn later, run:<br>"
			"<code>sudo bash install_scripts/install_coturn.sh</code><br><br>"
			"Or use the <b>Generate &amp; Populate Credentials</b> button in F IceCore Settings.",
			title="Installation Complete (Without TURN)",
			indicator="orange"
		)


def _auto_install_coturn():
	"""
	Auto-install Coturn by running install_coturn.sh.
	On Linux: checks sudo access, prompts for password if needed, offers skip.
	On macOS: runs directly (Homebrew, no sudo needed).
	Returns True if Coturn was installed, False if skipped/failed.
	"""

	# Find the install script
	app_path = frappe.get_app_path("f_icecore")  # .../apps/f_icecore/f_icecore
	script_path = os.path.join(app_path, "..", "install_scripts", "install_coturn.sh")
	script_path = os.path.abspath(script_path)

	if not os.path.exists(script_path):
		print(f"⚠️ F-IceCore: install_coturn.sh not found at {script_path}")
		print("   You can install Coturn manually: sudo bash install_scripts/install_coturn.sh")
		return False

	os_type = platform.system()

	print("")
	print("┌─────────────────────────────────────────────────────┐")
	print("│  📦  Coturn STUN/TURN Server Setup                  │")
	print("│                                                     │")
	print("│  Coturn is required for WebRTC calls to work        │")
	print("│  across different networks (NAT traversal).         │")
	print("│                                                     │")
	if os_type == "Linux":
		print("│  This requires sudo/root access to install.        │")
	elif os_type == "Darwin":
		print("│  This will install via Homebrew (no sudo needed).  │")
	print("└─────────────────────────────────────────────────────┘")
	print("")

	try:
		if os_type == "Linux":
			return _install_coturn_linux(script_path)
		elif os_type == "Darwin":
			return _install_coturn_macos(script_path)
		else:
			print(f"⚠️ F-IceCore: Unsupported OS '{os_type}' for auto-install")
			print("   Please install Coturn manually: sudo bash install_scripts/install_coturn.sh")
			return False
	except Exception as e:
		print(f"⚠️ F-IceCore: Coturn auto-install error: {e}")
		print("   Please install Coturn manually: sudo bash install_scripts/install_coturn.sh")
		return False


def _install_coturn_linux(script_path):
	"""Handle Coturn installation on Linux with sudo prompt and skip option."""

	# Check if already running as root
	if os.geteuid() == 0:
		print("🔑 Running as root — installing Coturn directly...")
		return _run_install_script(script_path, use_sudo=False)

	# Check if sudo access is already available (cached credentials)
	has_sudo = _check_sudo_access()

	if has_sudo:
		print("🔑 Sudo access available — installing Coturn...")
		return _run_install_script(script_path, use_sudo=True)

	# No sudo access — ask user
	print("🔒 Sudo access is required to install Coturn.")
	print("")
	print("   Options:")
	print("   [1] Enter sudo password now to install Coturn (Recommended)")
	print("   [2] Skip — install app without Coturn (can install later)")
	print("")

	try:
		choice = input("   Enter choice [1/2]: ").strip()
	except (EOFError, KeyboardInterrupt):
		# Non-interactive terminal or user pressed Ctrl+C
		print("\n⚠️ Non-interactive terminal detected. Skipping Coturn installation.")
		_print_skip_message()
		return False

	if choice == "2" or choice.lower() == "skip" or choice.lower() == "s":
		print("\n⏭️  Skipping Coturn installation.")
		_print_skip_message()
		return False

	# User chose to install — prompt for sudo password via sudo -v
	print("\n🔑 Please enter your sudo password when prompted...")
	print("")

	try:
		# sudo -v validates and caches sudo credentials
		# stdin/stdout/stderr NOT captured — goes directly to terminal for password prompt
		validate_result = subprocess.run(
			["sudo", "-v"],
			timeout=60  # 60 seconds for user to enter password
		)

		if validate_result.returncode != 0:
			print("\n❌ Sudo authentication failed.")
			print("   Skipping Coturn installation.")
			_print_skip_message()
			return False

		print("\n✅ Sudo access granted! Installing Coturn...")
		return _run_install_script(script_path, use_sudo=True)

	except subprocess.TimeoutExpired:
		print("\n⚠️ Sudo authentication timed out.")
		print("   Skipping Coturn installation.")
		_print_skip_message()
		return False
	except Exception as e:
		print(f"\n⚠️ Sudo authentication error: {e}")
		print("   Skipping Coturn installation.")
		_print_skip_message()
		return False


def _install_coturn_macos(script_path):
	"""Handle Coturn installation on macOS (no sudo, uses Homebrew)."""

	# Check if Homebrew is available
	try:
		brew_check = subprocess.run(["which", "brew"], capture_output=True, text=True, timeout=5)
		if brew_check.returncode != 0:
			print("⚠️ Homebrew is not installed.")
			print("   Install Homebrew first: https://brew.sh")
			print("   Then run: bash install_scripts/install_coturn.sh")
			return False
	except Exception:
		pass

	print("🍺 Installing Coturn via Homebrew (no sudo needed)...")

	# On macOS, ask to proceed or skip
	print("")
	print("   Options:")
	print("   [1] Install Coturn now via Homebrew (Recommended)")
	print("   [2] Skip — install app without Coturn (can install later)")
	print("")

	try:
		choice = input("   Enter choice [1/2]: ").strip()
	except (EOFError, KeyboardInterrupt):
		print("\n⚠️ Non-interactive terminal detected. Skipping Coturn installation.")
		_print_skip_message()
		return False

	if choice == "2" or choice.lower() == "skip" or choice.lower() == "s":
		print("\n⏭️  Skipping Coturn installation.")
		_print_skip_message()
		return False

	print("\n📦 Installing Coturn via Homebrew...")
	return _run_install_script(script_path, use_sudo=False)


def _check_sudo_access():
	"""Check if the current user has cached sudo credentials (non-interactive)."""
	try:
		# sudo -n = non-interactive, will fail if password is needed
		result = subprocess.run(
			["sudo", "-n", "true"],
			capture_output=True,
			text=True,
			timeout=5
		)
		return result.returncode == 0
	except Exception:
		return False


def _run_install_script(script_path, use_sudo=True):
	"""Execute the install_coturn.sh script and return success status."""
	try:
		cmd = ["sudo", "bash", script_path] if use_sudo else ["bash", script_path]
		print(f"   Running: {' '.join(cmd)}")
		print("")

		# Run with stdin/stdout/stderr going to terminal directly
		# so user can see live output and any prompts
		result = subprocess.run(
			cmd,
			timeout=300  # 5 minute timeout
		)

		if result.returncode == 0:
			print("\n✅ F-IceCore: Coturn installed successfully!")
			return True
		else:
			print(f"\n⚠️ F-IceCore: Coturn install exited with code {result.returncode}")
			print("   You can retry manually: sudo bash install_scripts/install_coturn.sh")
			return False

	except subprocess.TimeoutExpired:
		print("\n⚠️ F-IceCore: Coturn installation timed out (5 minutes)")
		print("   Please install manually: sudo bash install_scripts/install_coturn.sh")
		return False
	except FileNotFoundError:
		print("\n⚠️ F-IceCore: 'sudo' or 'bash' not found on this system")
		print("   Please install Coturn manually")
		return False
	except Exception as e:
		print(f"\n⚠️ F-IceCore: Install script error: {e}")
		print("   Please install Coturn manually: sudo bash install_scripts/install_coturn.sh")
		return False


def _print_skip_message():
	"""Print instructions for manual Coturn install later."""
	print("")
	print("   ┌───────────────────────────────────────────────────┐")
	print("   │  ℹ️  App will install without TURN server.        │")
	print("   │  WebRTC calls will work on local network only.   │")
	print("   │                                                   │")
	print("   │  To install Coturn later, run:                    │")
	print("   │  sudo bash install_scripts/install_coturn.sh      │")
	print("   │                                                   │")
	print("   │  Or use 'Generate & Populate Credentials'         │")
	print("   │  button in F IceCore Settings.                    │")
	print("   └───────────────────────────────────────────────────┘")
	print("")


def after_migrate():
	"""
	Runs after every bench migrate.
	Checks and auto-populates TURN/STUN configuration if Coturn is found.
	"""
	try:
		from f_icecore.patches.v1.check_coturn_configuration import _check_and_populate_turn_config
		_check_and_populate_turn_config()
	except Exception as e:
		print(f"⚠️ F-IceCore: TURN config check during migrate: {e}")
