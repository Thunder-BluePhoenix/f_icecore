#!/bin/bash

##############################################################################
# Save TURN credentials to Frappe settings
# Called after Coturn installation
##############################################################################

if [ "$#" -lt 3 ]; then
    echo "Usage: $0 <server> <secret> <bench_path> [site]"
    echo "Example: $0 192.168.1.100 mysecret123 ~/frappe-bench site1.local"
    exit 1
fi

SERVER=$1
SECRET=$2
BENCH_PATH=$3
SITE=${4:-""}

echo "💾 Saving TURN credentials to Frappe..."

# Navigate to bench
cd "$BENCH_PATH" || exit 1

# If no site specified, try to detect it
if [ -z "$SITE" ]; then
    # Get first site
    SITE=$(ls -1 sites | grep -v "assets" | grep -v "common_site_config.json" | head -1)
    if [ -z "$SITE" ]; then
        echo "❌ No site found. Please specify site name."
        exit 1
    fi
    echo "📍 Auto-detected site: $SITE"
fi

# Use bench execute to run Python code
bench --site "$SITE" execute "
import frappe

try:
    # Get or create settings
    if not frappe.db.exists('F IceCore Settings', 'F IceCore Settings'):
        settings = frappe.new_doc('F IceCore Settings')
        settings.insert(ignore_permissions=True)
    else:
        settings = frappe.get_doc('F IceCore Settings', 'F IceCore Settings')

    # Update settings
    settings.turn_server = '$SERVER'
    settings.turn_secret = '$SECRET'
    settings.stun_port = 3478
    settings.turn_port = 3478
    settings.turns_port = 5349

    # Save
    settings.save(ignore_permissions=True)
    frappe.db.commit()

    print('✅ TURN credentials saved to F IceCore Settings')
    print('   Server: $SERVER')
    print('   Secret: [hidden]')
except Exception as e:
    print('❌ Failed to save credentials:', str(e))
    raise
"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Credentials successfully saved to Frappe!"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Restart bench: bench restart"
    echo "   2. Open F IceCore Settings in Frappe to verify"
    echo "   3. Test TURN connection from Settings"
    exit 0
else
    echo ""
    echo "❌ Failed to save credentials"
    echo ""
    echo "💡 You can manually update F IceCore Settings:"
    echo "   1. Go to: Settings → F IceCore Settings"
    echo "   2. Enter TURN Server: $SERVER"
    echo "   3. Enter TURN Secret: $SECRET"
    exit 1
fi
