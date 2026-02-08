#!/usr/bin/env node
/**
 * F-IceCore HTTPS Reverse Proxy
 *
 * Provides HTTPS termination for Frappe bench development server.
 * Proxies:
 *   - HTTPS :8443 → HTTP :8002 (web server)
 *   - WSS   :9443 → WS   :9002 (SocketIO)
 *
 * IMPORTANT: Rewrites host/origin headers for SocketIO so Frappe's
 * authenticate middleware maps to default_site (ice1).
 * Also rewrites CORS response headers so the browser accepts responses.
 *
 * This enables getUserMedia() on mobile devices connected via IP address,
 * which requires a secure context (HTTPS).
 *
 * Usage: node https_proxy.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

// --- Configuration ---
const WEB_HTTPS_PORT = 8443;      // HTTPS port for web
const SOCKETIO_HTTPS_PORT = 9443;  // WSS port for SocketIO
const WEB_HTTP_PORT = 8002;        // Frappe web server
const SOCKETIO_HTTP_PORT = 9002;   // Frappe SocketIO server
const BIND_HOST = '0.0.0.0';

// Certificate paths
const certsDir = path.join(__dirname, '..', '..', '..', 'certs');
const certPath = path.join(certsDir, 'cert.pem');
const keyPath = path.join(certsDir, 'key.pem');

// Verify certs exist
if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.error('❌ Certificate files not found!');
    console.error(`   Expected: ${certPath}`);
    console.error(`   Expected: ${keyPath}`);
    process.exit(1);
}

const sslOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
};

// --- Helper: Rewrite headers for SocketIO authentication ---
// Frappe's authenticate middleware checks:
//   1. host must be localhost/127.0.0.1 to use default_site
//   2. origin hostname must match host hostname
// We rewrite both so SocketIO works from any IP/hostname
function rewriteHeadersForSocketIO(headers) {
    const rewritten = { ...headers };
    // Rewrite host to 127.0.0.1:9002 so Frappe uses default_site
    rewritten['host'] = `127.0.0.1:${SOCKETIO_HTTP_PORT}`;
    // Rewrite origin to match host so origin check passes
    rewritten['origin'] = `http://127.0.0.1:${WEB_HTTP_PORT}`;
    // Preserve original info in custom headers
    if (headers['host']) {
        rewritten['x-forwarded-host'] = headers['host'];
    }
    if (headers['origin']) {
        rewritten['x-forwarded-origin'] = headers['origin'];
    }
    rewritten['x-forwarded-proto'] = 'https';
    return rewritten;
}

// --- Helper: Rewrite CORS response headers ---
// SocketIO server echoes back the rewritten origin (http://127.0.0.1:8002)
// in Access-Control-Allow-Origin, but the browser's actual origin is
// https://192.168.31.223:8443. We must fix this mismatch.
function fixCorsHeaders(responseHeaders, clientOrigin) {
    const fixed = { ...responseHeaders };
    if (clientOrigin && fixed['access-control-allow-origin']) {
        fixed['access-control-allow-origin'] = clientOrigin;
    }
    // Ensure credentials are allowed (needed for cookies/sid)
    if (fixed['access-control-allow-origin']) {
        fixed['access-control-allow-credentials'] = 'true';
    }
    return fixed;
}

// --- Helper: Proxy HTTP request ---
function proxyRequest(clientReq, clientRes, targetPort, rewriteHeaders) {
    // Save the client's real origin for CORS fixing
    const clientOrigin = clientReq.headers['origin'];

    const headers = rewriteHeaders
        ? rewriteHeadersForSocketIO(clientReq.headers)
        : {
            ...clientReq.headers,
            'X-Forwarded-For': clientReq.socket.remoteAddress,
            'X-Forwarded-Proto': 'https',
            'X-Forwarded-Host': clientReq.headers.host,
        };

    const options = {
        hostname: '127.0.0.1',
        port: targetPort,
        path: clientReq.url,
        method: clientReq.method,
        headers: headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
        // Fix CORS headers in the response if we rewrote the request headers
        const responseHeaders = rewriteHeaders
            ? fixCorsHeaders(proxyRes.headers, clientOrigin)
            : proxyRes.headers;

        clientRes.writeHead(proxyRes.statusCode, responseHeaders);
        proxyRes.pipe(clientRes, { end: true });
    });

    proxyReq.on('error', (err) => {
        console.error(`  ⚠️  Proxy error (port ${targetPort}): ${err.message}`);
        if (!clientRes.headersSent) {
            clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
            clientRes.end(`Bad Gateway: ${err.message}`);
        }
    });

    clientReq.pipe(proxyReq, { end: true });
}

// --- Helper: Proxy WebSocket upgrade ---
function proxyUpgrade(req, socket, head, targetPort, rewriteHeaders) {
    const proxySocket = net.connect(targetPort, '127.0.0.1', () => {
        // Build headers - rewrite if needed for SocketIO
        const headers = rewriteHeaders
            ? rewriteHeadersForSocketIO(req.headers)
            : req.headers;

        // Reconstruct the HTTP upgrade request
        const reqStr = `${req.method} ${req.url} HTTP/1.1\r\n` +
            Object.entries(headers)
                .map(([k, v]) => `${k}: ${v}`)
                .join('\r\n') +
            '\r\n\r\n';

        proxySocket.write(reqStr);
        if (head.length > 0) {
            proxySocket.write(head);
        }

        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
    });

    proxySocket.on('error', (err) => {
        console.error(`  ⚠️  WebSocket upgrade error (port ${targetPort}): ${err.message}`);
        socket.end();
    });

    socket.on('error', (err) => {
        proxySocket.end();
    });
}

// --- 1. HTTPS Web Proxy (port 8443 → 8002) ---
const webProxy = https.createServer(sslOptions, (req, res) => {
    proxyRequest(req, res, WEB_HTTP_PORT, false);
});

// Handle WebSocket upgrade for web proxy
webProxy.on('upgrade', (req, socket, head) => {
    proxyUpgrade(req, socket, head, WEB_HTTP_PORT, false);
});

webProxy.listen(WEB_HTTPS_PORT, BIND_HOST, () => {
    console.log(`\n🔒 F-IceCore HTTPS Web Proxy`);
    console.log(`   https://0.0.0.0:${WEB_HTTPS_PORT} → http://127.0.0.1:${WEB_HTTP_PORT}`);
});

// --- 2. WSS SocketIO Proxy (port 9443 → 9002) ---
// IMPORTANT: Rewrites host/origin headers so Frappe authenticate middleware
// sees 127.0.0.1 and maps to default_site. Also fixes CORS response headers
// so the browser accepts the response (replaces the rewritten origin with
// the client's actual origin in Access-Control-Allow-Origin).
const socketProxy = https.createServer(sslOptions, (req, res) => {
    // Handle CORS preflight (OPTIONS) requests directly
    if (req.method === 'OPTIONS') {
        const origin = req.headers['origin'] || '*';
        res.writeHead(204, {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Max-Age': '86400',
        });
        res.end();
        return;
    }
    // SocketIO also does HTTP long-polling, so proxy regular requests too
    proxyRequest(req, res, SOCKETIO_HTTP_PORT, true);
});

// Handle WebSocket upgrade for SocketIO — with header rewriting!
socketProxy.on('upgrade', (req, socket, head) => {
    proxyUpgrade(req, socket, head, SOCKETIO_HTTP_PORT, true);
});

socketProxy.listen(SOCKETIO_HTTPS_PORT, BIND_HOST, () => {
    console.log(`🔒 F-IceCore WSS SocketIO Proxy`);
    console.log(`   wss://0.0.0.0:${SOCKETIO_HTTPS_PORT} → ws://127.0.0.1:${SOCKETIO_HTTP_PORT}`);
    console.log(`   (headers rewritten + CORS fixed)`);
    console.log(`\n📱 Mobile Access URLs:`);
    console.log(`   Web:      https://192.168.31.223:${WEB_HTTPS_PORT}`);
    console.log(`   SocketIO: wss://192.168.31.223:${SOCKETIO_HTTPS_PORT}`);
    console.log(`\n💡 On mobile, visit https://192.168.31.223:${WEB_HTTPS_PORT}`);
    console.log(`   Accept the self-signed certificate warning to proceed.`);
    console.log(`   Then also visit https://192.168.31.223:${SOCKETIO_HTTPS_PORT}`);
    console.log(`   and accept the cert there too (for SocketIO to work).\n`);
});

// --- Graceful shutdown ---
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down HTTPS proxy...');
    webProxy.close();
    socketProxy.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    webProxy.close();
    socketProxy.close();
    process.exit(0);
});

// Handle errors
webProxy.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${WEB_HTTPS_PORT} is already in use!`);
    } else {
        console.error(`❌ Web proxy error: ${err.message}`);
    }
});

socketProxy.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${SOCKETIO_HTTPS_PORT} is already in use!`);
    } else {
        console.error(`❌ SocketIO proxy error: ${err.message}`);
    }
});
