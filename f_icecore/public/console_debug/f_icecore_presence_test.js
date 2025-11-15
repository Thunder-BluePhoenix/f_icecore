// F-IceCore Presence Testing Script
// Copy and paste this into your browser console

console.log('=== F-IceCore Presence Diagnostics ===\n');

// 1. Check if f_icecore is loaded
console.log('1. F-IceCore loaded:', typeof f_icecore !== 'undefined' ? '✅' : '❌');
console.log('   - init_navbar:', typeof f_icecore?.init_navbar);
console.log('   - init_presence:', typeof f_icecore?.init_presence);
console.log('   - _presence_initialized:', f_icecore?._presence_initialized || false);

// 2. Check Socket.IO
console.log('\n2. Socket.IO status:');
console.log('   - frappe.socketio exists:', typeof frappe?.socketio !== 'undefined' ? '✅' : '❌');
console.log('   - Socket exists:', typeof frappe?.socketio?.socket !== 'undefined' ? '✅' : '❌');
console.log('   - Connected:', frappe?.socketio?.socket?.connected || false);

// 3. Manually set presence
console.log('\n3. Testing presence update...');
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.update_presence',
    args: { status: 'online' },
    callback: (r) => {
        console.log('   ✅ Presence set:', r.message);
    },
    error: (err) => {
        console.error('   ❌ Error:', err);
    }
});

// 4. Get online users
console.log('\n4. Fetching online users...');
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.get_online_users',
    callback: (r) => {
        console.log('   ✅ Online users:', r.message);
        console.log('   Count:', r.message?.length || 0);
        if (r.message && r.message.length > 0) {
            r.message.forEach(u => {
                console.log(`   - ${u.full_name} (${u.user}): ${u.status}`);
            });
        }
    },
    error: (err) => {
        console.error('   ❌ Error:', err);
    }
});

// 5. Get call-capable users
console.log('\n5. Fetching call-capable users...');
frappe.call({
    method: 'f_icecore.f_icecore.api.presence.get_call_capable_users',
    callback: (r) => {
        console.log('   ✅ Call-capable users:', r.message);
        console.log('   Count:', r.message?.length || 0);
        if (r.message && r.message.length > 0) {
            r.message.forEach(u => {
                console.log(`   - ${u.full_name} (${u.user}): ${u.status}`);
            });
        }
    },
    error: (err) => {
        console.error('   ❌ Error:', err);
    }
});

console.log('\n=== Diagnostics Complete ===');
console.log('\nTo manually initialize presence, run:');
console.log('  f_icecore.init_presence()');
