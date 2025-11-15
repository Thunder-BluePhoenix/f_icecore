#!/usr/bin/env python3
"""
F-IceCore Setup Validation Script
Validates the complete F-IceCore installation
"""

import os
import sys
import json
import importlib.util
from pathlib import Path

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_header(text):
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'=' * 60}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text.center(60)}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'=' * 60}{Colors.ENDC}\n")

def print_success(text):
    print(f"{Colors.GREEN}✓{Colors.ENDC} {text}")

def print_error(text):
    print(f"{Colors.RED}✗{Colors.ENDC} {text}")

def print_warning(text):
    print(f"{Colors.YELLOW}⚠{Colors.ENDC} {text}")

def print_info(text):
    print(f"{Colors.BLUE}ℹ{Colors.ENDC} {text}")

def check_file_exists(filepath, description):
    """Check if a file exists"""
    if os.path.isfile(filepath):
        print_success(f"{description}: {filepath}")
        return True
    else:
        print_error(f"{description} not found: {filepath}")
        return False

def check_directory_exists(dirpath, description):
    """Check if a directory exists"""
    if os.path.isdir(dirpath):
        print_success(f"{description}: {dirpath}")
        return True
    else:
        print_error(f"{description} not found: {dirpath}")
        return False

def validate_python_file(filepath):
    """Validate Python file syntax"""
    try:
        with open(filepath, 'r') as f:
            compile(f.read(), filepath, 'exec')
        return True
    except SyntaxError as e:
        print_error(f"Syntax error in {filepath}: {e}")
        return False

def validate_json_file(filepath):
    """Validate JSON file"""
    try:
        with open(filepath, 'r') as f:
            json.load(f)
        return True
    except json.JSONDecodeError as e:
        print_error(f"JSON error in {filepath}: {e}")
        return False

