# ❄️ F-IceCore

**WebRTC Calling | Video Calling | Screen Sharing | Group Calls for Frappe**

F-IceCore is a comprehensive Frappe application that brings Discord-like calling capabilities to your Frappe/ERPNext instance. It features 1:1 and group audio/video calls, mid-call screen sharing, real-time presence tracking, automatic STUN/TURN server setup, and a dual-transport signaling layer that works over both SocketIO and HTTP polling.

---

## Features

### Calling

- **Audio Calling** &mdash; Peer-to-peer audio with echo cancellation, noise suppression, and auto gain control
- **Video Calling** &mdash; HD video (up to 1280x720 @ 30 fps) with camera toggle and PIP controls
- **Screen Sharing** &mdash; Share your screen mid-call with focus mode and automatic renegotiation; works in both 1:1 and group calls
- **Group Calls** &mdash; Full-mesh WebRTC topology supporting up to 8 participants (configurable), with per-participant video tiles and adaptive grid layout
- **Mid-Call Add Participant** &mdash; Add new users to an ongoing 1:1 or group call via an in-call search dialog
- **1:1 to Group Upgrade** &mdash; Seamlessly upgrade a 1:1 call to a group call by inviting a third participant
- **Call Window Recovery** &mdash; If the call popup is accidentally closed, click the phone icon to reopen the active call

### Presence and Discovery

- **Real-Time Presence** &mdash; Online, offline, busy, in_call, and away status backed by Redis with 5-minute TTL heartbeat
- **User Search** &mdash; Search users by email, full name, phone, or mobile number with debounced input
- **Pagination** &mdash; Paginated user list in the call panel (configurable page size)
- **Multi-Select** &mdash; Select multiple users to initiate a group call directly from the call panel

### Transport and Reliability

- **Dual-Write Signaling** &mdash; Every signal (offer, answer, ICE candidate, call event) is sent via both SocketIO and a Redis queue, ensuring delivery regardless of transport
- **HTTP Polling Fallback** &mdash; When SocketIO is unavailable (e.g. mobile browsers over IP), the engine automatically polls the server for pending signals with prioritized dispatch
- **Automatic Reconnection** &mdash; Monitors SocketIO connect/disconnect events and toggles between transports transparently

### Security and Infrastructure

- **STUN/TURN Setup** &mdash; One-command Coturn installation with auto-generated HMAC-SHA1 time-limited credentials
- **NAT Traversal** &mdash; Works behind firewalls and symmetric NATs via TURN relay
- **HTTPS Proxy** &mdash; Built-in HTTPS proxy utility and WSS SocketIO override for secure deployments
- **Permission System** &mdash; Role-based call permission checks

### UI/UX

- **Discord-Inspired Interface** &mdash; Clean call windows with overlay controls, PIP video, focus mode
- **Incoming Call Notifications** &mdash; Desktop notifications, ringtone, pulsing green dot on navbar icon
- **Adaptive Group Grid** &mdash; Video grid automatically adjusts layout for 1-5+ participants
- **Dark Mode** &mdash; Automatic dark mode support via `prefers-color-scheme`
- **Mobile Responsive** &mdash; Smaller video containers and buttons on mobile viewports
- **Call History and Stats** &mdash; View past calls, answer rate, total duration, and missed calls

---

## Quick Start

### Installation

```bash
# Navigate to your bench directory
cd ~/frappe-bench

# Get the app
bench get-app https://github.com/Thunder-BluePhoenix/f_icecore

# Install on your site
bench --site your-site.local install-app f_icecore

# Run migrations
bench --site your-site.local migrate

# Build assets
bench build --app f_icecore

# Restart
bench restart
```

### Coturn STUN/TURN Server Setup

For reliable calls behind NATs and firewalls, install Coturn:

```bash
cd ~/frappe-bench/apps/f_icecore
sudo bash install_scripts/install_coturn.sh
```

This will install Coturn, generate secure credentials, configure the systemd service, and save the config.

### Firewall Ports

Open the required ports on your server:

| Port | Protocol | Purpose |
|------|----------|---------|
| 3478 | TCP/UDP | STUN + TURN |
| 5349 | TCP/UDP | TURNS (TLS) |
| 49152-65535 | UDP | RTP/RTCP media relay |

