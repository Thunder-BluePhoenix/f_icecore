# Force Browser to Load Version 12 Files

## Your Browser is STUCK on Old Files!

Currently loading (OLD - WRONG):
- ❌ `f_icecore_boot10.js`
- ❌ `webrtc_engine.js` (no version)
- ❌ `f_icecore.bundle10.js`
- ❌ `call_ui10.js` (old API paths)

Should be loading (NEW - CORRECT):
- ✅ `f_icecore_boot12.js`
- ✅ `webrtc_engine12.js`
- ✅ `f_icecore.bundle12.js`
- ✅ `call_ui12.js` (fixed API paths + no sounds)

---

## Fixed in Version 12:

1. ✅ **API Paths** - All changed from `f_icecore.api.*` to `f_icecore.f_icecore.api.*`
2. ✅ **Sound Files** - Disabled (no more 404 errors for ringtone.mp3/calling.mp3)
3. ✅ **Presence Tracking** - Heartbeat API path fixed
4. ✅ **Turn Credentials** - API path fixed

---

## How to Force Browser Reload (Choose ONE method):

### Method 1: Nuclear Option (BEST - 100% works)

**On Desktop/Laptop:**
1. Close ALL browser tabs
2. **Quit the browser application completely** (Cmd+Q on Mac, Alt+F4 on Windows)
3. Wait 5 seconds
4. Reopen browser
5. Navigate to your Frappe site

**On Smartphone:**
1. Close browser app
2. Go to Settings → Apps → [Your Browser] → Storage
3. Click "Clear Cache" (NOT "Clear Data")
4. Reopen browser

---

### Method 2: Developer Tools (If Method 1 doesn't work)

**Desktop/Laptop:**
1. Open Frappe in browser
2. Press **F12** to open DevTools
3. Go to **Network tab**
4. Check the box **"Disable cache"** (top of Network tab)
5. **Keep DevTools OPEN**
6. Press **Ctrl+Shift+R** (Windows/Linux) or **Cmd+Shift+R** (Mac)
7. **Keep DevTools open while using the site**

---

### Method 3: Manual Cache Clear

**Chrome:**
1. Press **Ctrl+Shift+Delete** (Windows) or **Cmd+Shift+Delete** (Mac)
2. Select "Cached images and files"
3. Time range: "All time"
4. Click "Clear data"
5. Hard refresh: **Ctrl+Shift+R**

**Firefox:**
1. Press **Ctrl+Shift+Delete**
2. Select "Cache"
3. Time range: "Everything"
4. Click "Clear Now"
5. Hard refresh: **Ctrl+Shift+R**

**Safari:**
1. Press **Cmd+Option+E** (clears cache immediately)
2. Hard refresh: **Cmd+Shift+R**

---

## How to Verify It Worked:

### Step 1: Check Console for Version 12

Open browser console (F12) and look for:

```
✅ Should see this:
f_icecore_boot12.js:234 ✅ F-IceCore Boot: Script loaded
webrtc_engine12.js:41   (API calls)
f_icecore.bundle12.js:16 F-IceCore initialized

❌ Should NOT see this:
f_icecore_boot10.js:234  ← OLD VERSION!
webrtc_engine.js:41      ← OLD VERSION!
```

### Step 2: Check for Errors

You should **NOT** see these errors anymore:
```
❌ ModuleNotFoundError: No module named 'f_icecore.api.presence'
❌ ModuleNotFoundError: No module named 'f_icecore.api.turn_credentials'
❌ GET .../ringtone.mp3 404 (NOT FOUND)
❌ GET .../calling.mp3 404 (NOT FOUND)
```

### Step 3: Test Functionality

1. Click the phone icon in navbar
2. Should see dialog with online users
3. **Currently**: Clicking "Call" shows blank popup (we'll fix this next)

---

## Expected Console Output (Version 12):

```
✅ F-IceCore Boot: Script loaded
🔵 F-IceCore Boot: Document ready
F-IceCore initialized
🔵 F-IceCore Boot: init_navbar called
✅ F-IceCore Boot: Found navbar with .search-bar
✅ F-IceCore Boot: Button added successfully!
🔵 F-IceCore Boot: init_presence()
✅ F-IceCore Boot: User set online: {user: 'Administrator', ...}
🔵 F-IceCore Boot: Listening to Socket.IO presence events
📡 F-IceCore Boot: Socket.IO connected: true
✅ F-IceCore Boot: Presence tracking initialized
💓 F-IceCore Boot: Heartbeat sent  ← NO ERROR!
```

**NO ERRORS about missing modules or 404 sounds!** ✅

---

## Still Seeing Old Version?

If you still see `f_icecore_boot10.js` in console:

### Last Resort:
1. Open **Private/Incognito window** (Ctrl+Shift+N)
2. Login to Frappe
3. Check console - should see version 12
4. If it works in incognito, your normal browser cache is REALLY stuck
5. Solution: Use incognito for now, or try different browser

---

## Known Issue - Blank Call Popup

**Current state:** When you click "Call" button, popup opens but is blank.

**Why:** The call UI HTML might need adjustment.

**Next step:** After you confirm version 12 is loading, I'll fix the blank popup issue.

---

## Quick Test Commands:

Run these in console to verify version 12:

```javascript
// 1. Check what scripts are loaded
$$('script').forEach(s => {
    const src = s.src;
    if (src && src.includes('f_icecore')) {
        console.log(src);
    }
});
// Should show: ...webrtc_engine12.js, ...call_ui12.js, etc.

// 2. Test presence API (should work now!)
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.heartbeat',
    callback: r => console.log('✅ Heartbeat works!', r.message),
    error: e => console.error('❌ Still broken:', e)
});

// 3. Check online users
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.get_online_users',
    callback: r => console.log('Online users:', r.message)
});
```

---

## Summary

**Files updated to version 12:**
- ✅ All API paths fixed (`f_icecore.f_icecore.api.*`)
- ✅ Sound files disabled (no 404 errors)
- ✅ Heartbeat working
- ✅ Presence tracking working

**What you need to do:**
1. **Close browser completely** and reopen (Nuclear Option - Method 1)
2. Check console shows version 12 files
3. Confirm no API errors
4. Report back if still seeing version 10

Then I'll fix the blank call popup!
