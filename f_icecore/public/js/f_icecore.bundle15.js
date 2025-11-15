/**
 * F-IceCore Bundle
 * Main entry point for F-IceCore client-side code
 *
 * NOTE: This assumes webrtc_engine.js and call_ui.js are already loaded via hooks.py
 */

// Wait for frappe to be ready
$(document).ready(() => {
	// Check if frappe is available, if not wait
	if (typeof frappe === 'undefined') {
		console.warn('F-IceCore Bundle: Frappe not yet loaded, waiting...');
		return;
	}

	console.log('F-IceCore initialized');

	// Setup global keyboard shortcuts
	setupKeyboardShortcuts();

	// Add call buttons to user interface
	enhanceUserInterface();
});

function setupKeyboardShortcuts() {
	// Ctrl/Cmd + Shift + C for quick call dialog
	$(document).on('keydown', (e) => {
		if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
			e.preventDefault();
			showQuickCallDialog();
		}

		// Ctrl/Cmd + Shift + H to hang up active call
		if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
			e.preventDefault();
			if (window.FIceCoreUI.currentCallWindow) {
				window.FIceCoreUI.hangup();
			}
		}

		// Ctrl/Cmd + M to toggle mute during call
		if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
			e.preventDefault();
			if (window.FIceCoreUI.currentCallWindow) {
				window.FIceCoreUI.toggleAudio();
			}
		}
	});
}

function enhanceUserInterface() {
	// Add F-IceCore menu to navbar
	addCallMenu();

	// Add online users widget to desk
	if (frappe.boot.desk_settings && frappe.pages.Desk) {
		addOnlineUsersWidget();
	}
}

function addCallMenu() {
	// Add menu item to navbar
	if (frappe.boot.user && frappe.boot.user.name !== 'Guest') {
		// Add to navbar dropdown (if exists)
		const navbar = $('.navbar-right');
		if (navbar.length) {
			// Create call icon button
			const callButton = $(`
				<li>
					<a href="#" onclick="window.FIceCoreUI.showCallMenu(); return false;"
						title="${__('F-IceCore Calls')}">
						<i class="fa fa-phone"></i>
					</a>
				</li>
			`);

			navbar.prepend(callButton);
		}
	}
}

function addOnlineUsersWidget() {
	// Add online users widget to sidebar (implementation depends on Frappe version)
	// This is a placeholder for custom integration
}

function showQuickCallDialog() {
	// Show quick call dialog for searching and calling users
	const dialog = new frappe.ui.Dialog({
		title: __('Quick Call'),
		fields: [
			{
				fieldtype: 'Link',
				fieldname: 'user',
				label: __('Select User'),
				options: 'User',
				filters: { 'enabled': 1, 'user_type': 'System User' },
				reqd: 1,
				get_query: () => {
					return {
						filters: {
							'name': ['!=', frappe.session.user],
							'enabled': 1
						}
					};
				}
			},
			{
				fieldtype: 'Select',
				fieldname: 'call_type',
				label: __('Call Type'),
				options: 'Audio\nVideo',
				default: 'Audio',
				reqd: 1
			}
		],
		primary_action_label: __('Call'),
		primary_action: (values) => {
			const callType = values.call_type.toLowerCase();
			window.FIceCoreUI.initiateCall(values.user, callType);
			dialog.hide();
		}
	});

	dialog.show();
}

// Extend FIceCoreCallUI with additional methods
window.FIceCoreUI.showCallMenu = function() {
	// Show call menu with online users and call history
	const dialog = new frappe.ui.Dialog({
		title: __('F-IceCore Calls'),
		size: 'large',
		fields: [
			{
				fieldtype: 'HTML',
				options: `
					<div class="f-icecore-menu">
						<ul class="nav nav-tabs" role="tablist">
							<li role="presentation" class="active">
								<a href="#online-users" role="tab" data-toggle="tab">
									${__('Online Users')}
								</a>
							</li>
							<li role="presentation">
								<a href="#call-history" role="tab" data-toggle="tab">
									${__('Call History')}
								</a>
							</li>
							<li role="presentation">
								<a href="#call-stats" role="tab" data-toggle="tab">
									${__('Statistics')}
								</a>
							</li>
						</ul>
						<div class="tab-content" style="margin-top: 15px;">
							<div role="tabpanel" class="tab-pane active" id="online-users">
								<div id="f-icecore-online-users-list"></div>
							</div>
							<div role="tabpanel" class="tab-pane" id="call-history">
								<div id="f-icecore-call-history-list"></div>
							</div>
							<div role="tabpanel" class="tab-pane" id="call-stats">
								<div id="f-icecore-call-stats"></div>
							</div>
						</div>
					</div>
				`
			}
		]
	});

	dialog.show();

	// Load online users
	loadOnlineUsers();

	// Load call history on tab click
	$('a[href="#call-history"]').on('shown.bs.tab', loadCallHistory);

	// Load call stats on tab click
	$('a[href="#call-stats"]').on('shown.bs.tab', loadCallStats);
};

