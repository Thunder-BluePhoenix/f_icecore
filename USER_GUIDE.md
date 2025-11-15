# F-IceCore User Guide

Complete guide for using F-IceCore calling features in Frappe.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Making Calls](#making-calls)
3. [Receiving Calls](#receiving-calls)
4. [Call Features](#call-features)
5. [Settings](#settings)
6. [Troubleshooting](#troubleshooting)

## Getting Started

### Accessing F-IceCore

After installation, you'll find F-IceCore integrated into your Frappe Desk:

1. **Navbar Button**: Look for the phone icon (📞) in the top navbar
2. **Keyboard Shortcut**: Press `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac)
3. **Apps Screen**: Find "F IceCore" in your apps list

### Initial Setup

1. Navigate to **Settings → F IceCore Settings**
2. Verify TURN server configuration (auto-configured if you ran the installer)
3. Test connection using the "Test TURN Connection" button

## Making Calls

### Method 1: From Call Panel

1. Click the **phone icon** in the navbar
2. The call panel will open showing:
   - **Online Users**: Users available to call
   - **Call History**: Your recent calls
   - **Settings**: Configuration options

3. Find the user you want to call in the "Online Users" tab
4. Click the button:
   - 📞 **Phone icon** = Audio call
   - 📹 **Video icon** = Video call

### Method 2: Quick Call Shortcut

1. Press `Ctrl+Shift+C` (or `Cmd+Shift+C`)
2. A dialog will appear
3. Select the user from the dropdown
4. Choose call type (Audio/Video)
5. Click **Call**

### Method 3: From Call History

1. Open the call panel (phone icon in navbar)
2. Go to **Call History** tab
3. Find a previous call
4. Click the phone icon to call back

## Receiving Calls

### Incoming Call Notification

When someone calls you:

1. **Ringtone** will play
2. **Call dialog** appears showing:
   - Caller's name and photo
   - Call type (Audio/Video/Screen)
   - Two buttons: **Accept** or **Decline**

### Accepting a Call

1. Click the **Accept** button
2. Grant browser permissions if prompted:
   - 🎤 **Microphone** (for audio calls)
   - 📹 **Camera** (for video calls)
3. The call window will open
4. Wait 5-10 seconds for connection

### Declining a Call

1. Click the **Decline** button
2. The caller will be notified that you declined
3. Call will be logged in history

## Call Features

### During an Active Call

#### Call Window Interface

**Audio Calls:**
- Caller's avatar/photo
- Call duration timer
- Control buttons at the bottom

**Video Calls:**
- Large remote video (other person)
- Small local video (you) in bottom-right corner
- Control buttons at the bottom

#### Control Buttons

| Button | Function | Shortcut |
|--------|----------|----------|
| 🎤 | Toggle Microphone | `Ctrl+M` |
| 📹 | Toggle Camera* | - |
| 📞 | End Call | `Ctrl+Shift+H` |

*Only available in video calls

### Call Types

#### 1. Audio Call
- Voice only
- Low bandwidth
- Best for quick conversations

#### 2. Video Call
- Audio + Video
- See each other while talking
- Requires camera permission

#### 3. Screen Sharing
- Share your screen with others
- Great for demos and support
- Select window/screen when prompted

## Settings

### Accessing Settings

**Method 1:**
1. Click phone icon in navbar
2. Go to **Settings** tab
3. Click "Open F IceCore Settings"

**Method 2:**
1. Go to **Settings → F IceCore Settings**

### Configuration Options

#### TURN Server Settings
- **TURN Server**: Server IP/hostname (auto-configured)
- **TURN Secret**: Authentication secret (auto-configured)
- **STUN Port**: Default 3478
- **TURN Port**: Default 3478
- **TURNS Port**: Default 5349 (TLS)

#### Feature Toggles
- ✅ **Enable Audio Calls**: Allow voice calling
- ✅ **Enable Video Calls**: Allow video calling
- ✅ **Enable Screen Sharing**: Allow screen sharing

#### Limits
- **Max Call Duration**: Maximum call length in seconds (0 = unlimited)

### Testing Your Setup

1. Open **F IceCore Settings**
2. Click **Test TURN Connection**
3. Look for success message:
   - ✅ Green = Working correctly
   - ❌ Red = Configuration issue

## Call History & Statistics

### Viewing Call History

1. Click phone icon in navbar
2. Go to **Call History** tab
3. See your recent calls with:
   - Call direction (incoming/outgoing)
   - Call status (answered/rejected/missed)
   - Call duration
   - Timestamp

### Call Statistics

1. Click phone icon in navbar
2. Go to **Settings** tab
3. Click "View Call Statistics"

You'll see:
- **Total Calls**: All calls made/received
- **Answered Calls**: Successfully connected calls
- **Missed Calls**: Calls you didn't answer
- **Total Duration**: Time spent on calls
- **Answer Rate**: Percentage of answered calls

## User Presence

### Presence Indicators

Users show different statuses:

| Color | Status | Meaning |
|-------|--------|---------|
| 🟢 Green | Online | Available for calls |
| 🟡 Yellow | Away | May not respond immediately |
| 🔴 Red | Busy | In another call or busy |
| ⚫ Gray | Offline | Not available |

### Your Presence

Your presence is automatically managed:
- **Online** when using Frappe
- **In Call** when on a call
- **Offline** after 5 minutes of inactivity

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Open quick call dialog |
| `Ctrl+M` | Toggle mute during call |
| `Ctrl+Shift+H` | Hang up active call |

*Use `Cmd` instead of `Ctrl` on macOS*

## Browser Permissions

F-IceCore requires browser permissions:

### First Time Setup

**Audio Calls:**
1. Browser will ask for microphone access
2. Click **Allow**
3. Permission saved for future calls

**Video Calls:**
1. Browser asks for camera + microphone
2. Click **Allow** for both
3. Permissions saved

### Managing Permissions

**Chrome:**
1. Click lock icon in address bar
2. Go to Site Settings
3. Allow Camera and Microphone

**Firefox:**
1. Click lock icon in address bar
2. Click "Permissions"
3. Allow Camera and Microphone

**Safari:**
1. Safari → Preferences → Websites
2. Select Camera/Microphone
3. Allow for your site

## Tips for Best Call Quality

### For Users

1. **Use headphones** to prevent echo
2. **Good internet** connection (WiFi preferred)
3. **Close** unnecessary browser tabs
4. **Well-lit** area for video calls
5. **Quiet** environment

### Network Requirements

| Call Type | Minimum Speed | Recommended |
|-----------|---------------|-------------|
| Audio | 50 kbps up/down | 100 kbps |
| Video | 500 kbps up/down | 1 Mbps |
| HD Video | 1.5 Mbps up/down | 3 Mbps |

## Troubleshooting

### Can't See Online Users

**Check:**
1. Are other users logged in?
2. Is Redis running? (`bench start` should show redis_cache)
3. Refresh the page

**Fix:**
```bash
# Restart bench
bench restart
```

### No Audio/Video

**Check:**
1. Browser permissions granted?
2. Microphone/camera not used by another app?
3. Try different browser (Chrome/Firefox recommended)

**Fix:**
1. Close other apps using camera/microphone
2. Restart browser
3. Check system permissions (macOS: System Preferences → Security & Privacy)

### Call Not Connecting

**Check:**
1. Is the other user online?
2. Is their status "Available" (not in another call)?
3. Internet connection stable?

**Fix:**
1. Both users refresh the page
2. Try again after a few seconds
3. Check TURN server status in Settings

### Poor Call Quality

**Check:**
1. Internet speed (run speed test)
2. Too many people on network?
3. VPN enabled?

**Fix:**
1. Close bandwidth-heavy applications
2. Use wired connection instead of WiFi
3. Disable VPN temporarily

### "TURN Server Not Configured" Error

**Fix:**
1. Administrator needs to run:
   ```bash
   cd ~/frappe-bench/apps/f_icecore
   bash install_scripts/install_coturn.sh
   ```

2. Or manually configure in F IceCore Settings

## Advanced Features

### Calling from DocTypes

Developers can add call buttons to any DocType:

```javascript
// Add call button to User form
frappe.ui.form.on('User', {
    refresh(frm) {
        if (frm.doc.name !== frappe.session.user) {
            frm.add_custom_button('Call User', () => {
                window.FIceCoreUI.initiateCall(frm.doc.name, 'audio');
            }, 'Actions');
        }
    }
});
```

### Programmatic Calling

```javascript
// Audio call
window.FIceCoreUI.initiateCall('user@example.com', 'audio');

// Video call
window.FIceCoreUI.initiateCall('user@example.com', 'video');

// Screen share
window.FIceCoreUI.initiateCall('user@example.com', 'screen');
```

### Custom Ringtones

1. Add MP3 files to `f_icecore/public/sounds/`:
   - `ringtone.mp3` - Incoming call sound
   - `calling.mp3` - Outgoing call sound
   - `hangup.mp3` - Call end sound

2. Or set custom paths in F IceCore Settings

## Privacy & Security

### What's Logged

F-IceCore logs:
- ✅ Call timestamps (start/end)
- ✅ Call participants
- ✅ Call duration
- ✅ Call status (answered/rejected/missed)

**NOT Logged:**
- ❌ Call content/recordings
- ❌ Audio/video data
- ❌ Screen sharing content

### Data Storage

- Call metadata stored in Frappe database
- Presence cached in Redis (5-minute TTL)
- No call recordings unless explicitly enabled

### Peer-to-Peer Connection

- Calls are **peer-to-peer** when possible
- Media goes directly between users
- Server only handles signaling (not media)

## Support

### Getting Help

1. **Check this guide** first
2. **Test TURN connection** in Settings
3. **Check browser console** for errors (F12)
4. **Contact administrator** if issues persist

### Reporting Issues

When reporting issues, include:
- Browser and version
- Operating system
- Steps to reproduce
- Browser console errors (F12 → Console tab)

### Useful Commands

**Check if F-IceCore is loaded:**
```javascript
console.log(window.FIceCore);
console.log(window.FIceCoreUI);
```

**Get debug info:**
```javascript
console.log({
    socketio: frappe.socketio.socket.connected,
    ice_servers: window.FIceCore.iceServers,
    user: frappe.session.user
});
```

**Test presence:**
```javascript
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.get_online_users',
    callback: (r) => console.log('Online users:', r.message)
});
```

---

**Happy Calling! ❄️📞**

*For technical documentation, see README.md and TESTING_GUIDE.md*
