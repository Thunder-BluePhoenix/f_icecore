# F-IceCore Testing Guide

Complete guide for testing F-IceCore after installation.

## Prerequisites

✅ F-IceCore installed on your Frappe site
✅ Site is running (`bench start`)
✅ At least 2 users created for testing
✅ Redis is running
✅ SocketIO is working

## Quick Start Testing

### 1. Basic Installation Test

**Open browser console** and run:

```javascript
// Check if F-IceCore is loaded
console.log(window.FIceCore);
console.log(window.FIceCoreUI);

// Should output: FIceCoreWebRTC object
// Should output: FIceCoreCallUI object
```

✅ **Expected:** Both objects should be defined
❌ **If undefined:** JavaScript not loaded, check `bench build`

### 2. Test TURN Credentials

```javascript
frappe.call({
    method: 'f_icecore.f_icecore.api.turn_credentials.get_ice_servers',
    callback: (r) => {
        console.log('ICE Servers:', r.message);
    }
});
```

✅ **Expected:** Array with STUN/TURN server configuration
⚠️ **If empty/error:** TURN server not configured (okay for testing with public STUN)

### 3. Test Presence System

```javascript
// Update your presence
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.update_presence',
    args: { status: 'online' },
    callback: (r) => console.log('Presence updated:', r.message)
});

// Get online users
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.get_online_users',
    callback: (r) => console.log('Online users:', r.message)
});
```

✅ **Expected:** Your user should appear in online users list

### 4. Test Signaling API

```javascript
// Test call initiation (replace with actual username)
frappe.call({
    method: 'f_icecore.f_icecore.api.signaling.initiate_call',
    args: {
        to_user: 'test@example.com',
        call_type: 'audio'
    },
    callback: (r) => console.log('Call initiated:', r.message)
});
```

✅ **Expected:** Call session created
❌ **If fails:** Check user exists and is online

## Full Call Flow Testing

### Setup: Two Browser Windows

1. **Window A:** Login as User A (`user1@example.com`)
2. **Window B:** Login as User B (`user2@example.com`)

### Test Audio Call

**In Window A (Caller):**

```javascript
// Initiate audio call
window.FIceCoreUI.initiateCall('user2@example.com', 'audio');
```

**Expected behavior:**
1. ✅ Calling dialog appears in Window A
2. ✅ Ringtone plays in Window B
3. ✅ Incoming call dialog appears in Window B
4. ✅ Browser asks for microphone permission

**In Window B (Receiver):**

Click "Accept" button or run:
```javascript
// Get the call_id from the dialog and accept
window.FIceCoreUI.acceptCall('CALL-2025-00001', 'user1@example.com', 'audio');
```

**Expected behavior:**
1. ✅ Call window opens in both browsers
2. ✅ Audio should connect (may take 5-10 seconds)
3. ✅ You should hear each other
4. ✅ Mute/unmute buttons work

**Test Hangup:**

In either window:
```javascript
window.FIceCoreUI.hangup();
```

✅ **Expected:** Call ends in both windows

### Test Video Call

**In Window A:**
```javascript
window.FIceCoreUI.initiateCall('user2@example.com', 'video');
```

**Expected behavior:**
1. ✅ Browser asks for camera and microphone permission
2. ✅ Local video preview appears
3. ✅ Remote video appears after connection
4. ✅ Video toggle button works

### Test Screen Sharing

**In Window A:**
```javascript
window.FIceCoreUI.initiateCall('user2@example.com', 'screen');
```

**Expected behavior:**
1. ✅ Browser asks which screen/window to share
2. ✅ Selected screen appears in remote video
3. ✅ Sharing stops when hangup

## Testing Presence Features

### Test Online Status

**Window A:**
```javascript
// Set status to busy
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.update_presence',
    args: { status: 'busy' }
});
```

**Window B:**
```javascript
// Check user presence
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.get_user_presence',
    args: { user: 'user1@example.com' },
    callback: (r) => console.log('User status:', r.message.status)
});
```

✅ **Expected:** Status should be "busy"

### Test Call Rejection

**Window A:** Initiate call
**Window B:** Click "Decline" or run:

```javascript
window.FIceCoreUI.rejectCall('CALL-2025-00001');
```

✅ **Expected:**
- Call rejected message in Window A
- No connection established

## Testing Call History

```javascript
// Get call history
frappe.call({
    method: 'f_icecore.f_icecore.api.call_session.get_call_history',
    args: { limit: 10 },
    callback: (r) => {
        console.log('Call history:', r.message);
        // Should show recent calls
    }
});

// Get call statistics
frappe.call({
    method: 'f_icecore.f_icecore.api.call_session.get_call_stats',
    callback: (r) => {
        console.log('Call stats:', r.message);
        // Shows total calls, answered calls, etc.
    }
});
```

## Testing Keyboard Shortcuts

1. **Quick Call Dialog:** Press `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac)
   - ✅ Dialog should appear
   - ✅ User search should work
   - ✅ Call type selection works

2. **During Call:**
   - `Ctrl+M`: Toggle mute
   - `Ctrl+Shift+H`: Hang up

## Troubleshooting Common Issues

### ❌ No audio/video

**Check:**
1. Browser permissions granted?
2. Microphone/camera not in use by another app?
3. Check browser console for errors
4. Try in Chrome/Firefox (best WebRTC support)

**Fix:**
```javascript
// Check if getUserMedia is supported
navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    .then(stream => {
        console.log('✅ Media access granted');
        stream.getTracks().forEach(track => track.stop());
    })
    .catch(err => console.error('❌ Media access denied:', err));
