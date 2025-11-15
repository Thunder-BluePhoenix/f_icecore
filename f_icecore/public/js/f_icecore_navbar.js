/**
 * F-IceCore Navbar Integration
 * Adds phone call button to Frappe navbar
 */

console.log('🔵 F-IceCore Navbar: Script loading...');

frappe.provide('f_icecore.navbar');

// Add navbar styles
const style = document.createElement('style');
style.textContent = `
	.f-icecore-navbar-wrapper {
		display: inline-flex;
		align-items: center;
		margin-left: 10px;
		position: relative;
	}

	.f-icecore-navbar-btn {
		background: transparent;
		border: none;
		color: var(--text-color);
		cursor: pointer;
		padding: 8px 12px;
		border-radius: 4px;
		transition: background-color 0.2s;
	}

	.f-icecore-navbar-btn:hover {
		background-color: var(--bg-color);
	}

	.f-icecore-navbar-btn i {
		font-size: 18px;
	}

	.f-icecore-badge {
		position: absolute;
		top: 4px;
		right: 4px;
		background: #f56565;
		color: white;
		border-radius: 10px;
		padding: 2px 6px;
		font-size: 10px;
		font-weight: bold;
		display: none;
	}
`;
document.head.appendChild(style);

f_icecore.navbar.CallButton = class CallButton {
	constructor() {
		console.log('🔵 F-IceCore Navbar: CallButton constructor');
		this.setup();
		this.init_presence();
	}

	setup() {
		console.log('🔵 F-IceCore Navbar: setup() called');

		// Wait for page to be fully loaded
		if (document.readyState === 'loading') {
			console.log('🔵 F-IceCore Navbar: Waiting for DOMContentLoaded...');
			document.addEventListener('DOMContentLoaded', () => this.create_button());
		} else {
			this.create_button();
		}
	}

	create_button() {
		console.log('🔵 F-IceCore Navbar: create_button() called');

		// Try multiple selectors to find navbar
		const selectors = [
			'.navbar .navbar-right',
			'.navbar-right',
			'header .navbar-right',
			'.search-bar',
			'#navbar-breadcrumbs',
			'.navbar .nav'
		];

		let $target = null;
		let foundSelector = null;

		for (const selector of selectors) {
			const found = $(selector);
			console.log(`🔍 F-IceCore Navbar: Trying "${selector}" - found ${found.length}`);

			if (found.length > 0) {
				$target = found.first();
				foundSelector = selector;
				console.log(`✅ F-IceCore Navbar: Using selector: ${selector}`);
				break;
			}
		}

		if (!$target || $target.length === 0) {
			console.error('❌ F-IceCore Navbar: Could not find navbar!');
			console.log('🔍 Available elements:');
			console.log('  navbar:', $('.navbar').length);
			console.log('  header:', $('header').length);
			console.log('  search-bar:', $('.search-bar').length);

			// Retry after delay
			console.log('⏳ F-IceCore Navbar: Retrying in 1 second...');
			setTimeout(() => this.create_button(), 1000);
			return;
		}

		// Check if already exists
		if ($('#f-icecore-navbar-btn').length > 0) {
			console.log('⚠️ F-IceCore Navbar: Button already exists');
			return;
		}

		// Create button
		console.log('🔵 F-IceCore Navbar: Creating button HTML...');

		this.$wrapper = $(`
			<div class="f-icecore-navbar-wrapper" id="f-icecore-navbar-btn">
				<button class="f-icecore-navbar-btn" type="button" title="${__('F-IceCore Calls')}">
					<i class="fa fa-phone"></i>
					<span class="f-icecore-badge"></span>
				</button>
			</div>
		`);

		// Bind click event
		this.$wrapper.find('button').on('click', (e) => {
			e.preventDefault();
			console.log('🔵 F-IceCore Navbar: Button clicked!');
			this.show_call_panel();
		});

		// Insert into navbar
		if (foundSelector === '.search-bar') {
			console.log('🔵 F-IceCore Navbar: Inserting after search bar');
			this.$wrapper.insertAfter($target);
		} else {
			console.log('🔵 F-IceCore Navbar: Prepending to navbar');
			$target.prepend(this.$wrapper);
		}

		// Verify
		const exists = $('#f-icecore-navbar-btn').length > 0;
		if (exists) {
			console.log('✅ F-IceCore Navbar: Button added successfully!');
		} else {
			console.error('❌ F-IceCore Navbar: Button creation failed!');
		}
	}

	show_call_panel() {
		console.log('🔵 F-IceCore Navbar: show_call_panel()');

		// Check if FIceCoreUI is loaded
		if (!window.FIceCoreUI) {
			console.warn('⚠️ F-IceCore Navbar: FIceCoreUI not loaded yet');
			frappe.msgprint({
				title: __('F-IceCore Loading'),
				message: __('Call interface is loading. Please try again in a moment.'),
				indicator: 'blue'
			});
			return;
		}

		// Create call panel dialog
		const dialog = new frappe.ui.Dialog({
			title: __('F-IceCore Calls'),
			size: 'large',
			fields: [{
				fieldtype: 'HTML',
				fieldname: 'call_panel_html'
			}]
		});

		const html = `
			<div class="f-icecore-panel">
				<div class="tabs" style="margin-bottom: 15px;">
					<ul class="nav nav-tabs" role="tablist">
						<li role="presentation" class="active">
							<a href="#f-ic-online" role="tab" data-toggle="tab">
								${__('Online Users')}
							</a>
						</li>
						<li role="presentation">
							<a href="#f-ic-history" role="tab" data-toggle="tab">
								${__('Call History')}
							</a>
						</li>
						<li role="presentation">
							<a href="#f-ic-settings" role="tab" data-toggle="tab">
								${__('Settings')}
							</a>
						</li>
					</ul>
				</div>
				<div class="tab-content">
					<div role="tabpanel" class="tab-pane active" id="f-ic-online">
						<div id="f-ic-online-users"></div>
					</div>
					<div role="tabpanel" class="tab-pane" id="f-ic-history">
						<div id="f-ic-call-history"></div>
					</div>
					<div role="tabpanel" class="tab-pane" id="f-ic-settings">
						<div id="f-ic-settings-panel"></div>
					</div>
				</div>
			</div>
		`;

		dialog.fields_dict.call_panel_html.$wrapper.html(html);
		dialog.show();

		// Load online users
		this.load_online_users();

		// Setup tab listeners
		$('a[href="#f-ic-history"]').on('shown.bs.tab', () => this.load_call_history());
		$('a[href="#f-ic-settings"]').on('shown.bs.tab', () => this.load_settings());
	}

	load_online_users() {
		console.log('🔵 F-IceCore Navbar: load_online_users()');
		const container = $('#f-ic-online-users');
		container.html('<div style="padding: 40px; text-align: center;"><i class="fa fa-spinner fa-spin"></i> Loading...</div>');

		frappe.call({
			method: 'f_icecore.f_icecore.api.presence.get_call_capable_users',
			callback: (r) => {
				console.log('🔵 F-IceCore Navbar: Online users:', r.message);
				if (r.message && r.message.length > 0) {
					this.render_online_users(r.message, container);
				} else {
					container.html('<div style="padding: 40px; text-align: center; color: #999;">No users online</div>');
				}
			},
			error: (err) => {
				console.error('❌ F-IceCore Navbar: Error loading users:', err);
				container.html('<div style="padding: 40px; text-align: center; color: #f56565;">Error loading users</div>');
			}
		});
	}

	render_online_users(users, container) {
		container.empty();

		users.forEach(user => {
			const card = $(`
				<div style="padding: 12px; border-bottom: 1px solid #eee; display: flex; align-items: center;">
					<img src="${frappe.utils.get_avatar(user.user)}"
						 style="width: 40px; height: 40px; border-radius: 50%; margin-right: 12px;">
					<div style="flex: 1;">
						<div style="font-weight: 500;">${user.full_name}</div>
						<div style="font-size: 12px; color: #888;">${user.status}</div>
					</div>
					<button class="btn btn-sm btn-primary" data-user="${user.user}" data-type="audio">
						<i class="fa fa-phone"></i>
					</button>
					<button class="btn btn-sm btn-success" data-user="${user.user}" data-type="video" style="margin-left: 8px;">
						<i class="fa fa-video"></i>
					</button>
				</div>
			`);

			card.find('button').on('click', function() {
				const targetUser = $(this).data('user');
				const callType = $(this).data('type');
				console.log(`🔵 F-IceCore: Calling ${targetUser} (${callType})`);

				if (window.FIceCoreUI) {
					window.FIceCoreUI.initiateCall(targetUser, callType);
				} else {
					frappe.msgprint('Call interface not ready');
				}
			});

			container.append(card);
		});
	}

	load_call_history() {
		console.log('🔵 F-IceCore Navbar: load_call_history()');
		$('#f-ic-call-history').html('<div style="padding: 40px; text-align: center;">Call history coming soon...</div>');
	}

	load_settings() {
		console.log('🔵 F-IceCore Navbar: load_settings()');
		const html = `
			<div style="padding: 20px;">
				<h4>Settings</h4>
				<button class="btn btn-primary" onclick="frappe.set_route('Form', 'F IceCore Settings', 'F IceCore Settings')">
					<i class="fa fa-cog"></i> Open F IceCore Settings
				</button>
			</div>
		`;
		$('#f-ic-settings-panel').html(html);
	}

	init_presence() {
		console.log('🔵 F-IceCore Navbar: init_presence()');

		// Set initial presence
		frappe.call({
			method: 'f_icecore.f_icecore.api.presence.update_presence',
			args: { status: 'online' },
			callback: (r) => {
				console.log('🔵 F-IceCore Navbar: Presence set:', r);
			}
		});

		// Heartbeat every 60 seconds
		setInterval(() => {
			frappe.call({
				method: 'f_icecore.f_icecore.api.presence.heartbeat'
			});
		}, 60000);
	}
};

// Initialize when ready
$(document).ready(function() {
	console.log('🔵 F-IceCore Navbar: Document ready');

	if (frappe.session && frappe.session.user !== 'Guest') {
		console.log('🔵 F-IceCore Navbar: Creating CallButton instance');
		f_icecore.navbar.instance = new f_icecore.navbar.CallButton();
	} else {
		console.log('⚠️ F-IceCore Navbar: User is Guest, skipping');
	}
});

frappe.ready(() => {
	console.log('🔵 F-IceCore Navbar: Frappe ready');

	if (!f_icecore.navbar.instance && frappe.session && frappe.session.user !== 'Guest') {
		console.log('🔵 F-IceCore Navbar: Creating CallButton instance (frappe.ready)');
		f_icecore.navbar.instance = new f_icecore.navbar.CallButton();
	}
});

console.log('✅ F-IceCore Navbar: Script loaded');
