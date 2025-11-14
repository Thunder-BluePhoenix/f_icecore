# ❄️ F-IceCore

**WebRTC Calling • Video Calling • Screen Sharing for Frappe**

F-IceCore is a comprehensive Frappe application that brings Discord-like calling capabilities to your Frappe/ERPNext instance. It features automatic STUN/TURN server setup, real-time presence tracking, and seamless WebRTC integration.

## ✨ Features

- 📞 **Audio Calling** - High-quality peer-to-peer audio calls
- 📹 **Video Calling** - HD video calls with camera controls
- 🖥️ **Screen Sharing** - Share your screen during calls
- 🟢 **Presence System** - Real-time online/offline/busy status
- 🔐 **Secure** - TURN credentials with time-limited tokens
- 🎯 **Auto Setup** - Automatic Coturn STUN/TURN installation
- 📊 **Call History** - Track all your calls and statistics
- 🌐 **NAT Traversal** - Works behind firewalls and NAT
- 💬 **Real-time Signaling** - Uses Frappe's SocketIO infrastructure
- 🎨 **Discord-inspired UI** - Clean, modern call interface

## 🚀 Quick Start

### Installation

```bash
# Navigate to your bench directory
cd ~/frappe-bench

# Get the app
bench get-app https://github.com/Thunder-BluePhoenix/f_icecore

# Install on your site
bench --site your-site.local install-app f_icecore

# Restart bench
bench restart
```

### Coturn STUN/TURN Server Setup

For best WebRTC performance, install Coturn:

```bash
cd ~/frappe-bench/apps/f_icecore
sudo bash install_scripts/install_coturn.sh
```

This will:
- Install Coturn
- Configure STUN/TURN server
- Generate secure credentials
- Setup systemd service
- Configure firewall rules (manual step required)

### Firewall Configuration

Open the required ports:

```bash
# For UFW
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp
sudo ufw allow 49152:65535/udp

# For firewalld
sudo firewall-cmd --permanent --add-port=3478/tcp
sudo firewall-cmd --permanent --add-port=3478/udp
sudo firewall-cmd --permanent --add-port=5349/tcp
sudo firewall-cmd --permanent --add-port=5349/udp
sudo firewall-cmd --permanent --add-port=49152-65535/udp
sudo firewall-cmd --reload
```

## 📖 Usage

### Making a Call

**Method 1: Quick Call (Keyboard Shortcut)**
- Press `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac)
- Select user and call type
- Click "Call"

**Method 2: Call Menu**
- Click the phone icon in the navbar
- Browse online users
- Click audio 📞 or video 📹 button

**Method 3: Programmatic**
```javascript
// Audio call
window.FIceCoreUI.initiateCall('user@example.com', 'audio');

// Video call
window.FIceCoreUI.initiateCall('user@example.com', 'video');

// Screen sharing
window.FIceCoreUI.initiateCall('user@example.com', 'screen');
```

### Call Controls

During a call:
- `Ctrl+M` - Toggle microphone mute
- `Ctrl+Shift+H` - Hang up call
- Click buttons in call window for video toggle, etc.

### Checking Call History

```javascript
// Get call history
frappe.call({
    method: 'f_icecore.api.call_session.get_call_history',
    args: { limit: 50 },
    callback: (r) => console.log(r.message)
});

// Get call statistics
frappe.call({
    method: 'f_icecore.api.call_session.get_call_stats',
    callback: (r) => console.log(r.message)
});
```

## ⚙️ Configuration

### F IceCore Settings

Navigate to: **Settings → F IceCore Settings**

Configure:
- TURN server hostname/IP
- TURN shared secret
- Ports (STUN, TURN, TURNS)
- Enable/disable call features
- Maximum call duration
- Custom ringtones

### Site Config

Alternatively, add to `site_config.json`:

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

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│           F-IceCore Architecture             │
└─────────────────────────────────────────────┘

Frontend (JavaScript)
├── webrtc_engine.js      - WebRTC peer connections
├── call_ui.js            - Discord-like UI
├── f_icecore.bundle.js   - Main bundle
└── f_icecore.css         - Styles

Backend (Python)
├── api/
│   ├── signaling.py      - WebRTC signaling
│   ├── presence.py       - User presence
│   ├── call_session.py   - Call management
│   ├── turn_credentials.py - TURN auth
│   └── permissions.py    - Access control
│
├── doctype/
│   ├── f_icecore_call_session/
│   └── f_icecore_settings/
│
└── install/
    └── setup.py          - Post-install hooks

Infrastructure
├── Coturn (STUN/TURN)    - NAT traversal
├── Redis                 - Presence cache
└── SocketIO              - Real-time signaling
```

