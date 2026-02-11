# F-IceCore HTTPS Proxy Fix Guide

## When Do You Need This?

When the HTTPS proxy stops working — typically because your **local network IP address changed** (e.g., router reassigned your IP, switched WiFi networks, etc.).

**Symptoms:**
- Mobile device can't connect via `https://<IP>:8443`
- Browser shows SSL/certificate error (ERR_CERT_AUTHORITY_INVALID with IP mismatch)
- SocketIO fails to connect over WSS
- `getUserMedia()` fails on mobile (requires HTTPS/secure context)

---

## Step-by-Step Fix

### Step 1: Find Your Current IP Address

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'

# Or check manually
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Note down the new IP. Example: `192.168.31.133`

---

### Step 2: Update the OpenSSL Configuration

**File:** `certs/openssl.cnf` (relative to bench root: `/Users/bluephoenix/frappe-bench/exp-bench/certs/openssl.cnf`)

Replace the old IP with your new IP in **three places**:

```ini
[dn]
C = IN
ST = Local
L = Local
O = F-IceCore Dev
OU = Development
CN = <YOUR_NEW_IP>          # ← Change #1: Common Name

[v3_req]
subjectAltName = @alt_names
basicConstraints = CA:TRUE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
IP.1 = <YOUR_NEW_IP>        # ← Change #2: SAN IP
IP.2 = 127.0.0.1
DNS.1 = localhost
DNS.2 = ice1
```

**Example:** If new IP is `192.168.31.133`:
- `CN = 192.168.31.133`
- `IP.1 = 192.168.31.133`

---

### Step 3: Regenerate the SSL Certificate

```bash
cd /Users/bluephoenix/frappe-bench/exp-bench/certs

openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout key.pem \
  -out cert.pem \
  -config openssl.cnf
```

This overwrites the old `cert.pem` and `key.pem` with new ones containing the correct IP.

**Verify the new certificate:**

```bash
openssl x509 -in cert.pem -noout -subject -ext subjectAltName
```

Expected output:
```
subject=C=IN, ST=Local, L=Local, O=F-IceCore Dev, OU=Development, CN=192.168.31.133
X509v3 Subject Alternative Name:
    IP Address:192.168.31.133, IP Address:127.0.0.1, DNS:localhost, DNS:ice1
```

Make sure your new IP appears in both `CN` and `Subject Alternative Name`.

---

### Step 4: Update the Proxy Script Log Messages (Optional)

**File:** `apps/f_icecore/install_scripts/https_proxy.js`

The hardcoded IP in the console log messages (lines ~214-219) is just for display purposes. Update them so the startup output shows the correct URLs:

Find lines like:
```javascript
console.log(`   Web:      https://OLD_IP:${WEB_HTTPS_PORT}`);
console.log(`   SocketIO: wss://OLD_IP:${SOCKETIO_HTTPS_PORT}`);
console.log(`\n💡 On mobile, visit https://OLD_IP:${WEB_HTTPS_PORT}`);
console.log(`   Then also visit https://OLD_IP:${SOCKETIO_HTTPS_PORT}`);
```

Replace `OLD_IP` with your new IP address.

> **Note:** This step is cosmetic only. The proxy binds to `0.0.0.0` so it works on any IP regardless of what's printed in logs.

---

### Step 5: Kill the Old Proxy Process

```bash
# Find the running proxy process
lsof -i :8443 -i :9443 | grep LISTEN

# Note the PID (second column), then kill it
kill <PID>

# Verify ports are free
lsof -i :8443 -i :9443 | grep LISTEN
# (should show nothing)
```

**Alternative — kill by port directly:**
```bash
kill $(lsof -t -i :8443)
```

---

### Step 6: Restart the Proxy

```bash
cd /Users/bluephoenix/frappe-bench/exp-bench

# Run in background with log output
nohup node apps/f_icecore/install_scripts/https_proxy.js > /tmp/https_proxy.log 2>&1 &

# Check it started successfully
cat /tmp/https_proxy.log
```

Expected output:
```
🔒 F-IceCore HTTPS Web Proxy
   https://0.0.0.0:8443 → http://127.0.0.1:8002
🔒 F-IceCore WSS SocketIO Proxy
   wss://0.0.0.0:9443 → ws://127.0.0.1:9002
   (headers rewritten + CORS fixed)

📱 Mobile Access URLs:
   Web:      https://192.168.31.133:8443
   SocketIO: wss://192.168.31.133:9443