```

### ❌ Calls not connecting

**Check:**
1. Are both users online?
2. Is Redis running? `bench start` should show redis_cache
3. Is SocketIO connected?

**Test SocketIO:**
```javascript
// Check SocketIO connection
console.log('SocketIO connected:', frappe.socketio.socket.connected);

// Listen for test event
frappe.realtime.on('test_event', (data) => console.log('Received:', data));

// Send test event (from another window/user)
frappe.publish_realtime('test_event', { message: 'Hello' });
```

### ❌ "User is not online" error

**Check presence:**
```javascript
// Force presence update
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.heartbeat',
    callback: (r) => console.log('Heartbeat:', r.message)
});

// Check Redis
frappe.call({
    method: 'frappe.utils.redis_wrapper.get_value',
    args: { key: 'f_icecore:presence:' + frappe.session.user },
    callback: (r) => console.log('Redis presence:', r.message)
});
```

### ❌ ICE connection failed

This usually means NAT traversal issues.

**Solutions:**
1. Install Coturn TURN server (production)
2. Check firewall allows UDP traffic
3. Test with both users on same network first

**Verify ICE servers:**
```javascript
window.FIceCore.loadIceServers().then(() => {
    console.log('ICE Servers:', window.FIceCore.iceServers);
});
```

## Performance Testing

### Test Call Quality

**During an active call:**
```javascript
// Check peer connection stats
if (window.FIceCore.peerConnection) {
    window.FIceCore.peerConnection.getStats().then(stats => {
        stats.forEach(report => {
            if (report.type === 'inbound-rtp') {
                console.log('Packets received:', report.packetsReceived);
                console.log('Packets lost:', report.packetsLost);
                console.log('Jitter:', report.jitter);
            }
        });
    });
}
```

### Test Concurrent Calls

**Note:** Current version supports 1-on-1 calls only.

## Advanced Testing

### Test TURN Server (if installed)

```javascript
frappe.call({
    method: 'f_icecore.f_icecore.api.turn_credentials.test_turn_connection',
    callback: (r) => console.log('TURN test:', r.message)
});
```

### Test Call Session Creation

```javascript
// Manually create call session
frappe.call({
    method: 'frappe.client.insert',
    args: {
        doc: {
            doctype: 'F IceCore Call Session',
            from_user: frappe.session.user,
            to_user: 'test@example.com',
            call_type: 'audio',
            status: 'Ringing'
        }
    },
    callback: (r) => console.log('Call session:', r.message)
});
```

### Monitor Real-time Events

```javascript
// Log all F-IceCore real-time events
const user = frappe.session.user;

frappe.realtime.on(`f_icecore:incoming_call:${user}`, (data) => {
    console.log('📞 Incoming call:', data);
});

frappe.realtime.on(`f_icecore:call_accepted:${user}`, (data) => {
    console.log('✅ Call accepted:', data);
});

frappe.realtime.on(`f_icecore:call_rejected:${user}`, (data) => {
    console.log('❌ Call rejected:', data);
});

frappe.realtime.on(`f_icecore:call_ended:${user}`, (data) => {
    console.log('📴 Call ended:', data);
});

frappe.realtime.on(`f_icecore:webrtc_offer:${user}`, (data) => {
    console.log('📨 WebRTC offer:', data);
});

frappe.realtime.on(`f_icecore:webrtc_answer:${user}`, (data) => {
    console.log('📬 WebRTC answer:', data);
});

frappe.realtime.on(`f_icecore:ice_candidate:${user}`, (data) => {
    console.log('🧊 ICE candidate:', data);
});
```

## Test Checklist

Copy this checklist for your testing:

### Basic Functionality
- [ ] JavaScript loads without errors
- [ ] CSS loads and styles apply
- [ ] TURN credentials can be fetched
- [ ] Presence update works
- [ ] Online users list works

### Audio Calls
- [ ] Can initiate audio call
- [ ] Incoming call notification appears
- [ ] Can accept call
- [ ] Audio connects
- [ ] Can hear other user
- [ ] Mute/unmute works
- [ ] Can end call
- [ ] Can reject call

### Video Calls
- [ ] Can initiate video call
- [ ] Camera permission requested
- [ ] Local video appears
- [ ] Remote video appears
- [ ] Video toggle works
- [ ] Can end video call

### Screen Sharing
- [ ] Can initiate screen share
- [ ] Screen selection dialog appears
- [ ] Shared screen appears on remote
- [ ] Can stop sharing

### Call History
- [ ] Calls are recorded
- [ ] Call history displays correctly
- [ ] Call statistics work
- [ ] Call duration calculated

### Presence
- [ ] Online status updates
- [ ] Busy status works
- [ ] In-call status works
- [ ] Offline detection works

### UI/UX
- [ ] Keyboard shortcuts work
- [ ] Call menu opens
- [ ] User cards display
- [ ] Call quality acceptable
- [ ] No console errors

## Reporting Issues

When reporting issues, include:

1. **Browser:** Chrome/Firefox/Safari version
2. **OS:** Windows/Mac/Linux
3. **Frappe version:** `bench version`
4. **Console errors:** Screenshot or paste
5. **Steps to reproduce**
6. **Expected vs actual behavior**

**Get debug info:**
```javascript
console.log({
    frappe_version: frappe.boot.versions.frappe,
    socketio_connected: frappe.socketio.socket.connected,
    user: frappe.session.user,
    ice_servers: window.FIceCore.iceServers,
    peer_connection: window.FIceCore.peerConnection ? 'active' : 'none'
});
```

## Success Criteria

F-IceCore is working correctly if:

✅ Audio calls connect and work
✅ Video calls connect and work
✅ Screen sharing works
✅ Call history is recorded
✅ Presence system updates
✅ No console errors
✅ Calls are stable (no drops)

---

**Happy Testing! ❄️**