```bash
# UFW
sudo ufw allow 3478/tcp && sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp && sudo ufw allow 5349/udp
sudo ufw allow 49152:65535/udp

# firewalld
sudo firewall-cmd --permanent --add-port=3478/tcp
sudo firewall-cmd --permanent --add-port=3478/udp
sudo firewall-cmd --permanent --add-port=5349/tcp
sudo firewall-cmd --permanent --add-port=5349/udp
sudo firewall-cmd --permanent --add-port=49152-65535/udp
sudo firewall-cmd --reload
```

---

## Usage

### Making a Call

**From the Call Panel:**
1. Click the phone icon in the navbar
2. Browse online users or search by name/email/phone
3. Click the audio or video button next to a user for a 1:1 call
4. Or select multiple users (checkboxes) and click "Group Audio Call" or "Group Video Call"

**Programmatic:**
```javascript
// 1:1 audio call
window.FIceCoreUI.initiateCall('user@example.com', 'audio');

// 1:1 video call
window.FIceCoreUI.initiateCall('user@example.com', 'video');

// Group call
window.FIceCoreGroup.startGroupCall(['user1@example.com', 'user2@example.com'], 'video');
```

### During a Call

| Control | Description |
|---------|-------------|
| Mute | Toggle microphone on/off |
| Stop Video | Toggle camera on/off (video calls) |
| Share Screen | Share your screen with the other participant(s) |
| Add | Add another participant (upgrades to group call if 1:1) |
| Focus | Expand the remote video to fill the container |
| Hide PIP | Show/hide your local video preview |
| End Call | Hang up the call |

### Receiving a Call

When someone calls you:
1. A ringtone plays and a popup dialog appears
2. Desktop notification is shown (if permissions granted)
3. The navbar phone icon shows a green pulsing dot and badge count
4. Click **Accept** to join or **Decline** to reject

### Call Window Recovery

If you accidentally close the call popup while a call is still active:
- A blue alert says "Call is still active. Click the phone icon to reopen."
- Click the phone icon in the navbar to reopen the call window with all streams re-attached

---

## Configuration

### F IceCore Settings

Navigate to **Settings > F IceCore Settings** in the Desk.

**TURN/STUN Server:**
| Field | Description | Default |
|-------|-------------|---------|
| TURN Server | Hostname or IP of your Coturn server | &mdash; |
| TURN Secret | Shared secret for HMAC-SHA1 credentials | &mdash; |
| STUN Port | STUN listening port | 3478 |
| TURN Port | TURN listening port | 3478 |
| TURNS Port | TURN-over-TLS port | 5349 |

**Features:**
| Field | Description | Default |
|-------|-------------|---------|
| Enable Audio Calls | Toggle audio calling | Enabled |
| Enable Video Calls | Toggle video calling | Enabled |
| Enable Screen Sharing | Toggle screen sharing | Enabled |
| Max Group Call Participants | Maximum users per group call | 5 (max 8) |
| Max Call Duration | Auto-end after N seconds (0 = unlimited) | 0 |
| Enable Call History | Track call records | Enabled |
| Cleanup Old Calls | Delete records older than N days | 90 |

**Advanced:**
| Field | Description | Default |
|-------|-------------|---------|
| Custom Ringtone | Path to custom ringtone audio | &mdash; |
| Custom Calling Tone | Path to custom outgoing tone | &mdash; |
| Enable Debug Logs | Verbose console logging | Disabled |
| Auto Answer Calls | Auto-accept incoming calls (testing only) | Disabled |

### Site Config Alternative

Add TURN config to `site_config.json`:

```json
{
  "f_icecore_turn": {
    "server": "your-server.com",
    "secret": "your-secret-key",
    "stun_port": 3478,
    "turn_port": 3478,
    "turns_port": 5349
  }
}
```

---

## Architecture

