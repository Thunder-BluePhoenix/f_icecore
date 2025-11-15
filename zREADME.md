# ❄️ F-IceCore
High-performance WebRTC communication engine for Frappe.  
Includes automatic installation of a STUN/TURN (Coturn) server inside frappe-bench  
and exposes APIs for audio calling, video calling, and screen sharing.

## ✨ Features
- Auto-install Coturn (STUN/TURN)
- Auto-configure turnserver.conf
- Generates secure TURN credentials
- WebRTC Signaling API
- User presence & online indicators
- Peer-to-peer video/audio calling
- Screen sharing support
- Frappe Realtime events + WebSockets

## 🚀 Installation
bench get-app f_icecore https://github.com/<your-repo>/f_icecore  
bench --site <site-name> install-app f_icecore

## 🔧 TURN/STUN Setup
F-IceCore auto-generates:
- `/etc/turnserver.conf`
- Shared secret for TURN REST API
- ports 3478 (UDP/TCP) and 5349 (TLS)
- NAT traversal configuration

Use this env in your JS:
const iceServers = [
  {
    urls: ["stun:your-domain:3478"],
  },
  {
    urls: ["turn:your-domain:3478"],
    username: "<dynamic-username>",
    credential: "<dynamic-password>"
  }
];

## 🔌 Signaling Endpoints
- `/api/method/f_icecore.api.signal.send_offer`
- `/api/method/f_icecore.api.signal.send_answer`
- `/api/method/f_icecore.api.signal.send_ice`
- `/api/method/f_icecore.api.signal.call_status`

## 📁 Folder Structure
f_icecore/
 ├── f_icecore/
 │   ├── api/
 │   │   └── signal.py
 │   ├── modules.txt
 │   ├── config/
 │   └── www/
 │       └── call.html
 ├── setup.py
 ├── MANIFEST.in
 ├── README.md
 └── turn_install.sh
