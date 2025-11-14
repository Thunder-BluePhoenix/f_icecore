#!/bin/bash

##############################################################################
# F-IceCore Coturn Installation Script
# Installs and configures Coturn STUN/TURN server for WebRTC
##############################################################################

set -e

echo "❄️  F-IceCore: Coturn Installation Starting..."
echo "================================================"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root or with sudo"
    exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "❌ Cannot detect OS"
    exit 1
fi

# Install Coturn
echo "📦 Installing Coturn..."
case $OS in
    ubuntu|debian)
        apt-get update
        apt-get install -y coturn
        ;;
    centos|rhel|fedora)
        yum install -y epel-release
        yum install -y coturn
        ;;
    *)
        echo "❌ Unsupported OS: $OS"
        exit 1
        ;;
esac

# Stop Coturn if running
systemctl stop coturn 2>/dev/null || true

# Generate secure credentials
TURN_SECRET=$(openssl rand -hex 32)
SERVER_IP=$(hostname -I | awk '{print $1}')
REALM="${REALM:-$SERVER_IP}"

# Backup existing config if present
if [ -f /etc/turnserver.conf ]; then
    cp /etc/turnserver.conf /etc/turnserver.conf.backup.$(date +%s)
fi

# Create Coturn configuration
echo "⚙️  Configuring Coturn..."
cat > /etc/turnserver.conf <<EOF
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
log-file=/var/log/turnserver.log

# Deny by default, allow specific IPs if needed
# denied-peer-ip=0.0.0.0-0.255.255.255
# denied-peer-ip=127.0.0.0-127.255.255.255

# No multicast peers
no-multicast-peers

# Mobility support
mobility

# Rate limiting
# total-quota=100
# bps-capacity=0

# TLS/DTLS
# cert=/etc/coturn/cert.pem
# pkey=/etc/coturn/pkey.pem

# Disable CLI
no-cli

# Disable UDP relay endpoints
# no-udp-relay

# Disable TCP relay endpoints
# no-tcp-relay

# Enable STUN
# stun-only

# For better NAT traversal
external-ip=$SERVER_IP

# Process management
pidfile=/var/run/turnserver.pid
EOF

# Create log directory
mkdir -p /var/log
touch /var/log/turnserver.log
chown turnserver:turnserver /var/log/turnserver.log 2>/dev/null || true

# Enable Coturn service
echo "🔧 Enabling Coturn service..."

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

# Save credentials to file for reference
CREDS_FILE="/etc/coturn/f_icecore_credentials.txt"
mkdir -p /etc/coturn
cat > $CREDS_FILE <<EOF
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

chmod 600 $CREDS_FILE

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
echo ""
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
echo "📄 Check logs: tail -f /var/log/turnserver.log"
echo ""
echo "❄️  Happy Calling!"