def main():
    print_header("F-IceCore Setup Validation")

    # Get the app root directory
    app_root = Path(__file__).parent.parent.absolute()
    os.chdir(app_root)

    print_info(f"App root: {app_root}\n")

    errors = []
    warnings = []

    # 1. Check directory structure
    print_header("1. Directory Structure")

    required_dirs = [
        ('f_icecore/f_icecore', 'Main module directory'),
        ('f_icecore/f_icecore/api', 'API module'),
        ('f_icecore/f_icecore/doctype', 'DocType directory'),
        ('f_icecore/f_icecore/public/js', 'JavaScript directory'),
        ('f_icecore/f_icecore/public/css', 'CSS directory'),
        ('f_icecore/f_icecore/install', 'Install hooks directory'),
        ('install_scripts', 'Installation scripts'),
    ]

    for dirpath, desc in required_dirs:
        if not check_directory_exists(dirpath, desc):
            errors.append(f"Missing directory: {dirpath}")

    # 2. Check Python files
    print_header("2. Python Files")

    python_files = [
        ('f_icecore/hooks.py', 'Hooks configuration'),
        ('f_icecore/f_icecore/__init__.py', 'Module init'),
        ('f_icecore/f_icecore/api/__init__.py', 'API init'),
        ('f_icecore/f_icecore/api/signaling.py', 'Signaling API'),
        ('f_icecore/f_icecore/api/presence.py', 'Presence API'),
        ('f_icecore/f_icecore/api/turn_credentials.py', 'TURN credentials API'),
        ('f_icecore/f_icecore/api/call_session.py', 'Call session API'),
        ('f_icecore/f_icecore/api/permissions.py', 'Permissions API'),
        ('f_icecore/f_icecore/install/setup.py', 'Installation setup'),
    ]

    for filepath, desc in python_files:
        if check_file_exists(filepath, desc):
            if not validate_python_file(filepath):
                errors.append(f"Invalid Python syntax: {filepath}")

    # 3. Check DocTypes
    print_header("3. DocTypes")

    doctype_files = [
        ('f_icecore/f_icecore/doctype/f_icecore_call_session/f_icecore_call_session.json', 'Call Session DocType'),
        ('f_icecore/f_icecore/doctype/f_icecore_call_session/f_icecore_call_session.py', 'Call Session Controller'),
        ('f_icecore/f_icecore/doctype/f_icecore_settings/f_icecore_settings.json', 'Settings DocType'),
        ('f_icecore/f_icecore/doctype/f_icecore_settings/f_icecore_settings.py', 'Settings Controller'),
    ]

    for filepath, desc in doctype_files:
        if check_file_exists(filepath, desc):
            if filepath.endswith('.json'):
                if not validate_json_file(filepath):
                    errors.append(f"Invalid JSON: {filepath}")
            elif filepath.endswith('.py'):
                if not validate_python_file(filepath):
                    errors.append(f"Invalid Python syntax: {filepath}")

    # 4. Check JavaScript files
    print_header("4. JavaScript Files")

    js_files = [
        ('f_icecore/f_icecore/public/js/webrtc_engine.js', 'WebRTC Engine'),
        ('f_icecore/f_icecore/public/js/call_ui.js', 'Call UI'),
        ('f_icecore/f_icecore/public/js/f_icecore.bundle.js', 'Main bundle'),
    ]

    for filepath, desc in js_files:
        if not check_file_exists(filepath, desc):
            errors.append(f"Missing JavaScript file: {filepath}")

    # 5. Check CSS files
    print_header("5. CSS Files")

    css_files = [
        ('f_icecore/f_icecore/public/css/f_icecore.css', 'Main CSS'),
    ]

    for filepath, desc in css_files:
        if not check_file_exists(filepath, desc):
            errors.append(f"Missing CSS file: {filepath}")

    # 6. Check installation scripts
    print_header("6. Installation Scripts")

    script_files = [
        ('install_scripts/install_coturn.sh', 'Coturn installer'),
    ]

    for filepath, desc in script_files:
        if check_file_exists(filepath, desc):
            # Check if executable
            if os.access(filepath, os.X_OK):
                print_success(f"  Script is executable")
            else:
                warnings.append(f"Script not executable: {filepath}")
                print_warning(f"  Script is not executable (run: chmod +x {filepath})")

    # 7. Validate hooks.py structure
    print_header("7. Hooks Configuration")

    try:
        with open('f_icecore/hooks.py', 'r') as f:
            hooks_content = f.read()

        # Check for critical hooks
        if 'after_install' in hooks_content:
            print_success("after_install hook defined")
            if 'f_icecore.f_icecore.install.setup.post_install' in hooks_content:
                print_success("  Correct module path")
            else:
                errors.append("Incorrect after_install hook path")
                print_error("  Incorrect module path")

        if 'scheduler_events' in hooks_content:
            print_success("scheduler_events defined")

        if 'socketio_events' in hooks_content:
            print_success("socketio_events defined")

        if 'app_include_js' in hooks_content:
            print_success("JavaScript includes defined")

        if 'app_include_css' in hooks_content:
            print_success("CSS includes defined")

    except Exception as e:
        errors.append(f"Error reading hooks.py: {e}")

    # 8. Check for common issues
    print_header("8. Common Issues Check")

    # Check for nested directory structure
    if os.path.isdir('f_icecore/f_icecore'):
        print_success("Correct nested directory structure (f_icecore/f_icecore)")
    else:
        errors.append("Missing nested directory structure")

    # Check for __init__.py files
    init_files = [
        'f_icecore/__init__.py',
        'f_icecore/f_icecore/__init__.py',
        'f_icecore/f_icecore/api/__init__.py',
        'f_icecore/f_icecore/doctype/__init__.py',
        'f_icecore/f_icecore/install/__init__.py',
    ]

    missing_inits = []
    for init_file in init_files:
        if not os.path.isfile(init_file):
            missing_inits.append(init_file)

    if missing_inits:
        for init_file in missing_inits:
            errors.append(f"Missing __init__.py: {init_file}")
            print_error(f"Missing: {init_file}")
    else:
        print_success("All required __init__.py files present")

    # Summary
    print_header("Validation Summary")

    total_checks = len(required_dirs) + len(python_files) + len(doctype_files) + len(js_files) + len(css_files) + len(script_files)

    print(f"\n{Colors.BOLD}Total checks: {total_checks}{Colors.ENDC}")

    if errors:
        print(f"\n{Colors.RED}{Colors.BOLD}❌ {len(errors)} ERROR(S) FOUND:{Colors.ENDC}")
        for error in errors:
            print(f"  {Colors.RED}•{Colors.ENDC} {error}")

    if warnings:
        print(f"\n{Colors.YELLOW}{Colors.BOLD}⚠  {len(warnings)} WARNING(S):{Colors.ENDC}")
        for warning in warnings:
            print(f"  {Colors.YELLOW}•{Colors.ENDC} {warning}")

    if not errors:
        print(f"\n{Colors.GREEN}{Colors.BOLD}✅ All checks passed!{Colors.ENDC}")
        print(f"\n{Colors.GREEN}F-IceCore is properly set up and ready to use.{Colors.ENDC}")
        print(f"\n{Colors.BLUE}Next steps:{Colors.ENDC}")
        print(f"  1. Install the app: bench --site your-site install-app f_icecore")
        print(f"  2. Install Coturn: sudo bash install_scripts/install_coturn.sh")
        print(f"  3. Configure settings in F IceCore Settings")
        return 0
    else:
        print(f"\n{Colors.RED}{Colors.BOLD}❌ Validation failed. Please fix the errors above.{Colors.ENDC}")
        return 1

if __name__ == '__main__':
    sys.exit(main())