```

---

### Step 7: Verify Everything Works

```bash
# Test HTTPS is responding (502 is OK if bench isn't running)
curl -sk https://<YOUR_NEW_IP>:8443 -o /dev/null -w "HTTP Status: %{http_code}\n"

# Verify certificate on the running proxy
echo | openssl s_client -connect <YOUR_NEW_IP>:8443 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
```

- **HTTP 502** = Proxy works, but `bench start` isn't running (expected)
- **HTTP 200** = Proxy works AND bench is running (everything good)
- **Connection refused** = Proxy didn't start, check `/tmp/https_proxy.log`

---

### Step 8: Accept Certificate on Mobile

On your mobile device:

1. Open browser and visit `https://<YOUR_NEW_IP>:8443`
2. You'll see a certificate warning (self-signed cert) — tap **Advanced** → **Proceed/Accept**
3. Then visit `https://<YOUR_NEW_IP>:9443` and accept the cert there too (required for SocketIO/WebSocket)
4. Go back to `https://<YOUR_NEW_IP>:8443` — the app should now work with camera/mic access

---

## Quick Reference (All Commands in One Go)

```bash
# 1. Get current IP
NEW_IP=$(ipconfig getifaddr en0)
echo "New IP: $NEW_IP"

# 2. Update openssl.cnf (replace OLD_IP with your previous IP)
cd /Users/bluephoenix/frappe-bench/exp-bench/certs
sed -i '' "s/OLD_IP/$NEW_IP/g" openssl.cnf

# 3. Regenerate certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem -config openssl.cnf

# 4. Verify
openssl x509 -in cert.pem -noout -subject -ext subjectAltName

# 5. Update proxy script logs (optional)
sed -i '' "s/OLD_IP/$NEW_IP/g" ../apps/f_icecore/install_scripts/https_proxy.js

# 6. Kill old proxy and restart
kill $(lsof -t -i :8443) 2>/dev/null
cd /Users/bluephoenix/frappe-bench/exp-bench
nohup node apps/f_icecore/install_scripts/https_proxy.js > /tmp/https_proxy.log 2>&1 &
sleep 2 && cat /tmp/https_proxy.log

# 7. Test
curl -sk https://$NEW_IP:8443 -o /dev/null -w "HTTP Status: %{http_code}\n"
```

---

## Architecture Overview

```
Mobile Device (HTTPS required for getUserMedia)
    │
    ├── https://<IP>:8443  ──→  HTTPS Web Proxy  ──→  http://127.0.0.1:8002 (Frappe Web)
    │
    └── wss://<IP>:9443    ──→  WSS SocketIO Proxy ──→  ws://127.0.0.1:9002 (Frappe SocketIO)
                                   │
                                   ├── Rewrites Host header → 127.0.0.1:9002
                                   ├── Rewrites Origin header → http://127.0.0.1:8002
                                   └── Fixes CORS response headers (Access-Control-Allow-Origin)
```

**Why header rewriting?**
Frappe's SocketIO `authenticate` middleware checks that `host` is `localhost/127.0.0.1` to use `default_site`. When connecting from a mobile device via IP, the host header would be `192.168.x.x:9443` which Frappe doesn't recognize. The proxy rewrites it to `127.0.0.1:9002` so Frappe maps the connection to the default site.

---

## File Locations

| File | Path | Purpose |
|------|------|---------|
| OpenSSL config | `certs/openssl.cnf` | Certificate generation config with IP in CN and SAN |
| SSL Certificate | `certs/cert.pem` | Public certificate (contains IP in subject) |
| SSL Private Key | `certs/key.pem` | Private key for HTTPS |
| HTTPS Proxy | `apps/f_icecore/install_scripts/https_proxy.js` | Node.js reverse proxy script |

All paths relative to bench root: `/Users/bluephoenix/frappe-bench/exp-bench/`

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `EADDRINUSE` error | Port 8443 or 9443 already in use | Kill existing process: `kill $(lsof -t -i :8443)` |
| Certificate error on mobile | IP mismatch in cert SAN | Redo Steps 2-6 with correct IP |
| 502 Bad Gateway | Frappe bench not running | Start bench: `cd exp-bench && bench start` |
| SocketIO not connecting | Cert not accepted for port 9443 | Visit `https://<IP>:9443` on mobile and accept cert |
| `getUserMedia()` fails on mobile | Not in secure context | Must use HTTPS URL, not HTTP |
| Proxy starts but no output | Process crashed immediately | Check: `node apps/f_icecore/install_scripts/https_proxy.js` (foreground) |
