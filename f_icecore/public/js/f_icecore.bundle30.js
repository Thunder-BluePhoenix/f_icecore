/**
 * F-IceCore Bundle
 * Main entry point for F-IceCore client-side code
 * Version 24 - Fixed showCallMenu error
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

	console.log('F-IceCore Bundle v24 initialized');

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
			if (window.FIceCoreUI && window.FIceCoreUI.currentCallWindow) {
				window.FIceCoreUI.hangup();
			}
		}

		// Ctrl/Cmd + M to toggle mute during call
		if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
			e.preventDefault();
			if (window.FIceCoreUI && window.FIceCoreUI.currentCallWindow) {
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
				<li id="f-icecore-nav-btn">
					<a href="#" onclick="if(window.FIceCoreUI && window.FIceCoreUI.showCallMenu) { window.FIceCoreUI.showCallMenu(); } else { frappe.msgprint('Call UI not ready yet'); } return false;"
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
			if (window.FIceCoreUI && window.FIceCoreUI.initiateCall) {
				window.FIceCoreUI.initiateCall(values.user, callType);
			}
			dialog.hide();
		}
	});

	dialog.show();
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		showQuickCallDialog,
		setupKeyboardShortcuts,
		enhanceUserInterface
	};
}