## 🔌 API Reference

### Signaling API

```python
# Initiate a call
frappe.call({
    method: 'f_icecore.api.signaling.initiate_call',
    args: {
        to_user: 'user@example.com',
        call_type: 'audio'  # or 'video', 'screen'
    }
})

# Accept incoming call
frappe.call({
    method: 'f_icecore.api.signaling.accept_call',
    args: { call_id: 'CALL-2025-00001' }
})

# End call
frappe.call({
    method: 'f_icecore.api.signaling.end_call',
    args: { call_id: 'CALL-2025-00001' }
})
```

### Presence API

```python
# Update presence status
frappe.call({
    method: 'f_icecore.api.presence.update_presence',
    args: {
        status: 'online',  # online, offline, busy, in_call, away
        metadata: { custom_message: 'Working on project' }
    }
})

# Get online users
frappe.call({
    method: 'f_icecore.api.presence.get_online_users',
    callback: (r) => console.log(r.message)
})
```

### TURN Credentials

```python
# Get ICE servers configuration
frappe.call({
    method: 'f_icecore.api.turn_credentials.get_ice_servers',
    callback: (r) => {
        const iceServers = r.message;
        // Use with RTCPeerConnection
    }
})
```

## 🔧 Development

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/Thunder-BluePhoenix/f_icecore
cd f_icecore

# Install pre-commit hooks
pre-commit install

# Run tests (if available)
bench --site test-site run-tests --app f_icecore
```

### Building

```bash
# Build assets
bench build --app f_icecore

# Clear cache
bench --site your-site.local clear-cache
```

## 🐛 Troubleshooting

### Calls Not Connecting

1. **Check Coturn Status**
   ```bash
   sudo systemctl status coturn
   sudo tail -f /var/log/turnserver.log
   ```

2. **Verify Firewall**
   - Ensure ports 3478, 5349, and 49152-65535 are open
   - Check NAT settings on your router/cloud provider

3. **Test TURN Server**
   ```bash
   frappe.call({
       method: 'f_icecore.api.turn_credentials.test_turn_connection',
       callback: (r) => console.log(r.message)
   })
   ```

### No Audio/Video

1. Check browser permissions for camera/microphone
2. Ensure HTTPS is enabled (WebRTC requires secure context)
3. Check browser console for errors

### Users Showing as Offline

1. Verify Redis is running
2. Check presence heartbeat in browser console
3. Ensure SocketIO is connected

## 🎨 Customization

### Custom Ringtones

1. Add MP3 files to `f_icecore/public/sounds/`
   - `ringtone.mp3` - Incoming call sound
   - `calling.mp3` - Outgoing call sound
   - `hangup.mp3` - Call end sound

2. Or set custom paths in F IceCore Settings

### UI Theming

Edit `f_icecore/public/css/f_icecore.css` to customize:
- Call window styles
- Presence indicators
- Button colors
- Animations

## 📊 DocTypes

### F IceCore Call Session

Stores call history and metadata:
- From User
- To User
- Call Type (audio/video/screen)
- Status (Ringing/Active/Ended/Rejected)
- Timestamps (created, accepted, ended)
- Duration
- Quality Metrics

### F IceCore Settings

Global configuration:
- TURN server settings
- Feature toggles
- Call duration limits
- Custom audio files

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run pre-commit checks
5. Submit a pull request

### Code Style

This app uses:
- **Python**: Ruff for linting and formatting
- **JavaScript**: ESLint and Prettier
- Pre-commit hooks enforce these automatically

## 📝 License

GPL-3.0

## 🙏 Acknowledgments

- Built on [Frappe Framework](https://frappeframework.com/)
- Uses [Coturn](https://github.com/coturn/coturn) for STUN/TURN
- Inspired by Discord's calling experience

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Thunder-BluePhoenix/f_icecore/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Thunder-BluePhoenix/f_icecore/discussions)
- **Email**: bluephoenix00995@gmail.com

## 🗺️ Roadmap

- [ ] Group calling (conference calls)
- [ ] Call recording
- [ ] Call transfer
- [ ] Mobile app support
- [ ] Call quality indicators
- [ ] Noise cancellation
- [ ] Virtual backgrounds
- [ ] Encrypted calls (E2E)

---

**Made with ❄️ by Thunder BluePhoenix**

*Bringing real-time communication to Frappe*
