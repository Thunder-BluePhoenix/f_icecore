# Test F-IceCore Calling Functionality

## What Changed in Version 14

### Before (v13):
```javascript
onclick="alert('Call ${user.full_name}')"  // ❌ Just shows alert
```

### After (v14):
```javascript
onclick="window.FIceCoreUI.initiateCall('${user.user}', 'audio')"  // ✅ Actually initiates call!
```

**Now has TWO buttons per user:**
- 🔵 **Audio** button - Audio-only call
- 🟢 **Video** button - Video call with camera

---

## Step 1: Hard Refresh Browser

**IMPORTANT:** You need to load version 14!

1. Close all tabs
2. Reopen browser
3. Login to Frappe
4. **Or** press Ctrl+Shift+R with DevTools cache disabled

**Verify in console:**
```
f_icecore_boot14.js:234  ← Should be version 14!
```

---

## Step 2: Test Call Flow

### Setup (Need 2 Users):

**Device 1 (Laptop):** Login as Administrator
**Device 2 (Smartphone):** Login as test@ice.com (etest)

### Test Audio Call:

**On Laptop:**
1. Click phone icon 📞 in navbar
2. Should see dialog with online users
3. Find "etest" user
4. Click **"Audio"** button (blue)

**Expected Result:**
- ✅ Console shows: "Calling..." (from call_ui.js)
- ✅ API call to: `f_icecore.f_icecore.api.signaling.initiate_call`
- ✅ "Calling" dialog appears with user's name
- ✅ Smartphone receives incoming call notification

**On Smartphone:**
- ✅ Should see incoming call popup
- ✅ "Accept" and "Decline" buttons
- ✅ Shows caller name (Administrator)

---

## Step 3: What Each Component Does

### When You Click "Audio Call":

**1. Check User Status** (call_ui.js)
```javascript
const presence = await this.getUserPresence(targetUser);
if (presence.status === 'offline') {
    frappe.msgprint('User is offline');
    return;  // ❌ Stop if offline
}
```

**2. Create Call Session** (API call)
```python
# Server: f_icecore/api/signaling.py
@frappe.whitelist()
def initiate_call(to_user, call_type):
    # Creates call session in database
    # Sends notification to recipient
    # Returns call session details
```

**3. Show Calling Window** (call_ui.js)
```javascript
this.showCallingWindow(targetUser, callType, callSession.name);
// Shows "Calling..." dialog
```

**4. Start WebRTC** (webrtc_engine.js)
```javascript
await window.FIceCore.startCall(targetUser, callType, callSession.name);
// Initializes peer connection
// Gets local media stream (mic/camera)
// Sends WebRTC offer
```

**5. Recipient Gets Notification** (Socket.IO)
```javascript
frappe.realtime.on('f_icecore:incoming_call', (data) => {
    // Shows incoming call dialog
    // Plays ringtone
});
```

---

## Expected Console Output

### On Caller (Laptop):

```
🔵 F-IceCore Boot: Button clicked!
📡 F-IceCore Boot: Fetching online users...
📊 F-IceCore Boot: Users count: 1

// When you click "Audio Call":
Checking user presence for: test@ice.com
User is online, initiating call...
Creating call session...
✅ Call session created: CALL-SESSION-2025-001
Showing calling window...
Starting WebRTC call...
Getting local media stream...
✅ Local media stream acquired
Creating peer connection...
Creating offer...
✅ Offer sent to: test@ice.com
```

### On Recipient (Smartphone):

```
📡 Incoming call notification received
From: Administrator
Call type: audio
Call ID: CALL-SESSION-2025-001
🔊 Playing ringtone...
Showing incoming call dialog...
```

---

## Test Checklist

### Basic Functionality:
- [ ] Can see online users in dialog
- [ ] Users have "Audio" and "Video" buttons
- [ ] Clicking "Audio" initiates call (not alert)
- [ ] Console shows call flow
- [ ] API call succeeds

### Error Handling:
- [ ] Offline user shows "User is offline"
- [ ] User in call shows "User is already in a call"
- [ ] Network errors show error message

### Call Flow:
- [ ] Caller sees "Calling..." dialog
- [ ] Recipient sees incoming call popup
- [ ] Can accept call
- [ ] Can decline call
- [ ] Can hang up during call

---

## Current Limitations (We'll Fix Next)

### Known Issues:
1. **No actual audio/video yet** - WebRTC is initiated but media not connected
2. **No ringtone** - Sound files don't exist (404 errors disabled)
3. **Basic UI** - Call window needs styling
4. **No call controls** - Mute/unmute, video toggle need testing

---

## Debug Commands

### Check if FIceCoreUI exists:
```javascript
console.log('FIceCoreUI:', typeof window.FIceCoreUI);
// Should show: FIceCoreUI: object

console.log('initiateCall:', typeof window.FIceCoreUI.initiateCall);
// Should show: initiateCall: function
```

### Check if FIceCore (WebRTC) exists:
```javascript
console.log('FIceCore:', typeof window.FIceCore);
// Should show: FIceCore: object
```

### Manually test call:
```javascript
// Replace 'test@ice.com' with actual username
window.FIceCoreUI.initiateCall('test@ice.com', 'audio');
```

### Check user presence:
```javascript
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.get_user_presence',
    args: { user: 'test@ice.com' },
    callback: r => console.log('Presence:', r.message)
});
```

---

## Troubleshooting

### Problem: Button click does nothing
**Check:**
```javascript
console.log('FIceCoreUI:', window.FIceCoreUI);
```
If undefined, call_ui14.js didn't load.

### Problem: "User is offline" but they're online
**Check presence:**
```javascript
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.get_online_users',
    callback: r => console.log(r.message)
});
```

### Problem: Call session creation fails
**Check console for error:**
- API path correct? (f_icecore.f_icecore.api.signaling.initiate_call)
- User has permission?
- Server running?

### Problem: No incoming call on recipient
**Check:**
1. Socket.IO connected?
   ```javascript
   console.log('Socket.IO:', frappe.socketio?.socket?.connected);
   ```
2. Listening to events?
   ```javascript
   frappe.socketio.socket.listeners('f_icecore:incoming_call');
   ```

---

## Next Steps After Testing

Once you confirm basic call flow works:

1. **Add actual media connection** - Complete WebRTC peer connection
2. **Add ringtones** - Create/add mp3 files
3. **Improve UI** - Better call window design
4. **Add controls** - Mute, video toggle, volume
5. **Add call history** - Track all calls
6. **Add notifications** - Desktop notifications for calls

---

## Quick Test (Right Now)

**On Laptop Console:**
```javascript
// Test if it's functional
window.FIceCoreUI.initiateCall('test@ice.com', 'audio');
```

**Expected:**
- Should see "Calling..." dialog (not alert!)
- Console shows call flow
- API calls made
- Smartphone gets notification (if online)

---

## Summary

**Version 14 Changes:**
- ✅ Call buttons are FUNCTIONAL (not just alerts)
- ✅ Two buttons: Audio & Video
- ✅ Better layout (flexbox)
- ✅ Calls window.FIceCoreUI.initiateCall()
- ✅ Full call flow initiated

**Just hard refresh and test - the calling system is now functional!** 🎉

The call won't complete audio/video yet (WebRTC peer connection needs work), but the entire call initiation flow should work:
- Call session created
- Calling dialog shown
- Recipient notified
- Can accept/decline

**Test it and let me know what happens!** 📞
