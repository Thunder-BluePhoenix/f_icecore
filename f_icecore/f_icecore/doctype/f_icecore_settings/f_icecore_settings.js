// Copyright (c) 2025, Thunder BluePhoenix and contributors
// For license information, please see license.txt

console.log('🔵 F-IceCore: Loading settings form script...');

frappe.ui.form.on('F IceCore Settings', {
	refresh(frm) {
		console.log('🔵 F-IceCore Settings: Form refresh');

		// Setup button handlers
		setup_button_handlers(frm);

		// Show helpful messages
		show_configuration_warnings(frm);

		// Add quick actions
		add_quick_actions(frm);

		console.log('✅ F-IceCore Settings: Form initialized');
	},

	turn_server(frm) {
		// Auto-format server address (remove protocol if added)
		if (frm.doc.turn_server) {
			const cleaned = frm.doc.turn_server.replace(/^(stun:|turn:|turns:)\/\//, '');
			if (cleaned !== frm.doc.turn_server) {
				console.log('🔵 F-IceCore: Auto-formatting TURN server address');
				frm.set_value('turn_server', cleaned);
			}
		}
	},

	enable_call_history(frm) {
		// Warn if disabling call history
		if (!frm.doc.enable_call_history) {
			frappe.msgprint({
				title: __('Warning'),
				message: __('Disabling call history will prevent storing call records. Existing history will be preserved.'),
				indicator: 'orange'
			});
		}
	},

	max_call_duration(frm) {
		// Show friendly format
		if (frm.doc.max_call_duration > 0) {
			const hours = Math.floor(frm.doc.max_call_duration / 3600);
			const minutes = Math.floor((frm.doc.max_call_duration % 3600) / 60);
			let duration_str = '';

			if (hours > 0) duration_str += `${hours} hour${hours > 1 ? 's' : ''}`;
			if (minutes > 0) {
				if (duration_str) duration_str += ' ';
				duration_str += `${minutes} minute${minutes > 1 ? 's' : ''}`;
			}

			if (duration_str) {
				frm.set_df_property('max_call_duration', 'description',
					`Maximum duration for calls in seconds (0 = unlimited). Current: ${duration_str}`);
			}
		}
	}
});

function setup_button_handlers(frm) {
	console.log('🔵 F-IceCore Settings: Setting up button handlers...');

	// Test Connection Button
	setTimeout(() => {
		const test_btn = frm.fields_dict.test_connection_button;
		if (test_btn && test_btn.$input) {
			console.log('🔵 F-IceCore Settings: Found test_connection_button field');

			// Remove any existing handlers
			test_btn.$input.off('click');

			// Add new handler
			test_btn.$input.on('click', function(e) {
				e.preventDefault();
				console.log('🔵 F-IceCore Settings: Test connection button clicked!');
				test_turn_connection(frm);
			});

			console.log('✅ F-IceCore Settings: Test button handler attached');
		} else {
			console.warn('⚠️ F-IceCore Settings: test_connection_button field not found');
		}
	}, 100);

	// Generate & Populate Credentials Button
	setTimeout(() => {
		const gen_btn = frm.fields_dict.generate_populate_credentials_button;
		if (gen_btn && gen_btn.$input) {
			console.log('🔵 F-IceCore Settings: Found generate_populate_credentials_button field');

			gen_btn.$input.off('click');

			gen_btn.$input.on('click', function(e) {
				e.preventDefault();
				console.log('🔵 F-IceCore Settings: Generate credentials button clicked!');
				generate_and_populate_credentials(frm);
			});

			console.log('✅ F-IceCore Settings: Generate credentials button handler attached');
		} else {
			console.warn('⚠️ F-IceCore Settings: generate_populate_credentials_button field not found');
		}
	}, 100);

	// Save Credentials Button
	setTimeout(() => {
		const save_btn = frm.fields_dict.save_credentials_button;
		if (save_btn && save_btn.$input) {
			console.log('🔵 F-IceCore Settings: Found save_credentials_button field');

			// Remove any existing handlers
			save_btn.$input.off('click');

			// Add new handler
			save_btn.$input.on('click', function(e) {
				e.preventDefault();
				console.log('🔵 F-IceCore Settings: Save credentials button clicked!');
				save_turn_credentials(frm);
			});

			console.log('✅ F-IceCore Settings: Save credentials button handler attached');
		} else {
			console.warn('⚠️ F-IceCore Settings: save_credentials_button field not found');
		}
	}, 100);
}

function show_configuration_warnings(frm) {
	// Show warning if TURN not configured
	if (!frm.doc.turn_server || !frm.doc.turn_secret) {
		frm.dashboard.add_comment(`
			<div class="alert alert-warning">
				<strong>⚠️ TURN Server Not Configured</strong><br>
				Run <code>bash install_scripts/install_coturn.sh</code> to automatically configure your TURN server.<br>
				Or manually enter your TURN server details above and click "Save Credentials".
			</div>
		`, 'blue', true);
	}
}

function add_quick_actions(frm) {
	// View Call History
	frm.add_custom_button(__('View Call History'), () => {
		frappe.set_route('List', 'F IceCore Call Session');
	});

	// Installation Guide
	frm.add_custom_button(__('Installation Guide'), () => {
		window.open('https://github.com/Thunder-BluePhoenix/f_icecore#installation', '_blank');
	}, __('Help'));

	// User Guide
	frm.add_custom_button(__('User Guide'), () => {
		window.open('https://github.com/Thunder-BluePhoenix/f_icecore/blob/main/USER_GUIDE.md', '_blank');
	}, __('Help'));
}

function test_turn_connection(frm) {
	console.log('🔵 F-IceCore Settings: Testing TURN connection...');

	const status_el = $('#turn-connection-status');

	// Check if settings are filled
	if (!frm.doc.turn_server || !frm.doc.turn_secret) {
		status_el.html(`
			<div class="alert alert-warning">
				<i class="fa fa-exclamation-triangle"></i> <strong>Missing Configuration</strong><br>
				Please enter TURN Server and TURN Secret, then save the form before testing.
			</div>
		`);

		frappe.msgprint({
			title: __('Missing Configuration'),
			message: __('Please enter TURN Server and TURN Secret, then save the form before testing.'),
			indicator: 'orange'
		});

		return;
	}

	// Check if form is dirty (unsaved changes)
	if (frm.is_dirty()) {
		status_el.html(`
			<div class="alert alert-warning">
				<i class="fa fa-exclamation-triangle"></i> <strong>Unsaved Changes</strong><br>
				Please save the form first before testing the connection.
			</div>
		`);

		frappe.msgprint({
			title: __('Unsaved Changes'),
			message: __('Please save the form first, then test the connection.'),
			indicator: 'orange',
			primary_action: {
				label: __('Save Now'),
				action: () => {
					frm.save().then(() => {
						// Test after save
						setTimeout(() => test_turn_connection(frm), 500);
					});
				}
			}
		});

		return;
	}

	// Show loading
	status_el.html(`
		<div class="alert alert-info">
			<i class="fa fa-spinner fa-spin"></i> Testing TURN connection...
		</div>
	`);

	frappe.call({
		method: 'f_icecore.f_icecore.api.turn_credentials.test_turn_connection',
		callback: (r) => {
			console.log('🔵 F-IceCore Settings: Test response:', r);

			if (r.message && r.message.success) {
				status_el.html(`
					<div class="alert alert-success">
						<i class="fa fa-check-circle"></i> <strong>TURN Server Connected!</strong><br>
						<strong>Server:</strong> ${r.message.config.server}<br>
						<strong>STUN Port:</strong> ${r.message.config.ports.stun}<br>
						<strong>TURN Port:</strong> ${r.message.config.ports.turn}<br>
						<strong>TURNS Port:</strong> ${r.message.config.ports.turns}
					</div>
				`);

				frappe.show_alert({
					message: __('TURN server is configured correctly'),
					indicator: 'green'
				}, 5);

				console.log('✅ F-IceCore Settings: TURN connection test passed');
			} else {
				const error_msg = r.message ? r.message.message : 'TURN server not configured';
				status_el.html(`
					<div class="alert alert-danger">
						<i class="fa fa-times-circle"></i> <strong>Connection Failed</strong><br>
						${error_msg}<br>
						<small>Run <code>bash install_scripts/install_coturn.sh</code> to set up your TURN server.</small>
					</div>
				`);

				frappe.show_alert({
					message: error_msg,
					indicator: 'red'
				}, 5);

				console.warn('⚠️ F-IceCore Settings: TURN connection test failed:', error_msg);
			}
		},
		error: (err) => {
			console.error('❌ F-IceCore Settings: Error testing connection:', err);

			status_el.html(`
				<div class="alert alert-danger">
					<i class="fa fa-exclamation-triangle"></i> <strong>Error Testing Connection</strong><br>
					${err.message || 'Unknown error occurred'}
				</div>
			`);

			frappe.show_alert({
				message: __('Error testing TURN connection'),
				indicator: 'red'
			}, 5);
		}
	});
}

function save_turn_credentials(frm) {
	console.log('🔵 F-IceCore Settings: Saving TURN credentials...');

	const status_el = $('#credentials-save-status');

	// Validate that server and secret are filled
	if (!frm.doc.turn_server || !frm.doc.turn_secret) {
		status_el.html(`
			<div class="alert alert-warning">
				<i class="fa fa-exclamation-triangle"></i> <strong>Missing Information</strong><br>
				Please enter both TURN Server and TURN Secret before saving.
			</div>
		`);

		frappe.msgprint({
			title: __('Missing Information'),
			message: __('Please enter both TURN Server and TURN Secret before saving.'),
			indicator: 'orange'
		});

		return;
	}

	// Show loading
	status_el.html(`
		<div class="alert alert-info">
			<i class="fa fa-spinner fa-spin"></i> Saving credentials...
		</div>
	`);

	// Save the form
	frm.save().then(() => {
		console.log('✅ F-IceCore Settings: Credentials saved successfully');

		status_el.html(`
			<div class="alert alert-success">
				<i class="fa fa-check-circle"></i> <strong>Credentials Saved Successfully!</strong><br>
				TURN Server: ${frm.doc.turn_server}<br>
				STUN Port: ${frm.doc.stun_port}<br>
				TURN Port: ${frm.doc.turn_port}<br>
				TURNS Port: ${frm.doc.turns_port}<br>
				<small>Settings are now active for all users.</small>
			</div>
		`);

		frappe.show_alert({
			message: __('TURN credentials saved successfully'),
			indicator: 'green'
		}, 5);

		// Automatically test connection after saving
		setTimeout(() => {
			console.log('🔵 F-IceCore Settings: Auto-testing connection after save...');
			test_turn_connection(frm);
		}, 1000);

	}).catch((err) => {
		console.error('❌ F-IceCore Settings: Error saving credentials:', err);

		status_el.html(`
			<div class="alert alert-danger">
				<i class="fa fa-times-circle"></i> <strong>Save Failed</strong><br>
				${err.message || 'Unknown error occurred'}
			</div>
		`);

		frappe.show_alert({
			message: __('Failed to save credentials'),
			indicator: 'red'
		}, 5);
	});
}

function generate_and_populate_credentials(frm) {
	console.log('🔵 F-IceCore Settings: Generating new TURN credentials...');

	const status_el = $('#generate-credentials-status');

	// Confirm with user
	frappe.confirm(
		__('<strong>Are you sure?</strong><br><br>' +
			'This will generate a <strong>new TURN secret</strong> and populate all server fields.<br><br>' +
			'<strong>Important:</strong><br>' +
			'• The secret will be shown <strong>only once</strong> — save it securely.<br>' +
			'• If you have a running Coturn server, you must update <code>/etc/turnserver.conf</code> with the new secret and restart Coturn.<br>' +
			'• Any existing TURN configuration will be overwritten.'),
		() => {
			// User confirmed — proceed
			status_el.html(`
				<div class="alert alert-info">
					<i class="fa fa-spinner fa-spin"></i> Generating new credentials...
				</div>
			`);

			frappe.call({
				method: 'f_icecore.f_icecore.api.turn_credentials.generate_and_populate_credentials',
				callback: (r) => {
					console.log('🔵 F-IceCore Settings: Generate response:', r);

					if (r.message && r.message.success) {
						const data = r.message;

						status_el.html(`
							<div class="alert alert-success">
								<i class="fa fa-check-circle"></i> <strong>Credentials Generated Successfully!</strong>
							</div>
						`);

						// Show the secret in a prominent dialog — one-time only
						const secret_dialog = new frappe.ui.Dialog({
							title: __('TURN Secret Generated — Save Now!'),
							size: 'large',
							fields: [
								{
									fieldtype: 'HTML',
									fieldname: 'secret_html',
									options: `
										<div style="padding: 15px;">
											<div class="alert alert-danger" style="margin-bottom: 15px;">
												<i class="fa fa-exclamation-triangle"></i>
												<strong> WARNING: This secret will NOT be shown again!</strong><br>
												Copy and save it securely. Do not share it with others.
											</div>

											<div style="background: #1a1a2e; color: #0f0; padding: 20px; border-radius: 8px; font-family: monospace; font-size: 14px; margin-bottom: 15px; word-break: break-all; user-select: all;">
												${data.secret}
											</div>

											<div style="margin-bottom: 15px;">
												<button class="btn btn-sm btn-primary" onclick="navigator.clipboard.writeText('${data.secret}').then(() => frappe.show_alert({message: 'Secret copied to clipboard!', indicator: 'green'}, 3))">
													<i class="fa fa-clipboard"></i> Copy Secret
												</button>
											</div>

											<table class="table table-bordered" style="margin-bottom: 15px;">
												<tbody>
													<tr><td><strong>TURN Server</strong></td><td>${data.server}</td></tr>
													<tr><td><strong>STUN Port</strong></td><td>${data.stun_port}</td></tr>
													<tr><td><strong>TURN Port</strong></td><td>${data.turn_port}</td></tr>
													<tr><td><strong>TURNS Port (TLS)</strong></td><td>${data.turns_port}</td></tr>
												</tbody>
											</table>

											<div class="alert alert-warning" style="margin-bottom: 0;">
												<strong>Next Steps:</strong><br>
												1. Copy the secret above and save it somewhere secure.<br>
												2. If Coturn is running, update <code>/etc/turnserver.conf</code>:<br>
												<code style="display:block; margin: 5px 0 5px 15px;">static-auth-secret=${data.secret}</code>
												3. Restart Coturn: <code>sudo systemctl restart coturn</code><br>
												4. Click "Test TURN Connection" below to verify.
											</div>
										</div>
									`
								}
							],
							primary_action_label: __('I Have Saved the Secret'),
							primary_action: () => {
								secret_dialog.hide();
								// Reload the form to show updated values
								frm.reload_doc();
							}
						});

						secret_dialog.show();
						// Prevent closing without confirmation
						secret_dialog.$wrapper.find('.btn-close, .modal-header .close').on('click', function(e) {
							e.preventDefault();
							frappe.confirm(
								__('Are you sure you have saved the secret? It will not be shown again.'),
								() => { secret_dialog.hide(); frm.reload_doc(); }
							);
							return false;
						});

						console.log('✅ F-IceCore Settings: Credentials generated and populated');
					} else {
						const error_msg = r.message ? r.message.message : 'Failed to generate credentials';
						status_el.html(`
							<div class="alert alert-danger">
								<i class="fa fa-times-circle"></i> <strong>Generation Failed</strong><br>
								${error_msg}
							</div>
						`);

						frappe.show_alert({
							message: error_msg,
							indicator: 'red'
						}, 5);
					}
				},
				error: (err) => {
					console.error('❌ F-IceCore Settings: Error generating credentials:', err);

					status_el.html(`
						<div class="alert alert-danger">
							<i class="fa fa-exclamation-triangle"></i> <strong>Error</strong><br>
							${err.message || 'Unknown error occurred'}
						</div>
					`);

					frappe.show_alert({
						message: __('Error generating TURN credentials'),
						indicator: 'red'
					}, 5);
				}
			});
		},
		() => {
			// User cancelled
			console.log('🔵 F-IceCore Settings: Generate credentials cancelled by user');
		}
	);
}

console.log('✅ F-IceCore: Settings form script loaded');
