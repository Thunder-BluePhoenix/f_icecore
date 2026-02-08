/**
 * F-IceCore Boot Script
 * This file is loaded via frappe.boot
 */

console.log('🔵 F-IceCore Boot: Script executed');

// --- HTTPS-aware SocketIO port override ---
// When using HTTPS proxy (port 8443), SocketIO must connect to WSS proxy (port 9443)
// instead of the plain HTTP SocketIO port (9002)
(function() {
	if (window.location.protocol === 'https:' && window.location.port === '8443') {
		// We're on the HTTPS proxy - override SocketIO port to WSS proxy
		if (typeof frappe !== 'undefined' && frappe.boot) {
			frappe.boot.socketio_port = '9443';
			console.log('🔒 F-IceCore Boot: HTTPS detected, SocketIO port overridden to 9443 (WSS)');
		} else {
			// frappe.boot not ready yet, set it when it becomes available
			const _checkBoot = setInterval(() => {
				if (typeof frappe !== 'undefined' && frappe.boot) {
					frappe.boot.socketio_port = '9443';
					console.log('🔒 F-IceCore Boot: HTTPS detected (delayed), SocketIO port overridden to 9443 (WSS)');
					clearInterval(_checkBoot);
				}
			}, 50);
			// Give up after 10 seconds
			setTimeout(() => clearInterval(_checkBoot), 10000);
		}
	}
})();

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

	// Click handler — opens call panel, or reopens ongoing call window
	$btn.find('a').on('click', function(e) {
		e.preventDefault();

		// Check if there's an ongoing call and the window was closed/hidden
		const hasActive1to1 = window.FIceCore?.peerConnection && window.FIceCore?.callId;
		const hasActiveGroup = window.FIceCoreGroup?.isInGroupCall;

		if ((hasActive1to1 || hasActiveGroup) && window.FIceCoreUI?.currentCallWindow) {
			// Reopen the existing call window
			const dialog = window.FIceCoreUI.currentCallWindow;
			if (!dialog.$wrapper.is(':visible')) {
				dialog.show();
				console.log('📞 F-IceCore: Reopened ongoing call window');

				// Re-attach streams after a short delay (DOM needs to be visible)
				setTimeout(() => {
					if (hasActiveGroup && window.FIceCoreGroup?.localStream) {
						window.FIceCoreUI._groupAttachLocalStream();
						// Re-attach all remote streams
						for (const [userId, peerData] of window.FIceCoreGroup.peers) {
							if (peerData.remoteStream.getTracks().length > 0) {
								window.FIceCoreUI._attachGroupRemoteStream(userId, peerData.remoteStream);
							}
						}
					} else if (hasActive1to1 && window.FIceCore) {
						window.FIceCore.attachLocalStream();
						window.FIceCore.attachRemoteStream();
					}
				}, 150);
			}
			return;
		}

		// No ongoing call — open the normal call panel
		f_icecore.openCallPanel();
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

// ============================================================
// Call Panel: Searchable user directory with pagination & multi-select
// ============================================================

// Panel state
f_icecore._callPanelState = {
	query: '',
	currentPage: 1,
	pageSize: 10,
	totalPages: 1,
	total: 0,
	selectedUsers: [],  // [{user: email, full_name: string}]
	debounceTimer: null,
	dialog: null
};

/**
 * Open the call panel dialog with search, pagination, multi-select
 */
f_icecore.openCallPanel = function() {
	console.log('🔵 F-IceCore: Opening call panel');

	const state = f_icecore._callPanelState;

	// Reset state for fresh open
	state.query = '';
	state.currentPage = 1;
	state.selectedUsers = [];

	const d = new frappe.ui.Dialog({
		title: __('F-IceCore Calls'),
		size: 'large',
		fields: [{
			fieldtype: 'HTML',
			options: '<div id="f-icecore-panel-content"></div>'
		}]
	});

	state.dialog = d;
	d.show();

	setTimeout(() => {
		const $content = d.$wrapper.find('#f-icecore-panel-content');
		if ($content.length === 0) return;

		// Get pending calls
		const pendingCalls = window.FIceCoreUI ? window.FIceCoreUI.getPendingCalls() : [];

		let contentHtml = '';

		// Pending incoming calls section
		if (pendingCalls.length > 0) {
			contentHtml += `
				<div style="padding: 15px; background-color: #fff3cd; border-bottom: 2px solid #ffc107;">
					<h5 style="color: #856404; margin-bottom: 10px;">
						<i class="fa fa-phone-square" style="color: #ffc107;"></i>
						${__('Incoming Calls')} (${pendingCalls.length})
					</h5>
					<div id="f-ic-pending-calls"></div>
				</div>
			`;
		}

		// Search bar
		contentHtml += `
			<div class="f-ic-search-container">
				<div style="position: relative;">
					<input type="text" id="f-ic-search-input"
						class="form-control"
						placeholder="${__('Search by name, email, phone...')}"
						autocomplete="off" />
					<i class="fa fa-search" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #aaa;"></i>
				</div>
			</div>
		`;

		// Selected users bar (hidden initially)
		contentHtml += `<div id="f-ic-selected-bar" class="f-ic-selected-bar" style="display: none;"></div>`;

		// Users list
		contentHtml += `<div id="f-ic-users-list" style="min-height: 200px;"><div style="text-align:center; padding:40px; color:#aaa;"><i class="fa fa-spinner fa-spin"></i> ${__('Loading...')}</div></div>`;

		// Pagination
		contentHtml += `<div id="f-ic-pagination" class="f-ic-pagination"></div>`;

		$content.html(contentHtml);

		// Render pending calls
		if (pendingCalls.length > 0) {
			f_icecore._renderPendingCalls(d, pendingCalls);
		}

		// Bind events (event delegation)
		d.$wrapper.on('input', '#f-ic-search-input', function() {
			clearTimeout(state.debounceTimer);
			state.debounceTimer = setTimeout(() => {
				state.query = $(this).val();
				state.currentPage = 1;
				f_icecore.loadUsers();
			}, 300);
		});

		d.$wrapper.on('click', '#f-ic-prev-page', () => {
			if (state.currentPage > 1) {
				state.currentPage--;
				f_icecore.loadUsers();
			}
		});

		d.$wrapper.on('click', '#f-ic-next-page', () => {
			if (state.currentPage < state.totalPages) {
				state.currentPage++;
				f_icecore.loadUsers();
			}
		});

		d.$wrapper.on('change', '.f-ic-select-user', function() {
			const user = $(this).data('user');
			const fullName = $(this).data('fullname');
			f_icecore.toggleUserSelection(user, fullName);
		});

		d.$wrapper.on('click', '.f-ic-call-audio', function(e) {
			e.stopPropagation();
			const user = $(this).data('user');
			if (window.FIceCoreUI) {
				state.dialog.hide();
				window.FIceCoreUI.initiateCall(user, 'audio');
			}
		});

		d.$wrapper.on('click', '.f-ic-call-video', function(e) {
			e.stopPropagation();
			const user = $(this).data('user');
			if (window.FIceCoreUI) {
				state.dialog.hide();
				window.FIceCoreUI.initiateCall(user, 'video');
			}
		});

		d.$wrapper.on('click', '.f-ic-remove-selected', function() {
			const user = $(this).data('user');
			f_icecore.removeSelectedUser(user);
		});

		d.$wrapper.on('click', '#f-ic-group-audio', () => {
			f_icecore.initiateGroupCall('audio');
		});

		d.$wrapper.on('click', '#f-ic-group-video', () => {
			f_icecore.initiateGroupCall('video');
		});

		// Load first page
		f_icecore.loadUsers();

	}, 100);
};

/**
 * Render pending incoming calls in the panel
 */
f_icecore._renderPendingCalls = function(dialog, pendingCalls) {
	const $pendingList = dialog.$wrapper.find('#f-ic-pending-calls');
	let html = '';

	pendingCalls.forEach(call => {
		const callTypeIcon = call.call_type === 'video' ? '📹' : '📞';
		html += `
			<div style="padding: 12px; border: 2px solid #ffc107; border-radius: 8px; margin-bottom: 8px; background: white; display: flex; align-items: center; justify-content: space-between;">
				<div style="display: flex; align-items: center; gap: 10px; flex: 1;">
					<div class="pending-avatar-${call.call_id}" style="display: inline-block;"></div>
					<div>
						<strong>${call.from_user_name}</strong><br>
						<span style="color: #888; font-size: 13px;">${callTypeIcon} ${call.call_type.charAt(0).toUpperCase() + call.call_type.slice(1)} Call</span>
					</div>
				</div>
				<div style="display: flex; gap: 8px;">
					<button class="btn btn-success btn-sm f-ic-accept-pending"
						data-callid="${call.call_id}" data-from="${call.from_user}" data-type="${call.call_type}">
						<i class="fa fa-phone"></i> ${__('Accept')}
					</button>
					<button class="btn btn-danger btn-sm f-ic-reject-pending" data-callid="${call.call_id}">
						<i class="fa fa-times"></i> ${__('Decline')}
					</button>
				</div>
			</div>
		`;
	});

	$pendingList.html(html);

	// Bind pending call buttons
	dialog.$wrapper.on('click', '.f-ic-accept-pending', function() {
		const callId = $(this).data('callid');
		const fromUser = $(this).data('from');
		const callType = $(this).data('type');
		if (window.FIceCoreUI) {
			window.FIceCoreUI.acceptCallFromNotification(callId, fromUser, callType);
		}
	});
	dialog.$wrapper.on('click', '.f-ic-reject-pending', function() {
		const callId = $(this).data('callid');
		if (window.FIceCoreUI) {
			window.FIceCoreUI.rejectCallFromNotification(callId);
		}
	});

	// Render avatars
	pendingCalls.forEach(call => {
		const el = dialog.$wrapper.find(`.pending-avatar-${call.call_id}`)[0];
		if (el) el.innerHTML = frappe.avatar(call.from_user, 'avatar-small');
	});
};

/**
 * Load users from search API and render
 */
f_icecore.loadUsers = function() {
	const state = f_icecore._callPanelState;
	if (!state.dialog) return;

	const $usersList = state.dialog.$wrapper.find('#f-ic-users-list');
	$usersList.html('<div style="text-align:center; padding:30px; color:#aaa;"><i class="fa fa-spinner fa-spin"></i></div>');

	frappe.call({
		method: 'f_icecore.f_icecore.api.presence.search_users',
		args: {
			query: state.query || '',
			page: state.currentPage,
			page_size: state.pageSize
		},
		callback: (r) => {
			const data = r.message;
			if (!data) return;

			state.totalPages = data.total_pages;
			state.total = data.total;
			state.currentPage = data.page;

			f_icecore.renderUserList(data.users);
			f_icecore.renderPagination(data);
		},
		error: () => {
			$usersList.html('<p style="color:red; padding:20px;">' + __('Error loading users') + '</p>');
		}
	});
};

/**
 * Render user list with checkboxes, presence, call buttons
 */
f_icecore.renderUserList = function(users) {
	const state = f_icecore._callPanelState;
	if (!state.dialog) return;

	const $usersList = state.dialog.$wrapper.find('#f-ic-users-list');

	if (!users || users.length === 0) {
		const msg = state.query
			? __('No users found matching') + ' "' + state.query + '"'
			: __('No users available');
		$usersList.html(`<div style="text-align:center; padding:40px; color:#888;">${msg}</div>`);
		return;
	}

	let html = '';
	users.forEach(user => {
		const isSelected = state.selectedUsers.some(s => s.user === user.user);
		const isOnline = user.status !== 'offline';
		const statusClass = user.status || 'offline';
		const statusText = user.status === 'in_call' ? __('In a call')
			: user.status === 'busy' ? __('Busy')
			: user.status === 'away' ? __('Away')
			: user.status === 'online' ? __('Online')
			: __('Offline');

		html += `
			<div class="f-icecore-user-card ${isSelected ? 'selected' : ''}" data-user="${user.user}">
				<div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
					<input type="checkbox" class="f-ic-select-user"
						data-user="${user.user}" data-fullname="${user.full_name}"
						${isSelected ? 'checked' : ''} style="margin: 0; flex-shrink: 0;" />
					<div class="user-avatar" style="position: relative; flex-shrink: 0;">
						${frappe.avatar(user.user, 'avatar-small')}
						<span class="f-icecore-presence ${statusClass}"></span>
					</div>
					<div class="user-info" style="min-width: 0; overflow: hidden;">
						<div class="user-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${user.full_name}</div>
						<div class="user-status">
							${user.user}
							${user.mobile_no ? ' · ' + user.mobile_no : ''}
							<span style="margin-left: 6px; color: ${isOnline ? '#43b581' : '#888'};">${statusText}</span>
						</div>
					</div>
				</div>
				<div class="call-actions" style="flex-shrink: 0;">
					<button class="btn btn-xs btn-primary f-ic-call-audio" data-user="${user.user}" title="${__('Audio Call')}">
						<i class="fa fa-phone"></i>
					</button>
					<button class="btn btn-xs btn-success f-ic-call-video" data-user="${user.user}" title="${__('Video Call')}">
						<i class="fa fa-video-camera"></i>
					</button>
				</div>
			</div>
		`;
	});

	$usersList.html(html);
};

/**
 * Render pagination controls
 */
f_icecore.renderPagination = function(data) {
	const state = f_icecore._callPanelState;
	if (!state.dialog) return;

	const $pagination = state.dialog.$wrapper.find('#f-ic-pagination');

	if (data.total_pages <= 1) {
		$pagination.html(`<span style="color: #999; font-size: 12px;">${data.total} ${__('user(s)')}</span>`);
		return;
	}

	$pagination.html(`
		<button class="btn btn-xs btn-default" id="f-ic-prev-page" ${data.page <= 1 ? 'disabled' : ''}>
			<i class="fa fa-chevron-left"></i> ${__('Prev')}
		</button>
		<span style="color: #666; font-size: 13px;">
			${__('Page')} ${data.page} ${__('of')} ${data.total_pages}
			<span style="color: #999;">(${data.total} ${__('users')})</span>
		</span>
		<button class="btn btn-xs btn-default" id="f-ic-next-page" ${data.page >= data.total_pages ? 'disabled' : ''}>
			${__('Next')} <i class="fa fa-chevron-right"></i>
		</button>
	`);
};

/**
 * Toggle user selection (add/remove from selectedUsers)
 */
f_icecore.toggleUserSelection = function(user, fullName) {
	const state = f_icecore._callPanelState;
	const idx = state.selectedUsers.findIndex(s => s.user === user);

	if (idx > -1) {
		state.selectedUsers.splice(idx, 1);
	} else {
		state.selectedUsers.push({ user, full_name: fullName });
	}

	f_icecore.renderSelectedUsers();

	// Update card highlight
	if (state.dialog) {
		const $card = state.dialog.$wrapper.find(`.f-icecore-user-card[data-user="${user}"]`);
		$card.toggleClass('selected', idx === -1);
	}
};

/**
 * Remove a user from selection
 */
f_icecore.removeSelectedUser = function(user) {
	const state = f_icecore._callPanelState;
	const idx = state.selectedUsers.findIndex(s => s.user === user);
	if (idx > -1) {
		state.selectedUsers.splice(idx, 1);
	}

	// Uncheck the checkbox if visible
	if (state.dialog) {
		state.dialog.$wrapper.find(`.f-ic-select-user[data-user="${user}"]`).prop('checked', false);
		state.dialog.$wrapper.find(`.f-icecore-user-card[data-user="${user}"]`).removeClass('selected');
	}

	f_icecore.renderSelectedUsers();
};

/**
 * Render selected users chips and group call buttons
 */
f_icecore.renderSelectedUsers = function() {
	const state = f_icecore._callPanelState;
	if (!state.dialog) return;

	const $bar = state.dialog.$wrapper.find('#f-ic-selected-bar');

	if (state.selectedUsers.length === 0) {
		$bar.hide().html('');
		return;
	}

	let chipsHtml = '<div class="f-ic-chips-row">';
	state.selectedUsers.forEach(s => {
		chipsHtml += `
			<span class="f-ic-selected-chip">
				${s.full_name}
				<span class="f-ic-remove-selected" data-user="${s.user}" title="${__('Remove')}">&times;</span>
			</span>
		`;
	});
	chipsHtml += '</div>';

	const count = state.selectedUsers.length;
	const label = count === 1 ? __('Call') : __('Group Call');
	chipsHtml += `
		<div class="f-ic-group-call-btns">
			<button class="btn btn-sm btn-primary" id="f-ic-group-audio">
				<i class="fa fa-phone"></i> ${label} (${count}) — ${__('Audio')}
			</button>
			<button class="btn btn-sm btn-success" id="f-ic-group-video">
				<i class="fa fa-video-camera"></i> ${label} (${count}) — ${__('Video')}
			</button>
		</div>
	`;

	$bar.html(chipsHtml).show();
};

/**
 * Initiate a group call (or 1:1 if only 1 selected)
 */
f_icecore.initiateGroupCall = async function(callType) {
	const state = f_icecore._callPanelState;
	const selected = state.selectedUsers;

	if (selected.length === 0) {
		frappe.msgprint(__('Select at least one user'));
		return;
	}

	// Close the panel
	if (state.dialog) {
		state.dialog.hide();
		state.dialog = null;
	}

	if (selected.length === 1) {
		// 1:1 call — use existing flow
		if (window.FIceCoreUI) {
			window.FIceCoreUI.initiateCall(selected[0].user, callType);
		}
		return;
	}

	// Group call — use group WebRTC engine
	if (!window.FIceCoreGroup) {
		frappe.msgprint(__('Group calling engine not available'));
		return;
	}

	// Request media permission
	if (window.FIceCore) {
		const hasPermission = await window.FIceCore.requestMediaPermission(callType);
		if (!hasPermission) return;
	}

	const userEmails = selected.map(s => s.user);
	console.log('📞 Initiating group call:', callType, 'to:', userEmails);

	try {
		await window.FIceCoreGroup.startGroupCall(userEmails, callType);
	} catch (error) {
		console.error('❌ Group call failed:', error);
		frappe.msgprint(__('Failed to start group call'));
	}
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