```
Frontend (Browser)
 |
 |-- webrtc_engine.js ............. Core 1:1 WebRTC engine
 |     |-- Peer connection lifecycle (offer/answer/ICE)
 |     |-- Media stream management (getUserMedia, getDisplayMedia)
 |     |-- Screen share with mid-call renegotiation
 |     |-- HTTP polling fallback (auto-detects SocketIO state)
 |     '-- Presence heartbeat (60s interval)
 |
 |-- group_webrtc_engine.js ....... Group call mesh WebRTC engine
 |     |-- N-1 peer connections per participant
 |     |-- Offer collision prevention (existing users send offers to joiners)
 |     |-- Group screen sharing across all peer connections
 |     '-- Participant join/leave lifecycle
 |
 |-- call_ui.js ................... Call UI layer
 |     |-- Incoming call dialogs & ringtone
 |     |-- 1:1 call window (audio/video/screen share/add participant)
 |     |-- Group call window (video grid, participant tiles)
 |     |-- Call window recovery on re-click
 |     '-- Navbar notifications & SocketIO status
 |
 |-- f_icecore_boot.js ............ App initialization
 |     |-- Navbar phone icon
 |     |-- Call panel (search, pagination, multi-select)
 |     |-- Group call initiation
 |     '-- HTTPS/WSS SocketIO port override
 |
 '-- f_icecore.css ................ Discord-inspired styling
       |-- Dark mode support
       |-- Adaptive group video grid
       '-- Animations (pulse, ring, slideIn)

Backend (Python / Frappe)
 |
 |-- api/signaling.py ............. 1:1 call signaling
 |     |-- initiate_call, accept_call, reject_call, end_call
 |     |-- send_offer, send_answer, send_ice_candidate
 |     |-- poll_signals (HTTP polling endpoint)
 |     '-- _publish_and_queue (dual-write: SocketIO + Redis)
 |
 |-- api/group_signaling.py ....... Group call signaling
 |     |-- initiate_group_call, accept, reject, leave
 |     |-- add_participant_to_group_call
 |     |-- upgrade_to_group_call (1:1 -> group)
 |     '-- send_group_offer/answer/ice_candidate
 |
 |-- api/presence.py .............. User presence system
 |     |-- Redis-based status with 5-min TTL
 |     |-- heartbeat, get_online_users
 |     |-- search_users (email, name, phone with pagination)
 |     '-- cleanup_stale_presence (scheduler)
 |
 |-- api/turn_credentials.py ...... TURN authentication
 |     |-- HMAC-SHA1 time-limited credential generation
 |     |-- get_ice_servers (STUN + TURN + TURNS URLs)
 |     '-- test_turn_connection
 |
 |-- api/call_session.py .......... Call history
 |     |-- get_active_calls, get_call_history
 |     |-- get_call_stats (total, answered, missed, avg duration)
 |     '-- cleanup_old_sessions (scheduler, 90-day retention)
 |
 '-- api/permissions.py ........... Access control
       '-- check_call_permission, has_app_permission

Infrastructure
 |-- Coturn ............... STUN/TURN relay server
 |-- Redis ................ Presence cache + signal queue
 '-- SocketIO ............. Real-time event transport
```

---

## DocTypes

### F IceCore Call Session

Stores 1:1 call records. Auto-named `CALL-{YYYY}-{#####}`.

| Field | Type | Description |
|-------|------|-------------|
| from_user | Link (User) | Caller |
| to_user | Link (User) | Recipient |
| call_type | Select | audio, video, screen |
| status | Select | Ringing, Active, Ended, Rejected |
| accepted_at | Datetime | When the call was accepted |
| ended_at | Datetime | When the call ended |
| duration | Int | Duration in seconds (auto-calculated) |
| end_reason | Small Text | Reason for ending |
| metadata | Long Text | JSON metadata |
| quality_metrics | Long Text | JSON quality data |

### F IceCore Group Call Session

Stores group call records. Auto-named `GCALL-{YYYY}-{#####}`.

| Field | Type | Description |
|-------|------|-------------|
| initiator | Link (User) | User who started the call |
| call_type | Select | audio, video |
| status | Select | Ringing, Active, Ended |
| max_participants | Int | Max allowed participants |
| participants | Table | Child table of participants |
| created_at | Datetime | Call start time |
| ended_at | Datetime | Call end time |
| duration | Int | Duration in seconds |
| end_reason | Small Text | Reason for ending |

### F IceCore Group Call Participant

Child table for group call participants.

| Field | Type | Description |
|-------|------|-------------|
| user | Link (User) | Participant email |
| status | Select | Invited, Ringing, Connected, Disconnected, Rejected |
| is_initiator | Check | Whether this user started the call |
| joined_at | Datetime | When the user joined |
| left_at | Datetime | When the user left |

### F IceCore Settings

Singleton doctype for global configuration (see Configuration section above).

---

## API Reference

### Signaling

