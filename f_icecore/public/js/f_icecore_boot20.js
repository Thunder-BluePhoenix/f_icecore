/**
 * F-IceCore Boot Script
 * This file is loaded via frappe.boot
 */

console.log('🔵 F-IceCore Boot: Script executed');

// Wait for frappe to be available
if (typeof frappe === 'undefined') {
	console.warn('⚠️ F-IceCore Boot: Frappe not loaded yet, will initialize on ready');
	var f_icecore = {};
} else {
	frappe.provide('f_icecore');
}

f_icecore.init_navbar = function() {
	console.log('🔵 F-IceCore Boot: init_navbar called');

	// Find navbar
	const selectors = [
		'.navbar-right',
		'.search-bar',
		'#navbar-breadcrumbs'
	];

	let $target = null;

	for (const selector of selectors) {
		const found = $(selector);
		console.log(`🔍 F-IceCore Boot: Trying "${selector}" = ${found.length}`);
		if (found.length > 0) {
			$target = found.first();
			console.log(`✅ F-IceCore Boot: Found navbar with ${selector}`);
			break;
		}
	}

	if (!$target) {
		console.error('❌ F-IceCore Boot: No navbar found');
		return;
	}

	// Check if button already exists
	if ($('#f-icecore-nav-btn').length > 0) {
		console.log('⚠️ F-IceCore Boot: Button already exists');
		return;
	}

	// Create button HTML
	const $btn = $(`
		<li id="f-icecore-nav-btn" style="display: inline-block; margin-left: 10px;">
			<a href="#" class="btn btn-default btn-sm" title="F-IceCore Calls">
				<i class="fa fa-phone"></i>
			</a>
		</li>
	`);

	// Click handler
	$btn.find('a').on('click', function(e) {
		e.preventDefault();
		console.log('🔵 F-IceCore Boot: Button clicked!');

		// Show dialog
		const d = new frappe.ui.Dialog({
			title: 'F-IceCore Calls',
			size: 'large',
			fields: [{
				fieldtype: 'HTML',
				options: '<div id="f-icecore-panel-content"></div>'
			}]
		});

		d.show();

		// Wait for dialog to be fully rendered in DOM
		setTimeout(() => {
			// Use dialog wrapper to find content (more reliable than global selector)
			const $content = d.$wrapper.find('#f-icecore-panel-content');
			console.log('🔍 F-IceCore Boot: Content div found:', $content.length);

			if ($content.length === 0) {
				console.error('❌ F-IceCore Boot: Content div not found in dialog!');
				return;
			}

			// Load content
			$content.html(`
				<div style="padding: 20px;">
					<h4>Online Users</h4>
					<div id="f-ic-users-list">Loading...</div>
				</div>
			`);

			// Load users
			console.log('📡 F-IceCore Boot: Fetching online users...');
			frappe.call({
				method: 'f_icecore.f_icecore.api.presence.get_call_capable_users',
				callback: (r) => {
					console.log('✅ F-IceCore Boot: Users response:', r);
					console.log('📊 F-IceCore Boot: Users array:', r.message);
					console.log('📊 F-IceCore Boot: Users count:', r.message ? r.message.length : 0);

					const $usersList = d.$wrapper.find('#f-ic-users-list');

					if (r.message && r.message.length > 0) {
						let html = '';
						r.message.forEach(user => {
							html += `
								<div style="padding: 10px; border-bottom: 1px solid #ddd; display: flex; align-items: center; justify-content: space-between;">
									<div>
										<strong>${user.full_name}</strong>
										<br>
										<span style="color: #888; font-size: 12px;">${user.status}</span>
									</div>
									<div style="white-space: nowrap;">
										<button class="btn btn-primary btn-sm"
											onclick="window.FIceCoreUI.initiateCall('${user.user}', 'audio'); return false;"
											title="Audio Call"
											style="margin-right: 5px;">
											<i class="fa fa-phone"></i> Audio
										</button>
										<button class="btn btn-success btn-sm"
											onclick="window.FIceCoreUI.initiateCall('${user.user}', 'video'); return false;"
											title="Video Call">
											<i class="fa fa-video"></i> Video
										</button>
									</div>
								</div>
							`;
						});
						$usersList.html(html);
					} else {
						$usersList.html(`
							<p style="color: #888;">No users currently online</p>
							<p style="color: #999; font-size: 12px;">
								Users will appear here when they are online and available for calls.
							</p>
						`);
					}
				},
				error: (err) => {
					console.error('❌ F-IceCore Boot: Error fetching users:', err);
					d.$wrapper.find('#f-ic-users-list').html(`
						<p style="color: red;">Error loading users. Check console for details.</p>
					`);
				}
			});
		}, 100); // Wait 100ms for dialog to render
	});

	// Insert button
	if ($target.is('.search-bar')) {
		$btn.insertAfter($target);
		console.log('🔵 F-IceCore Boot: Inserted after search-bar');
	} else {
		$target.prepend($btn);
		console.log('🔵 F-IceCore Boot: Prepended to navbar');
	}

	// Verify
	if ($('#f-icecore-nav-btn').length > 0) {
		console.log('✅ F-IceCore Boot: Button added successfully!');
	} else {
		console.error('❌ F-IceCore Boot: Button add failed!');
	}

	// Initialize presence tracking
	f_icecore.init_presence();
};