function loadOnlineUsers() {
	frappe.call({
		method: 'f_icecore.f_icecore.api.presence.get_call_capable_users',
		callback: (r) => {
			if (r.message) {
				renderOnlineUsers(r.message);
			}
		}
	});
}

function renderOnlineUsers(users) {
	const container = $('#f-icecore-online-users-list');
	container.empty();

	if (users.length === 0) {
		container.html(`<p class="text-muted">${__('No users online')}</p>`);
		return;
	}

	users.forEach(user => {
		const userCard = $(`
			<div class="f-icecore-user-card">
				<div class="user-avatar">
					<img src="${frappe.avatar(user.user, "avatar-medium")}" alt="${user.full_name}">
					<span class="f-icecore-presence ${user.status}"></span>
				</div>
				<div class="user-info">
					<div class="user-name">${user.full_name}</div>
					<div class="user-status">${__(user.status)}</div>
				</div>
				<div class="call-actions">
					<button class="audio" onclick="window.FIceCoreUI.initiateCall('${user.user}', 'audio')" title="${__('Audio Call')}">
						<i class="fa fa-phone"></i>
					</button>
					<button class="video" onclick="window.FIceCoreUI.initiateCall('${user.user}', 'video')" title="${__('Video Call')}">
						<i class="fa fa-video"></i>
					</button>
				</div>
			</div>
		`);

		container.append(userCard);
	});
}

function loadCallHistory() {
	frappe.call({
		method: 'f_icecore.f_icecore.api.call_session.get_call_history',
		args: { limit: 50 },
		callback: (r) => {
			if (r.message) {
				renderCallHistory(r.message);
			}
		}
	});
}

function renderCallHistory(calls) {
	const container = $('#f-icecore-call-history-list');
	container.empty();

	if (calls.length === 0) {
		container.html(`<p class="text-muted">${__('No call history')}</p>`);
		return;
	}

	calls.forEach(call => {
		const iconClass = call.direction === 'incoming' ? 'incoming' : 'outgoing';
		const icon = call.call_type === 'video' ? 'fa-video' : 'fa-phone';
		const date = frappe.datetime.comment_when(call.creation);
		const duration = call.duration ? frappe.format(call.duration, { fieldtype: 'Duration' }) : '-';

		const callItem = $(`
			<div class="f-icecore-call-history-item">
				<div class="call-icon ${iconClass}">
					<i class="fa ${icon}"></i>
				</div>
				<div class="call-info">
					<div class="call-user">${call.other_user_name}</div>
					<div class="call-meta">
						${call.direction === 'incoming' ? __('Incoming') : __('Outgoing')} •
						${__(call.status)} •
						${date} •
						${duration}
					</div>
				</div>
			</div>
		`);

		container.append(callItem);
	});
}

function loadCallStats() {
	frappe.call({
		method: 'f_icecore.f_icecore.api.call_session.get_call_stats',
		callback: (r) => {
			if (r.message) {
				renderCallStats(r.message);
			}
		}
	});
}

function renderCallStats(stats) {
	const container = $('#f-icecore-call-stats');
	container.empty();

	const statsHTML = `
		<div class="row">
			<div class="col-sm-6 col-md-3">
				<div class="well text-center">
					<h3>${stats.total_calls}</h3>
					<p class="text-muted">${__('Total Calls')}</p>
				</div>
			</div>
			<div class="col-sm-6 col-md-3">
				<div class="well text-center">
					<h3>${stats.answered_calls}</h3>
					<p class="text-muted">${__('Answered Calls')}</p>
				</div>
			</div>
			<div class="col-sm-6 col-md-3">
				<div class="well text-center">
					<h3>${stats.missed_calls}</h3>
					<p class="text-muted">${__('Missed Calls')}</p>
				</div>
			</div>
			<div class="col-sm-6 col-md-3">
				<div class="well text-center">
					<h3>${stats.total_duration_minutes}m</h3>
					<p class="text-muted">${__('Total Duration')}</p>
				</div>
			</div>
		</div>
		<div class="row">
			<div class="col-md-6">
				<div class="well">
					<h4>${__('Answer Rate')}</h4>
					<div class="progress">
						<div class="progress-bar progress-bar-success" style="width: ${stats.answer_rate}%">
							${stats.answer_rate}%
						</div>
					</div>
				</div>
			</div>
			<div class="col-md-6">
				<div class="well">
					<h4>${__('Recent Activity')}</h4>
					<p>${stats.recent_calls_7d} ${__('calls in the last 7 days')}</p>
				</div>
			</div>
		</div>
	`;

	container.html(statsHTML);
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		showQuickCallDialog,
		loadOnlineUsers,
		loadCallHistory,
		loadCallStats
	};
}