```javascript
// Initiate a 1:1 call
frappe.call({
    method: 'f_icecore.f_icecore.api.signaling.initiate_call',
    args: { to_user: 'user@example.com', call_type: 'audio' }
});

// Accept a call
frappe.call({
    method: 'f_icecore.f_icecore.api.signaling.accept_call',
    args: { call_id: 'CALL-2025-00001' }
});

// End a call
frappe.call({
    method: 'f_icecore.f_icecore.api.signaling.end_call',
    args: { call_id: 'CALL-2025-00001' }
});

// Poll for signals (HTTP polling fallback)
frappe.call({
    method: 'f_icecore.f_icecore.api.signaling.poll_signals',
    type: 'GET'
});
```

### Group Signaling

```javascript
// Start a group call
frappe.call({
    method: 'f_icecore.f_icecore.api.group_signaling.initiate_group_call',
    args: {
        participants_json: JSON.stringify(['user1@example.com', 'user2@example.com']),
        call_type: 'video'
    }
});

// Accept a group call invitation
frappe.call({
    method: 'f_icecore.f_icecore.api.group_signaling.accept_group_call',
    args: { group_call_id: 'GCALL-2025-00001' }
});

// Add participant mid-call
frappe.call({
    method: 'f_icecore.f_icecore.api.group_signaling.add_participant_to_group_call',
    args: { group_call_id: 'GCALL-2025-00001', new_user: 'user3@example.com' }
});

// Upgrade 1:1 to group call
frappe.call({
    method: 'f_icecore.f_icecore.api.group_signaling.upgrade_to_group_call',
    args: {
        current_call_id: 'CALL-2025-00001',
        new_user: 'user3@example.com',
        call_type: 'audio'
    }
});
```

### Presence

```javascript
// Update your status
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.update_presence',
    args: { status: 'online' }
});

// Search users with pagination
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.search_users',
    args: { query: 'john', page: 1, page_size: 10 }
});

// Get online users
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.get_online_users'
});
```

### TURN Credentials

```javascript
// Get ICE servers for WebRTC
frappe.call({
    method: 'f_icecore.f_icecore.api.turn_credentials.get_ice_servers',
    callback: (r) => {
        const pc = new RTCPeerConnection({ iceServers: r.message });
    }
});

// Test TURN server connectivity
frappe.call({
    method: 'f_icecore.f_icecore.api.turn_credentials.test_turn_connection'
});
```

### Call History

```javascript
// Get call history
frappe.call({
    method: 'f_icecore.f_icecore.api.call_session.get_call_history',
    args: { limit: 50 }
});

// Get call statistics
frappe.call({
    method: 'f_icecore.f_icecore.api.call_session.get_call_stats'
});
```

---

## Real-Time Events

F-IceCore uses the following SocketIO events (all also queued to Redis for HTTP polling):

| Event | Direction | Description |
|-------|-----------|-------------|
| `f_icecore:incoming_call` | Server -> Client | New incoming 1:1 call |
| `call_accepted` | Server -> Client | Call was accepted |
| `call_rejected` | Server -> Client | Call was rejected |
| `call_ended` | Server -> Client | Call ended |
| `f_icecore:webrtc_offer:{user}` | Peer -> Peer | WebRTC SDP offer |
| `f_icecore:webrtc_answer:{user}` | Peer -> Peer | WebRTC SDP answer |
| `f_icecore:ice_candidate:{user}` | Peer -> Peer | ICE candidate |
| `f_icecore:incoming_group_call` | Server -> Client | New group call invitation |
| `f_icecore:group_participant_joined` | Server -> Client | Participant joined group call |
| `f_icecore:group_participant_left` | Server -> Client | Participant left group call |
| `f_icecore:group_call_ended` | Server -> Client | Group call ended |
| `f_icecore:upgrade_to_group_call` | Server -> Client | 1:1 call upgraded to group |
| `f_icecore:group_webrtc_offer:{user}` | Peer -> Peer | Group call SDP offer |
| `f_icecore:group_webrtc_answer:{user}` | Peer -> Peer | Group call SDP answer |
| `f_icecore:group_ice_candidate:{user}` | Peer -> Peer | Group call ICE candidate |

---

## Development

### Setup

```bash
git clone https://github.com/Thunder-BluePhoenix/f_icecore
cd f_icecore

# Install pre-commit hooks
pre-commit install
```

### Build

```bash
bench build --app f_icecore
bench --site your-site.local clear-cache
```

### Validate Setup

```bash
python install_scripts/validate_setup.py
```

### Run Tests

```bash
bench --site your-site.local run-tests --app f_icecore
```

---

## Troubleshooting

### Calls Not Connecting

