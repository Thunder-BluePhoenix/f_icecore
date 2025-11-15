# F-IceCore Installation Scripts

This directory contains installation and validation scripts for F-IceCore.

## Scripts

### 1. validate_setup.py

Comprehensive validation script that checks:
- Directory structure
- Python files (syntax validation)
- DocTypes (JSON and Python validation)
- JavaScript and CSS files
- Installation scripts
- Hooks configuration
- Common issues

**Usage:**
```bash
cd /path/to/f_icecore
python3 install_scripts/validate_setup.py
```

**When to use:**
- After cloning the repository
- Before installing the app
- After making changes to the codebase
- Troubleshooting installation issues

### 2. install_coturn.sh

Automated Coturn STUN/TURN server installer.

**Supports:**
- Linux (Ubuntu, Debian, CentOS, RHEL, Fedora)
- macOS (via Homebrew)

**Usage:**

**On Linux:**
```bash
cd /path/to/f_icecore
sudo bash install_scripts/install_coturn.sh
```

**On macOS:**
```bash
cd /path/to/f_icecore
bash install_scripts/install_coturn.sh
```

**Note:** On macOS, you need Homebrew installed. If not installed, run:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**What it does:**
1. Detects your operating system
2. Installs Coturn via package manager (apt/yum/brew)
3. Generates secure TURN credentials
4. Creates optimized turnserver.conf
5. Starts and enables Coturn service
6. Saves credentials to config file

**Generated files:**

**Linux:**
- Config: `/etc/turnserver.conf`
- Credentials: `/etc/coturn/f_icecore_credentials.txt`
- Logs: `/var/log/turnserver.log`

**macOS:**
- Config: `/usr/local/etc/turnserver.conf`
- Credentials: `/usr/local/etc/f_icecore_credentials.txt`
- Logs: `/var/log/turnserver.log`

**After installation:**

Check Coturn status:
```bash
# Linux
sudo systemctl status coturn

# macOS
brew services list
```

View logs:
```bash
tail -f /var/log/turnserver.log
```

**Firewall configuration:**

**Linux (UFW):**
```bash
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp
sudo ufw allow 49152:65535/udp
```

**Linux (firewalld):**
```bash
sudo firewall-cmd --permanent --add-port=3478/tcp
sudo firewall-cmd --permanent --add-port=3478/udp
sudo firewall-cmd --permanent --add-port=5349/tcp
sudo firewall-cmd --permanent --add-port=5349/udp
sudo firewall-cmd --permanent --add-port=49152-65535/udp
sudo firewall-cmd --reload
```

**macOS:**
- Go to System Preferences > Security & Privacy > Firewall
- Allow incoming connections for Coturn

## Installation Workflow

### Complete Setup

1. **Clone the repository**
   ```bash
   cd ~/frappe-bench/apps
   git clone https://github.com/Thunder-BluePhoenix/f_icecore
   ```

2. **Validate the setup**
   ```bash
   cd f_icecore
   python3 install_scripts/validate_setup.py
   ```

3. **Install the app**
   ```bash
   cd ~/frappe-bench
   bench --site your-site.local install-app f_icecore
   ```

4. **Install Coturn** (optional, for production)
   ```bash
   cd ~/frappe-bench/apps/f_icecore
   sudo bash install_scripts/install_coturn.sh  # Linux
   # or
   bash install_scripts/install_coturn.sh       # macOS
   ```

5. **Migrate**
   ```bash
   cd ~/frappe-bench
   bench migrate
   ```

6. **Restart bench**
   ```bash
   bench restart
   ```

### Development Setup (macOS)

For development/testing on macOS, you can skip Coturn installation and use public STUN servers:

1. Install the app
2. The app will fallback to Google's public STUN server
3. Calls will work for testing, but may have limitations without TURN

### Production Setup (Linux)

For production environments:

1. Install the app on your site
2. Install Coturn on the same server or a dedicated TURN server
3. Configure firewall rules
4. Update F IceCore Settings with your TURN server details
5. Test the connection using the built-in test endpoint

## Troubleshooting

### Validation fails

Run the validation script to see specific errors:
```bash
python3 install_scripts/validate_setup.py
```

Common issues:
- Missing `__init__.py` files
- Incorrect module paths in hooks.py
- Missing DocType files

### Coturn installation fails

**Linux:**
- Ensure you're running with sudo
- Check internet connectivity
- Verify your distribution is supported

**macOS:**
- Install Homebrew first
- Check Homebrew is in PATH: `brew --version`
- Update Homebrew: `brew update`

### Coturn not starting

Check logs:
```bash
tail -f /var/log/turnserver.log
```

Common issues:
- Ports already in use (check with `netstat -tlnp | grep 3478`)
- Permission issues (check turnserver.conf ownership)
- Firewall blocking ports

### Calls not connecting

1. Check Coturn is running
2. Verify firewall rules
3. Test TURN credentials:
   ```javascript
   frappe.call({
       method: 'f_icecore.f_icecore.api.turn_credentials.test_turn_connection',
       callback: (r) => console.log(r.message)
   })
   ```

## Support

- GitHub Issues: https://github.com/Thunder-BluePhoenix/f_icecore/issues
- Documentation: See main README.md

## Notes

- **Production:** Always install Coturn on Linux servers
- **Development:** macOS installation is suitable for testing only
- **Security:** Keep your TURN secret secure and rotate regularly
- **Updates:** Re-run validation after updates
