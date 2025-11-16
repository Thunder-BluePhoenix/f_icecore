#!/bin/bash
# Coturn Wrapper Script for Bench Integration
# This script detects the platform and starts Coturn accordingly

set -e

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ -f /etc/os-release ]]; then
        . /etc/os-release
        echo "linux"
    else
        echo "unknown"
    fi
}

# Find Coturn binary
find_coturn_binary() {
    local os=$(detect_os)

    if [[ "$os" == "macos" ]]; then
        # Check Homebrew installation
        if command -v brew &> /dev/null; then
            BREW_PREFIX=$(brew --prefix)
            if [[ -f "$BREW_PREFIX/opt/coturn/bin/turnserver" ]]; then
                echo "$BREW_PREFIX/opt/coturn/bin/turnserver"
                return 0
            fi
        fi
    elif [[ "$os" == "linux" ]]; then
        # Check standard Linux paths
        if command -v turnserver &> /dev/null; then
            which turnserver
            return 0
        fi
    fi

    echo ""
    return 1
}

# Find Coturn config file
find_coturn_config() {
    local os=$(detect_os)

    if [[ "$os" == "macos" ]]; then
        if command -v brew &> /dev/null; then
            BREW_PREFIX=$(brew --prefix)
            if [[ -f "$BREW_PREFIX/etc/turnserver.conf" ]]; then
                echo "$BREW_PREFIX/etc/turnserver.conf"
                return 0
            fi
        fi
    elif [[ "$os" == "linux" ]]; then
        if [[ -f "/etc/turnserver.conf" ]]; then
            echo "/etc/turnserver.conf"
            return 0
        fi
    fi

    echo ""
    return 1
}

# Main execution
main() {
    echo "🔍 Detecting Coturn installation..."

    COTURN_BIN=$(find_coturn_binary)
    if [[ -z "$COTURN_BIN" ]]; then
        echo "❌ Error: Coturn not found. Please run install_coturn.sh first."
        exit 1
    fi

    COTURN_CONFIG=$(find_coturn_config)
    if [[ -z "$COTURN_CONFIG" ]]; then
        echo "❌ Error: Coturn configuration not found."
        exit 1
    fi

    echo "✅ Found Coturn binary: $COTURN_BIN"
    echo "✅ Found Coturn config: $COTURN_CONFIG"
    echo "🚀 Starting Coturn server..."

    # Start Coturn with explicit config
    exec "$COTURN_BIN" -c "$COTURN_CONFIG" -v
}

main "$@"