1. **Check Coturn:** `sudo systemctl status coturn` and `sudo tail -f /var/log/turnserver.log`
2. **Verify firewall:** Ensure ports 3478, 5349, and 49152-65535 are open
3. **Test TURN:** Use the "Test Connection" button in F IceCore Settings
4. **Check browser console** for WebRTC errors (`Failed to set remote description`, `ICE failed`, etc.)

### No Audio or Video

1. Ensure the site is served over **HTTPS** (WebRTC requires a secure context for `getUserMedia`)
2. Check browser permissions for camera and microphone
3. Look for `getUserMedia` errors in the console

### Users Showing as Offline

1. Verify Redis is running: `redis-cli ping`
2. Check the presence heartbeat in the browser console (should fire every 60 seconds)
3. Ensure SocketIO is connected (check the indicator in the navbar)

### Screen Sharing Not Working

1. Screen sharing requires **HTTPS**
2. `getDisplayMedia` is not available on HTTP connections
3. For audio-only calls, screen sharing triggers a renegotiation; check for `handleRenegotiationOffer` errors in the console

### Group Calls Stuck on "Connecting"

1. Check that all participants have working SocketIO or HTTP polling
2. Look for `[Group] Connection state` logs in the console
3. Verify the group call session status in the database: `frappe.get_doc("F IceCore Group Call Session", "GCALL-...")`

---

## Project Structure

```
f_icecore/
+-- f_icecore/
|   +-- hooks.py                          # Frappe hooks and app metadata
|   +-- api/
|   |   +-- signaling.py                  # 1:1 call signaling + HTTP polling
|   |   +-- group_signaling.py            # Group call signaling
|   |   +-- presence.py                   # User presence (Redis-backed)
|   |   +-- call_session.py               # Call history and stats
|   |   +-- turn_credentials.py           # TURN credential generation
|   |   +-- permissions.py                # Access control
|   |   +-- test_*.py                     # API tests
|   +-- doctype/
|   |   +-- f_icecore_settings/           # Global config (singleton)
|   |   +-- f_icecore_call_session/       # 1:1 call records
|   |   +-- f_icecore_group_call_session/ # Group call records
|   |   +-- f_icecore_group_call_participant/ # Group call child table
|   +-- install/
|   |   +-- setup.py                      # Post-install hook
|   |   +-- configure_turn.py             # TURN configuration helper
|   +-- public/
|   |   +-- js/
|   |   |   +-- webrtc_engine*.js         # Core WebRTC engine
|   |   |   +-- group_webrtc_engine*.js   # Group call mesh engine
|   |   |   +-- call_ui*.js              # Call UI component
|   |   |   +-- f_icecore.bundle*.js     # Additional features
|   |   |   +-- f_icecore_boot*.js       # App initialization
|   |   +-- css/
|   |   |   +-- f_icecore.css            # All styles
|   |   +-- sounds/                       # Audio assets
+-- install_scripts/
|   +-- install_coturn.sh                 # Coturn auto-installer
|   +-- uninstall_coturn.sh               # Coturn removal
|   +-- https_proxy.js                    # HTTPS proxy utility
|   +-- validate_setup.py                 # Setup validation
+-- pyproject.toml
+-- README.md
```

---

## Scheduled Tasks

| Task | Frequency | Description |
|------|-----------|-------------|
| `cleanup_stale_presence` | Every minute | Removes expired presence keys from Redis |
| `cleanup_old_sessions` | Hourly | Deletes call session records older than the configured retention period (default 90 days) |

---

## Roadmap

- [x] Audio calling (1:1)
- [x] Video calling (1:1)
- [x] Screen sharing (mid-call)
- [x] HTTP polling fallback
- [x] Real-time presence system
- [x] Call history and statistics
- [x] User search with pagination
- [x] Multi-select group calling
- [x] Group calls (full mesh, up to 8 participants)
- [x] Mid-call add participant
- [x] 1:1 to group call upgrade
- [x] Group call screen sharing
- [x] Call window recovery
- [x] Call recording
- [x] Call transfer
- [ ] End-to-end encryption
- [ ] Mobile app support
- [ ] Virtual backgrounds
- [ ] Noise cancellation

---

## License

GPL-3.0

## Contributing

Contributions are welcome. Please fork the repository, create a feature branch, and submit a pull request.

## Support

- **Issues:** [GitHub Issues](https://github.com/Thunder-BluePhoenix/f_icecore/issues)
- **Email:** bluephoenix00995@gmail.com

---

**Made with &#10052; by Thunder BluePhoenix**
