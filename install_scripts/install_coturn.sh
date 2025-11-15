#!/bin/bash

##############################################################################
# F-IceCore Coturn Installation Script
# Installs and configures Coturn STUN/TURN server for WebRTC
# Supports: Linux (Ubuntu, Debian, CentOS, RHEL, Fedora) and macOS
##############################################################################

set -e

echo "❄️  F-IceCore: Coturn Installation Starting..."
echo "================================================"

# Detect OS
UNAME_S=$(uname -s)
case "$UNAME_S" in
    Linux*)
        OS_TYPE="Linux"
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            OS=$ID
        else
            echo "❌ Cannot detect Linux distribution"
            exit 1
        fi
        ;;
    Darwin*)
        OS_TYPE="macOS"
        OS="macos"
        ;;
    *)
        echo "❌ Unsupported operating system: $UNAME_S"
        exit 1
        ;;
esac

echo "📋 Detected OS: $OS_TYPE ($OS)"

# Check if running with appropriate privileges
if [ "$OS_TYPE" = "Linux" ]; then
    if [ "$EUID" -ne 0 ]; then
        echo "❌ Please run as root or with sudo on Linux"
        exit 1
    fi
elif [ "$OS_TYPE" = "macOS" ]; then
    if [ "$EUID" -eq 0 ]; then
        echo "❌ Do NOT run with sudo on macOS!"
        echo "   Homebrew does not support running as root."
        echo "   Please run without sudo:"
        echo "   bash install_scripts/install_coturn.sh"
        exit 1
    fi
fi

# Install Coturn
echo "📦 Installing Coturn..."
case $OS in
    ubuntu|debian)
        apt-get update
        apt-get install -y coturn
        COTURN_CONFIG="/etc/turnserver.conf"
        LOG_DIR="/var/log"
        LOG_FILE="/var/log/turnserver.log"
        CREDS_DIR="/etc/coturn"
        ;;
    centos|rhel|fedora)
        yum install -y epel-release
        yum install -y coturn
        COTURN_CONFIG="/etc/turnserver.conf"
        LOG_DIR="/var/log"
        LOG_FILE="/var/log/turnserver.log"
        CREDS_DIR="/etc/coturn"
        ;;
    macos)
        # Check if Homebrew is installed
        if ! command -v brew &> /dev/null; then
            echo "❌ Homebrew is not installed. Please install Homebrew first:"
            echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            exit 1
        fi

        echo "📦 Installing Coturn via Homebrew..."
        brew install coturn

        # macOS uses Homebrew paths (user-writable)
        BREW_PREFIX=$(brew --prefix)
        COTURN_CONFIG="$BREW_PREFIX/etc/turnserver.conf"
        LOG_DIR="$BREW_PREFIX/var/log"
        LOG_FILE="$LOG_DIR/turnserver.log"
        CREDS_DIR="$BREW_PREFIX/etc"

        # Create directories if they don't exist
        mkdir -p "$BREW_PREFIX/etc"
        mkdir -p "$LOG_DIR"
        ;;
    *)
        echo "❌ Unsupported OS: $OS"
        exit 1
        ;;
esac

# Stop Coturn if running
if [ "$OS_TYPE" = "Linux" ]; then
    systemctl stop coturn 2>/dev/null || true
elif [ "$OS_TYPE" = "macOS" ]; then
    brew services stop coturn 2>/dev/null || true
fi

# Generate secure credentials
TURN_SECRET=$(openssl rand -hex 32)

# Get server IP
if [ "$OS_TYPE" = "macOS" ]; then
    # On macOS, get the first non-loopback IP
    SERVER_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n1)
else
    SERVER_IP=$(hostname -I | awk '{print $1}')
fi

REALM="${REALM:-$SERVER_IP}"

# Backup existing config if present
if [ -f "$COTURN_CONFIG" ]; then
    cp "$COTURN_CONFIG" "${COTURN_CONFIG}.backup.$(date +%s)"
fi

# Create Coturn configuration
echo "⚙️  Configuring Coturn..."
cat > "$COTURN_CONFIG" <<EOF
# F-IceCore Coturn Configuration
# Generated on $(date)

# Listening ports
listening-port=3478
tls-listening-port=5349

# Relay ports range (for media)
min-port=49152
max-port=65535

