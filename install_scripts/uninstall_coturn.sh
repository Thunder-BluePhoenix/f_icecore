#!/bin/bash

##############################################################################
# F-IceCore Coturn Uninstallation Script
# Uninstalls Coturn STUN/TURN server
# Supports: Linux (Ubuntu, Debian, CentOS, RHEL, Fedora) and macOS
##############################################################################

set -e

echo "❄️  F-IceCore: Coturn Uninstallation Starting..."
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

# Check privileges
if [ "$OS_TYPE" = "Linux" ]; then
    if [ "$EUID" -ne 0 ]; then
        echo "❌ Please run as root or with sudo on Linux"
        exit 1
    fi
elif [ "$OS_TYPE" = "macOS" ]; then
    if [ "$EUID" -eq 0 ]; then
        echo "❌ Do NOT run with sudo on macOS!"
        echo "   Please run without sudo:"
        echo "   bash install_scripts/uninstall_coturn.sh"
        exit 1
    fi
fi

# Confirm uninstallation
echo ""
echo "⚠️  WARNING: This will uninstall Coturn and remove all configurations."
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Uninstallation cancelled."
    exit 0
fi

echo ""
echo "🗑️  Uninstalling Coturn..."

# Stop and remove service
if [ "$OS_TYPE" = "Linux" ]; then
    echo "📦 Stopping Coturn service..."
    systemctl stop coturn 2>/dev/null || true
    systemctl disable coturn 2>/dev/null || true

    echo "📦 Removing Coturn package..."
    case $OS in
        ubuntu|debian)
            apt-get remove -y coturn
            apt-get autoremove -y
            ;;
        centos|rhel|fedora)
            yum remove -y coturn
            yum autoremove -y
            ;;
    esac

    # Set paths
    COTURN_CONFIG="/etc/turnserver.conf"
    LOG_FILE="/var/log/turnserver.log"
    CREDS_DIR="/etc/coturn"

elif [ "$OS_TYPE" = "macOS" ]; then
    echo "📦 Stopping Coturn service..."
    brew services stop coturn 2>/dev/null || true

    echo "📦 Uninstalling Coturn via Homebrew..."
    brew uninstall coturn

    # Set paths
    BREW_PREFIX=$(brew --prefix)
    COTURN_CONFIG="$BREW_PREFIX/etc/turnserver.conf"
    LOG_FILE="$BREW_PREFIX/var/log/turnserver.log"
    CREDS_DIR="$BREW_PREFIX/etc"
fi

# Ask about configuration files
echo ""
read -p "Remove configuration files? (yes/no): " REMOVE_CONFIG

if [ "$REMOVE_CONFIG" = "yes" ]; then
    echo "🗑️  Removing configuration files..."

    # Remove config file
    if [ -f "$COTURN_CONFIG" ]; then
        # Backup before removing
        if [ -f "${COTURN_CONFIG}.backup" ]; then
            rm -f "${COTURN_CONFIG}.backup"
        fi
        mv "$COTURN_CONFIG" "${COTURN_CONFIG}.backup" 2>/dev/null || rm -f "$COTURN_CONFIG"
        echo "   ✓ Removed: $COTURN_CONFIG (backup saved)"
    fi

    # Remove credentials file
    CREDS_FILE="$CREDS_DIR/f_icecore_credentials.txt"
    if [ -f "$CREDS_FILE" ]; then
        rm -f "$CREDS_FILE"
        echo "   ✓ Removed: $CREDS_FILE"
    fi

    # Remove log file
    if [ -f "$LOG_FILE" ]; then
        rm -f "$LOG_FILE"
        echo "   ✓ Removed: $LOG_FILE"
    fi

    # Remove directory if empty (Linux only)
    if [ "$OS_TYPE" = "Linux" ] && [ -d "$CREDS_DIR" ]; then
        rmdir "$CREDS_DIR" 2>/dev/null || true
    fi
else
    echo "⏭️  Keeping configuration files"
    echo "   Config: $COTURN_CONFIG"
    echo "   Credentials: $CREDS_DIR/f_icecore_credentials.txt"
fi

echo ""
echo "================================================"
echo "✅ F-IceCore Coturn Uninstallation Complete!"
echo "================================================"
echo ""

if [ "$REMOVE_CONFIG" != "yes" ]; then
    echo "📝 Note: Configuration files were preserved."
    echo "   To reinstall with same settings, run:"
    echo "   bash install_scripts/install_coturn.sh"
fi

echo ""
echo "💡 Next steps:"
echo "   - F-IceCore will fallback to public STUN servers"
echo "   - Calls may have limitations without TURN"
echo "   - You can reinstall Coturn anytime"
echo ""
echo "❄️  Goodbye!"
