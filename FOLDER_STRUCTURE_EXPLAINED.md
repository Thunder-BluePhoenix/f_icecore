# F-IceCore Folder Structure Explained

## Why Two `f_icecore` Folders?

This is **standard Frappe app structure**:

```
f_icecore/                          # Root app directory
├── f_icecore/                      # Main Python package (app name)
│   ├── public/                     ✅ SERVED BY FRAPPE (maps to /assets/f_icecore/)
│   │   ├── js/
│   │   │   ├── f_icecore_boot.js         # Navbar & presence init
│   │   │   ├── f_icecore.bundle.js       # Main WebRTC bundle
│   │   │   ├── call_ui.js                # Call UI components
│   │   │   ├── webrtc_engine.js          # WebRTC engine
│   │   │   └── f_icecore_navbar.js       # Navbar integration
│   │   ├── css/
│   │   │   └── f_icecore.css             # Styles
│   │   └── sounds/
│   │       └── README.md
│   │
│   ├── f_icecore/                  # Nested Python module (for code organization)
│   │   ├── api/                    # Python API files (NOT served as assets)
│   │   │   ├── presence.py
│   │   │   ├── signaling.py
│   │   │   ├── call_session.py
│   │   │   └── turn_credentials.py
│   │   ├── doctype/                # Frappe DocTypes
│   │   ├── install/                # Installation scripts
│   │   └── tests/                  # Test files
│   │
│   ├── hooks.py                    # Frappe hooks configuration
│   └── ...
```

## What Was The Problem?

### Before (Incorrect):
- WebRTC files were in **nested** location: `/f_icecore/f_icecore/public/js/`
- Frappe **doesn't serve** from nested `public` folders
- Result: Files existed but were **not accessible** via HTTP

### After (Fixed):
- All static files moved to **correct** location: `/f_icecore/public/js/`
- Frappe serves these at: `/assets/f_icecore/js/`
- Result: All files now **accessible** ✅

## File Mapping

Frappe maps paths like this:

| Physical Path | HTTP URL |
|--------------|----------|
| `/f_icecore/public/js/f_icecore_boot.js` | `/assets/f_icecore/js/f_icecore_boot.js` |
| `/f_icecore/public/js/f_icecore.bundle.js` | `/assets/f_icecore/js/f_icecore.bundle.js` |
| `/f_icecore/public/css/f_icecore.css` | `/assets/f_icecore/css/f_icecore.css` |

## What's In Each File?

### `f_icecore_boot.js` (6.3 KB)
- Navbar button integration
- Presence tracking initialization
- Socket.IO event listeners
- Runs on every page load

### `f_icecore.bundle.js` (8.5 KB)
- Main WebRTC bundle
- Referenced in `hooks.py`
- Core calling functionality

### `call_ui.js` (12 KB)
- Call UI components
- Dialog management
- User interface for calls

### `webrtc_engine.js` (9.9 KB)
- WebRTC engine
- Peer connection management
- ICE/STUN/TURN handling

### `f_icecore_navbar.js` (9.5 KB)
- Alternative navbar integration
- May be legacy/backup

## Hooks Configuration

In `hooks.py`:

```python
app_include_css = "/assets/f_icecore/css/f_icecore.css"
app_include_js = [
    "/assets/f_icecore/js/f_icecore_boot.js",      # Always loads first
    "/assets/f_icecore/js/f_icecore.bundle.js"     # Main WebRTC code
]
```

These files are **automatically included** on every Frappe desk page.

## Files NOT in hooks.py

These files exist but are loaded dynamically (not auto-included):
- `call_ui.js` - Loaded when call UI is needed
- `webrtc_engine.js` - Loaded by bundle or call UI
- `f_icecore_navbar.js` - Alternative/legacy navbar code

## Verification

All files now return **200 OK**:
```
✅ f_icecore.bundle.js: 200
✅ webrtc_engine.js: 200
✅ call_ui.js: 200
✅ f_icecore.css: 200
```

## Why Keep Nested `f_icecore/f_icecore/`?

The nested structure (`/f_icecore/f_icecore/`) is **required** for Python imports:

```python
# This works because of nested structure:
from f_icecore.f_icecore.api.presence import update_presence
from f_icecore.f_icecore.api.signaling import handle_signal
```

Without it, Python imports would fail.

## Summary

- ✅ Restored all WebRTC files from git
- ✅ Copied to correct `/f_icecore/public/` location
- ✅ All files now accessible via HTTP (200 OK)
- ✅ Both folder structures are **correct and necessary**:
  - `/f_icecore/public/` - For static assets (JS, CSS)
  - `/f_icecore/f_icecore/` - For Python modules

The confusion was which `public` folder Frappe serves from. Answer: **Only the top-level one** (`/f_icecore/public/`).