# Fingerprint in TURN messages
fingerprint

# Long-term credential mechanism
lt-cred-mech

# Use authentication secret for REST API (time-limited credentials)
use-auth-secret
static-auth-secret=$TURN_SECRET

# Realm (domain)
realm=$REALM

# Verbosity
verbose

# Log file
log-file=$LOG_FILE

# No multicast peers
no-multicast-peers

# Mobility support
mobility

# For better NAT traversal
external-ip=$SERVER_IP

# Process management
pidfile=/var/run/turnserver.pid
EOF

# Create log directory and file
mkdir -p "$LOG_DIR"
touch "$LOG_FILE"

# Set permissions
if [ "$OS_TYPE" = "Linux" ]; then
    chown turnserver:turnserver "$LOG_FILE" 2>/dev/null || true
elif [ "$OS_TYPE" = "macOS" ]; then
    chmod 644 "$LOG_FILE"
fi

# Enable and start Coturn
echo "🔧 Enabling Coturn service..."

if [ "$OS_TYPE" = "Linux" ]; then
    # Enable in /etc/default/coturn (Debian/Ubuntu specific)
    if [ -f /etc/default/coturn ]; then
        sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
    fi

    # Enable and start Coturn
    systemctl enable coturn
    systemctl start coturn

    # Check if Coturn is running
    sleep 2
    if systemctl is-active --quiet coturn; then
        echo "✅ Coturn is running"
    else
        echo "⚠️  Coturn may not be running. Check: systemctl status coturn"
    fi
elif [ "$OS_TYPE" = "macOS" ]; then
    # Start Coturn using brew services
    brew services start coturn

    echo "✅ Coturn service started via Homebrew"
    echo "   To check status: brew services list"
    echo "   To stop: brew services stop coturn"
fi

# Save credentials to file for reference
mkdir -p "$CREDS_DIR"
CREDS_FILE="$CREDS_DIR/f_icecore_credentials.txt"

cat > "$CREDS_FILE" <<EOF
F-IceCore TURN Server Credentials
==================================
Generated: $(date)

TURN Secret: $TURN_SECRET
Realm: $REALM
Server IP: $SERVER_IP

STUN URL: stun:$SERVER_IP:3478
TURN URL: turn:$SERVER_IP:3478
TURNS URL: turns:$SERVER_IP:5349

Note: Use REST API to generate time-limited credentials
EOF

chmod 600 "$CREDS_FILE"

echo ""
echo "================================================"
echo "✅ F-IceCore Coturn Installation Complete!"
echo "================================================"
echo ""
echo "📋 Configuration Details:"
echo "   STUN/TURN Server: $SERVER_IP:3478"
echo "   TURNS (TLS): $SERVER_IP:5349"
echo "   Realm: $REALM"
echo "   Secret: $TURN_SECRET"
echo ""
echo "📝 Credentials saved to: $CREDS_FILE"
echo "   Config file: $COTURN_CONFIG"
echo ""

if [ "$OS_TYPE" = "Linux" ]; then
    echo "🔥 Firewall Configuration:"
    echo "   You may need to open these ports:"
    echo "   - UDP/TCP 3478 (STUN/TURN)"
    echo "   - UDP/TCP 5349 (TURNS)"
    echo "   - UDP 49152-65535 (media relay)"
    echo ""
    echo "   Example (UFW):"
    echo "   sudo ufw allow 3478/tcp"
    echo "   sudo ufw allow 3478/udp"
    echo "   sudo ufw allow 5349/tcp"
    echo "   sudo ufw allow 5349/udp"
    echo "   sudo ufw allow 49152:65535/udp"
    echo ""
    echo "🔍 Check status: systemctl status coturn"
    echo "📄 Check logs: tail -f $LOG_FILE"
elif [ "$OS_TYPE" = "macOS" ]; then
    echo "🔥 Firewall Configuration:"
    echo "   On macOS, you may need to allow Coturn in System Preferences > Security & Privacy > Firewall"
    echo ""
    echo "🔍 Check status: brew services list"
    echo "📄 Check logs: tail -f $LOG_FILE"
    echo ""
    echo "⚠️  Note: For production use on macOS, you may want to run Coturn on a Linux server"
    echo "   macOS is suitable for development/testing only"
fi

echo ""
echo "❄️  Happy Calling!"
