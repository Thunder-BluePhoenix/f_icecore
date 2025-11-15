# F-IceCore Testing Guide

Complete guide for testing F-IceCore functionality.

## Table of Contents

1. [Running Tests](#running-tests)
2. [Test Coverage](#test-coverage)
3. [Manual Testing](#manual-testing)
4. [Integration Testing](#integration-testing)

## Running Tests

### Run All Tests

```bash
cd ~/frappe-bench/apps/f_icecore

# Using test runner script
bash run_tests.sh ~/frappe-bench your-site-name

# Or directly with bench
cd ~/frappe-bench
bench --site your-site run-tests --app f_icecore
```

### Run Specific Test Modules

```bash
cd ~/frappe-bench

# Test WebRTC signaling
bench --site your-site run-tests --module f_icecore.f_icecore.api.test_signaling

# Test user presence
bench --site your-site run-tests --module f_icecore.f_icecore.api.test_presence

# Test TURN credentials
bench --site your-site run-tests --module f_icecore.f_icecore.api.test_turn_credentials

# Test call sessions
bench --site your-site run-tests --module f_icecore.f_icecore.api.test_call_session
```

### Run Specific Test Cases

```bash
# Run a single test case
bench --site your-site run-tests \
  --module f_icecore.f_icecore.api.test_signaling \
  --test-case TestSignaling.test_initiate_call_creates_session
```

## Test Coverage

### 1. Signaling Tests (`test_signaling.py`)

Tests WebRTC signaling functionality:

- ✅ `test_initiate_call_creates_session` - Verify call session creation
- ✅ `test_send_offer_publishes_to_remote_user` - Test SDP offer transmission
- ✅ `test_send_answer_publishes_to_caller` - Test SDP answer transmission
- ✅ `test_send_ice_candidate_publishes_to_peer` - Test ICE candidate exchange
- ✅ `test_cannot_call_self` - Validate users can't call themselves
- ✅ `test_invalid_call_type_rejected` - Validate call type validation

**Coverage**: WebRTC offer/answer exchange, ICE negotiation, validation

### 2. Presence Tests (`test_presence.py`)

Tests user presence tracking:

- ✅ `test_update_presence_sets_online` - Test setting user online
- ✅ `test_presence_ttl_expires` - Verify presence expiration
- ✅ `test_heartbeat_updates_timestamp` - Test heartbeat mechanism
- ✅ `test_get_online_users_returns_active_users` - Test online user list
- ✅ `test_get_call_capable_users_filters_by_permissions` - Test permission filtering
- ✅ `test_different_presence_statuses` - Test status transitions
- ✅ `test_presence_update_broadcasts_event` - Test realtime events
- ✅ `test_cleanup_stale_presence` - Test presence cleanup

**Coverage**: Redis caching, TTL, heartbeat, realtime updates

### 3. TURN Credentials Tests (`test_turn_credentials.py`)

Tests TURN server credential generation:

- ✅ `test_get_turn_credentials_returns_valid_format` - Verify ICE server format
- ✅ `test_credentials_use_hmac_sha1` - Verify HMAC-SHA1 algorithm
- ✅ `test_credentials_match_coturn_format` - Verify Coturn compatibility
- ✅ `test_ttl_affects_username_timestamp` - Test TTL handling
- ✅ `test_get_credentials_without_settings_fails` - Test validation
- ✅ `test_test_turn_connection_with_valid_config` - Test connection testing
- ✅ `test_test_turn_connection_without_config` - Test error handling
- ✅ `test_credentials_include_all_transport_types` - Test UDP/TCP/TLS

**Coverage**: HMAC-SHA1, Coturn REST API, transport types

### 4. Call Session Tests (`test_call_session.py`)

Tests call history and session management:

- ✅ `test_create_call_session` - Test session creation
- ✅ `test_update_call_status` - Test status updates
- ✅ `test_end_call_sets_duration` - Test duration calculation
- ✅ `test_get_call_history` - Test history retrieval
- ✅ `test_get_call_stats` - Test statistics generation
- ✅ `test_cleanup_old_sessions` - Test session cleanup
- ✅ `test_call_history_enriched_with_user_details` - Test data enrichment
- ✅ `test_call_types_validated` - Test call type validation
- ✅ `test_call_status_transitions` - Test status state machine

**Coverage**: Database operations, statistics, cleanup, enrichment

## Test Results Example

```
test_initiate_call_creates_session (test_signaling.TestSignaling) ... ok
test_send_offer_publishes_to_remote_user (test_signaling.TestSignaling) ... ok
test_send_answer_publishes_to_caller (test_signaling.TestSignaling) ... ok
test_send_ice_candidate_publishes_to_peer (test_signaling.TestSignaling) ... ok
test_cannot_call_self (test_signaling.TestSignaling) ... ok
test_invalid_call_type_rejected (test_signaling.TestSignaling) ... ok

----------------------------------------------------------------------
Ran 6 tests in 0.234s

OK
```

## Manual Testing

### 1. TURN Connection Test

```bash
# Via Frappe UI
1. Login to Frappe
2. Go to: Settings → F IceCore Settings
3. Click "Test TURN Connection"
4. Should show green success message

# Via bench console
bench --site your-site console

>>> frappe.call('f_icecore.f_icecore.api.turn_credentials.test_turn_connection')
```

### 2. Presence Test

```javascript
// Open browser console on two different browsers/tabs with different users

// User 1 - Set online
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.update_presence',
    args: { status: 'online' },
    callback: (r) => console.log('User 1 online:', r.message)
});

// User 2 - Get online users
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.get_online_users',
    callback: (r) => console.log('Online users:', r.message)
});
// Should see User 1 in the list
```

### 3. Call Flow Test

```javascript
// User 1 (Caller) - Browser 1
window.FIceCoreUI.initiateCall('user2@example.com', 'audio');

// User 2 (Callee) - Browser 2
// Should see incoming call dialog
// Click "Accept"

// Both users should now be connected
// Test mute: Ctrl+M
// Test hangup: Ctrl+Shift+H
```

### 4. Call History Test

```javascript
// After making calls, check history
frappe.call({
    method: 'f_icecore.f_icecore.api.call_session.get_call_history',
    args: { limit: 10 },
    callback: (r) => console.log('Call history:', r.message)
});
```

### 5. Navbar Button Test

```javascript
// Check if navbar button exists
console.log('Navbar button:', $('#f-icecore-navbar-btn').length);
// Should return 1

// Click it programmatically
$('#f-icecore-navbar-btn a').click();
// Should open call panel
```

## Integration Testing

### Two-User Call Scenario

**Setup:**
1. Open two browser windows (or use incognito)
2. Login as User A in Window 1
3. Login as User B in Window 2

**Test Steps:**

1. **Presence Check**
   - Window 1: Click phone icon in navbar
   - Verify User B appears in "Online Users" list
   - Status should be green (online)

2. **Initiate Audio Call**
   - Window 1: Click phone icon next to User B
   - Window 2: Should see incoming call dialog
   - Verify ringtone plays

3. **Accept Call**
   - Window 2: Click "Accept"
   - Both windows: Should see call window
   - Verify call timer starts

4. **Test Audio**
   - Speak in Window 1, listen in Window 2
   - Speak in Window 2, listen in Window 1
   - Verify two-way audio works

5. **Test Mute**
   - Window 1: Press Ctrl+M or click mute button
   - Window 2: Should not hear User A
   - Window 1: Press Ctrl+M again to unmute

6. **End Call**
   - Either window: Press Ctrl+Shift+H or click hangup
   - Both windows: Call should end
   - Verify call duration was recorded

7. **Check Call History**
   - Both windows: Click phone icon → Call History tab
   - Verify call appears in history
   - Verify duration is correct
   - Test "Call Back" button

### Video Call Test

Same as audio call, but:
1. Click video button instead of phone button
2. Grant camera permissions when prompted
3. Verify video appears in both windows
4. Test camera toggle button

### Screen Sharing Test

1. Initiate screen share call
2. Select window/screen to share
3. Verify remote user sees shared screen
4. Test stopping screen share

## Performance Testing

### Load Test

```python
# Test multiple simultaneous calls
bench --site your-site console

import frappe
from f_icecore.f_icecore.api.call_session import create_call_session

# Create 100 concurrent call sessions
for i in range(100):
    create_call_session(
        from_user=f"user{i}@example.com",
        to_user=f"user{i+1}@example.com",
        call_type="audio"
    )

frappe.db.commit()
```

### Presence Scale Test

```python
# Test 1000 online users
from f_icecore.f_icecore.api.presence import update_presence

for i in range(1000):
    frappe.session.user = f"user{i}@example.com"
    update_presence(status="online")
```

## Debugging Tests

### Enable Debug Logging

```python
# In test file
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Run Tests with Verbose Output

```bash
bench --site your-site run-tests --app f_icecore --verbose --pdb-on-exceptions
```

### Check Test Database

```python
bench --site your-site console

>>> frappe.db.get_all('F IceCore Call Session', fields=['*'])
>>> frappe.cache().get_value('f_icecore:presence:user@example.com')
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: F-IceCore Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install Frappe
        run: |
          # Install Frappe bench
      - name: Install F-IceCore
        run: |
          bench get-app f_icecore
          bench --site test install-app f_icecore
      - name: Run Tests
        run: |
          bench --site test run-tests --app f_icecore
```

## Test Maintenance

### Adding New Tests

1. Create test file in `f_icecore/f_icecore/api/`
2. Name it `test_<module>.py`
3. Create test class inheriting from `unittest.TestCase`
4. Add test methods starting with `test_`
5. Run tests to verify

### Test Best Practices

- ✅ Use descriptive test names
- ✅ Test one thing per test method
- ✅ Clean up after tests (tearDown)
- ✅ Mock external dependencies
- ✅ Test both success and failure cases
- ✅ Use assertions with helpful messages

## Troubleshooting

### Tests Fail with "Module not found"

```bash
# Make sure app is installed
bench --site your-site install-app f_icecore

# Rebuild
bench build --app f_icecore
```

### Redis Connection Errors

```bash
# Make sure Redis is running
bench start
```

### Permission Errors

```bash
# Run as Administrator in tests
frappe.set_user("Administrator")
```

---

**Happy Testing! 🧪**

For more information, see:
- [USER_GUIDE.md](USER_GUIDE.md) - User manual
- [README.md](README.md) - Installation guide
- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Advanced testing