// Initialize presence tracking with Socket.IO
f_icecore.init_presence = function() {
	console.log('🔵 F-IceCore Boot: init_presence()');

	// Check if already initialized
	if (f_icecore._presence_initialized) {
		console.log('⚠️ F-IceCore Boot: Presence already initialized');
		return;
	}
	f_icecore._presence_initialized = true;

	// Set initial presence as online
	frappe.call({
		method: 'f_icecore.f_icecore.api.presence.update_presence',
		args: { status: 'online' },
		callback: (r) => {
			console.log('✅ F-IceCore Boot: User set online:', r.message);
			console.log('📊 F-IceCore Boot: Presence data:', {
				user: r.message?.user,
				status: r.message?.status,
				full_name: r.message?.full_name
			});
		},
		error: (err) => {
			console.error('❌ F-IceCore Boot: Error setting presence:', err);
		}
	});

	// Listen to Socket.IO presence updates
	if (frappe.socketio && frappe.socketio.socket) {
		console.log('🔵 F-IceCore Boot: Listening to Socket.IO presence events');
		console.log('📡 F-IceCore Boot: Socket.IO connected:', frappe.socketio.socket.connected);

		frappe.socketio.socket.on('f_icecore:presence_update', (data) => {
			console.log('📡 F-IceCore Boot: Presence update received:', data);
			// TODO: Update UI when we have a presence panel
		});
	} else {
		console.warn('⚠️ F-IceCore Boot: Socket.IO not available');
		console.log('🔍 F-IceCore Boot: frappe.socketio =', frappe.socketio);
	}

	// Heartbeat every 60 seconds to stay online
	f_icecore._heartbeat_interval = setInterval(() => {
		frappe.call({
			method: 'f_icecore.f_icecore.api.presence.heartbeat',
			callback: (r) => {
				console.log('💓 F-IceCore Boot: Heartbeat sent');
			},
			error: (err) => {
				console.error('❌ F-IceCore Boot: Heartbeat error:', err);
			}
		});
	}, 60000);

	// Set offline on page unload
	window.addEventListener('beforeunload', () => {
		console.log('🔵 F-IceCore Boot: Page unloading, setting offline');
		// Synchronous call for page unload
		navigator.sendBeacon(
			`${window.location.origin}/api/method/f_icecore.f_icecore.api.presence.update_presence?status=offline`
		);
	});

	console.log('✅ F-IceCore Boot: Presence tracking initialized');
};

// Try multiple initialization hooks
$(document).ready(() => {
	console.log('🔵 F-IceCore Boot: Document ready');

	// Ensure frappe is available
	if (typeof frappe !== 'undefined') {
		frappe.provide('f_icecore');
		setTimeout(() => f_icecore.init_navbar(), 500);
	} else {
		console.warn('⚠️ F-IceCore Boot: Frappe not ready at document.ready');
	}
});

$(window).on('load', () => {
	console.log('🔵 F-IceCore Boot: Window load');

	// Final attempt if navbar not initialized yet
	if (typeof frappe !== 'undefined' && $('#f-icecore-nav-btn').length === 0) {
		frappe.provide('f_icecore');
		setTimeout(() => f_icecore.init_navbar(), 1000);
	}
});

console.log('✅ F-IceCore Boot: Script loaded');
