#!/bin/bash

##############################################################################
# F-IceCore Test Runner
# Run all tests for F-IceCore application
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_PATH="${1:-$HOME/frappe-bench}"
SITE="${2:-}"

echo "🧪 F-IceCore Test Runner"
echo "========================"
echo ""

# Navigate to bench
cd "$BENCH_PATH" || exit 1

# Detect site if not provided
if [ -z "$SITE" ]; then
    SITE=$(ls -1 sites | grep -v "assets" | grep -v "common_site_config.json" | head -1)
    if [ -z "$SITE" ]; then
        echo "❌ No site found. Please specify site name."
        echo "Usage: $0 [bench_path] [site_name]"
        exit 1
    fi
    echo "📍 Auto-detected site: $SITE"
fi

echo ""
echo "Running F-IceCore tests..."
echo ""

# Run all tests
bench --site "$SITE" run-tests --app f_icecore --verbose

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ All tests passed!"
else
    echo "❌ Some tests failed (exit code: $EXIT_CODE)"
fi

echo ""
echo "📊 Test Summary"
echo "==============="
echo "To run specific test modules:"
echo ""
echo "  # Test signaling"
echo "  bench --site $SITE run-tests --module f_icecore.f_icecore.api.test_signaling"
echo ""
echo "  # Test presence"
echo "  bench --site $SITE run-tests --module f_icecore.f_icecore.api.test_presence"
echo ""
echo "  # Test TURN credentials"
echo "  bench --site $SITE run-tests --module f_icecore.f_icecore.api.test_turn_credentials"
echo ""
echo "  # Test call sessions"
echo "  bench --site $SITE run-tests --module f_icecore.f_icecore.api.test_call_session"
echo ""

exit $EXIT_CODE
