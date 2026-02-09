/**
 * F-IceCore Call UI v42 - With HTTP Polling Fallback Support
 * Handles incoming call notifications, call dialogs, and UI interactions
 *
 * NEW: Works seamlessly with HTTP polling fallback when SocketIO is disconnected.
 * The WebRTC engine dispatches polled signals to this UI's handlers directly.
 * Added SocketIO connection status indicator in navbar.
 */

class FIceCoreCallUI {
	constructor() {
		console.log('🔵 F-IceCore CallUI: Constructor called');
		this.currentCallWindow = null;
		this.incomingCallDialog = null;
		this.isAudioMuted = false;
		this.isVideoMuted = false;
		this.ringtone = null;
		this.callingTone = null;
		this.pendingCalls = []; // Track pending incoming calls

		console.log('🔵 F-IceCore CallUI: Calling init()...');
		this.init();
		console.log('✅ F-IceCore CallUI: Constructor completed');
	}

	init() {
		console.log('🔵 F-IceCore CallUI: init() started');

		console.log('🔵 F-IceCore CallUI: Setting up incoming call listener...');
		this.setupIncomingCallListener();

		console.log('🔵 F-IceCore CallUI: Setting up call controls...');
		this.setupCallControls();

		console.log('🔵 F-IceCore CallUI: Loading audio assets...');
		this.loadAudioAssets();

		console.log('🔵 F-IceCore CallUI: Requesting notification permission...');
		this.requestNotificationPermission();

		// Add CSS for green dot animation
		this.addGreenDotCSS();

		// Show SocketIO connection status
		this._showSocketStatus();

		console.log('✅ F-IceCore CallUI: init() completed');
	}

	addGreenDotCSS() {
		const style = document.createElement('style');
		style.textContent = `
			@keyframes pulse-green {
				0% {
					transform: scale(1);
					opacity: 1;
					box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.7);
				}
				50% {
					transform: scale(1.2);
					opacity: 0.8;
					box-shadow: 0 0 0 4px rgba(40, 167, 69, 0.3);
				}
				100% {
					transform: scale(1);
					opacity: 1;
					box-shadow: 0 0 0 0 rgba(40, 167, 69, 0);
				}
			}
			@keyframes pulse-orange {
				0% {
					transform: scale(1);
					box-shadow: 0 0 0 0 rgba(255, 165, 0, 0.7);
				}
				50% {
					transform: scale(1.1);
					box-shadow: 0 0 0 3px rgba(255, 165, 0, 0.3);
				}
				100% {
					transform: scale(1);
					box-shadow: 0 0 0 0 rgba(255, 165, 0, 0);
				}
			}

			/* --- Video overlay controls (auto-hide on hover) --- */
			.video-container .video-overlay-controls {
				position: absolute;
				top: 10px;
				right: 10px;
				display: flex;
				gap: 6px;
				opacity: 0;
				transition: opacity 0.3s ease;
				z-index: 20;
			}
			.video-container:hover .video-overlay-controls {
				opacity: 1;
			}
			.video-overlay-controls .overlay-btn {
				background: rgba(0, 0, 0, 0.6);
				color: white;
				border: 1px solid rgba(255, 255, 255, 0.3);
				border-radius: 6px;
				padding: 5px 10px;
				font-size: 12px;
				cursor: pointer;
				backdrop-filter: blur(4px);
				transition: background 0.2s ease, transform 0.15s ease;
				white-space: nowrap;
			}
			.video-overlay-controls .overlay-btn:hover {
				background: rgba(0, 0, 0, 0.85);
				transform: scale(1.05);
			}
			.video-overlay-controls .overlay-btn.active {
				background: rgba(23, 162, 184, 0.8);
				border-color: rgba(23, 162, 184, 0.9);
			}

			/* --- Local video PIP --- */
			#local-video {
				transition: width 0.3s ease, height 0.3s ease, opacity 0.3s ease, bottom 0.3s ease, right 0.3s ease;
			}

			/* PIP minimize button */
			.pip-controls {
				position: absolute;
				bottom: 20px;
				right: 20px;
				z-index: 25;
			}
			.pip-minimize-btn {
				position: absolute;
				top: -8px;
				right: -8px;
				width: 22px;
				height: 22px;
				background: rgba(0, 0, 0, 0.7);
				color: white;
				border: 1px solid rgba(255, 255, 255, 0.4);
				border-radius: 50%;
				font-size: 11px;
				cursor: pointer;
				display: flex;
				align-items: center;
				justify-content: center;
				opacity: 0;
				transition: opacity 0.3s ease;
				z-index: 30;
				line-height: 1;
			}
			.pip-controls:hover .pip-minimize-btn {
				opacity: 1;
			}

			/* PIP hidden state */
			.pip-controls.pip-hidden #local-video {
				width: 0 !important;
				height: 0 !important;
				opacity: 0 !important;
				border: none !important;
			}

			/* Minimized PIP (small circle) */
			.pip-controls.pip-minimized #local-video {
				width: 60px !important;
				height: 45px !important;
				border-radius: 50% !important;
			}

			/* Focused screen mode - expand video container */
			.video-container.focus-mode {
				height: 80vh !important;
			}
			.video-container.focus-mode #remote-video {
				object-fit: contain;
			}

			/* Restore PIP indicator (when PIP is hidden) */
			.pip-restore-btn {
				position: absolute;
				bottom: 15px;
				right: 15px;
				background: rgba(0, 0, 0, 0.5);
				color: white;
				border: 1px solid rgba(255, 255, 255, 0.3);
				border-radius: 6px;
				padding: 4px 8px;
				font-size: 11px;
				cursor: pointer;
				opacity: 0;
				transition: opacity 0.3s ease;
				z-index: 20;
			}
			.video-container:hover .pip-restore-btn {
				opacity: 1;
			}
		`;
		document.head.appendChild(style);
	}

	/**
	 * Show a small indicator near the navbar button showing SocketIO connection status.
	 * Orange dot = using HTTP polling fallback, Green dot = SocketIO connected.
	 */
	_showSocketStatus() {
		// Check and update every 5 seconds
		setInterval(() => {
			this._updateSocketStatusIndicator();
		}, 5000);

		// Initial check after a short delay (let SocketIO try to connect)
		setTimeout(() => {
			this._updateSocketStatusIndicator();
		}, 3000);
	}

	_updateSocketStatusIndicator() {
		const $btn = $('#f-icecore-nav-btn');
		if ($btn.length === 0) return;

		const connected = frappe.socketio?.socket?.connected || false;
		const $link = $btn.find('a');

		// Remove existing status dot
		$link.find('.socket-status-dot').remove();

		if (!connected) {
			// Show orange dot indicating polling mode
			const $dot = $(`
				<span class="socket-status-dot" title="SocketIO disconnected - using HTTP polling" style="
					display: block;
					position: absolute;
					bottom: 2px;
					left: 2px;
					width: 7px;
					height: 7px;
					background-color: #ff9800;
					border-radius: 50%;
					border: 1px solid white;
					animation: pulse-orange 2s infinite;
					z-index: 999;
				"></span>
			`);
			$link.css('position', 'relative');
			$link.append($dot);
		}
	}

	setupIncomingCallListener() {
		console.log('🎧 F-IceCore: Setting up incoming call listener');

		const user = frappe.session.user;
		console.log('🎧 F-IceCore: Current user:', user);
		console.log('🎧 F-IceCore: Socket connected:', frappe.socketio?.socket?.connected);

		// Debug: Listen for ALL events to see what's coming through
		if (frappe.socketio?.socket) {
			const origOnevent = frappe.socketio.socket.onevent;
			frappe.socketio.socket.onevent = function(packet) {
				const eventName = packet.data ? packet.data[0] : 'unknown';
				if (eventName && eventName.includes('f_icecore')) {
					console.log('🔍 F-IceCore RAW socket event:', eventName, packet.data[1]);
				}
				origOnevent.call(this, packet);
			};
			console.log('🔍 F-IceCore: Installed raw socket event interceptor');
		}

		const eventName = 'f_icecore:incoming_call';
		console.log('🎧 F-IceCore: Registering listener for event:', eventName);

		try {
			// Register via frappe.realtime.on (works when SocketIO is connected)
			frappe.realtime.on(eventName, (data) => {
				console.log('🔔🔔🔔 F-IceCore: incoming_call event received (SocketIO)!', data);
				console.log('🔔 to_user:', data.to_user, 'current user:', user);
				this.handleIncomingCall(data);
			});

			console.log('✅ F-IceCore: incoming_call listener registered!');

			// Also register test_ping listener for debugging
			frappe.realtime.on('f_icecore:test_ping', (data) => {
				console.log('🧪🧪🧪 F-IceCore: TEST PING RECEIVED (SocketIO)!', data);
				frappe.show_alert({
					message: `Test ping from ${data.from_user}!`,
					indicator: 'green'
				}, 5);
			});
			console.log('🧪 F-IceCore: test_ping listener registered');

		} catch (error) {
			console.error('❌ F-IceCore: Failed to register listener:', error);
		}

		// Listen for call_accepted (SocketIO path)
		frappe.realtime.on('call_accepted', (data) => {
			console.log('✅ Call accepted (SocketIO):', data);
			if (data.from_user === user) {
				this.stopCallingTone();
				frappe.show_alert({
					message: __('Call accepted! Connecting...'),
					indicator: 'green'
				}, 3);

				// Transition caller from "Calling..." window to actual call window
				const callType = window.FIceCore?.callType || 'audio';
				const callId = data.call_id;
				const remoteUser = data.accepted_by || data.to_user;
				console.log('📞 Switching to call window for caller. Remote:', remoteUser, 'Type:', callType);
				this.showCallWindow(remoteUser, callType, callId, true);
			}
			this.removePendingCall(data.call_id);
		});

		// Listen for call_rejected (SocketIO path)
		frappe.realtime.on('call_rejected', (data) => {
			console.log('❌ Call rejected (SocketIO):', data);
			if (data.from_user === user) {
				this.stopCallingTone();
				if (this.currentCallWindow) {
					this.currentCallWindow.hide();
					this.currentCallWindow = null;
				}
				frappe.show_alert({
					message: __('Call was declined'),
					indicator: 'red'
				}, 5);
			}
			this.removePendingCall(data.call_id);
		});

		// Listen for call_ended (SocketIO path)
		frappe.realtime.on('call_ended', (data) => {
			console.log('📵 Call ended (SocketIO):', data);
			this.handleCallEnded();
			this.removePendingCall(data.call_id);
		});

		console.log('✅ F-IceCore: All call listeners registered');

		// Note: When SocketIO is disconnected, the WebRTC engine's HTTP polling
		// will call handleIncomingCall(), handleCallEnded(), etc. directly.
		// No additional setup is needed here for the polling fallback.
		if (!frappe.socketio?.socket?.connected) {
			console.log('⚠️ F-IceCore CallUI: SocketIO not connected. Incoming calls will be received via HTTP polling (handled by WebRTC engine).');
		}
	}

	handleIncomingCall(data) {
		console.log('🔔 Handling incoming call:', data);

		// Deduplicate - don't show dialog for a call we already know about
		const existing = this.pendingCalls.find(c => c.call_id === data.call_id);
		if (existing) {
			console.log('⚠️ Call already in pending list, skipping duplicate');
			return;
		}

		// Add to pending calls
		this.addPendingCall(data);

		// Play ringtone
		this.playRingtone();

		// Show desktop notification
		const callTypeText = data.call_type.charAt(0).toUpperCase() + data.call_type.slice(1);
		this.showDesktopNotification(data.from_user_name, callTypeText, true);

		// ALWAYS show popup dialog immediately so user can accept/decline
		console.log('📞 Showing incoming call popup dialog');
		this.updateNavbarNotification();
		this.showIncomingCallDialog(data);
	}

	updateNavbarNotification() {
		const $btn = $('#f-icecore-nav-btn');
		if ($btn.length === 0) {
			console.warn('⚠️ Navbar button not found');
			return;
		}

		// Remove existing badge and green dot
		$btn.find('.badge, .green-notification-dot').remove();

		// Add green notification dot and badge for pending calls
		if (this.pendingCalls.length > 0) {
			const $link = $btn.find('a');
			$link.css('position', 'relative');

			// Add green pulsing dot
			const $greenDot = $(`
				<span class="green-notification-dot" style="
					display: block;
					position: absolute;
					top: 2px;
					right: 2px;
					width: 10px;
					height: 10px;
					background-color: #28a745;
					border-radius: 50%;
					border: 2px solid white;
					animation: pulse-green 2s infinite;
					z-index: 1000;
				"></span>
			`);

			// Also add count badge
			const $badge = $(`
				<span class="badge" style="
					position: absolute;
					top: -5px;
					right: -5px;
					background-color: #ff4444;
					color: white;
					border-radius: 10px;
					padding: 2px 6px;
					font-size: 11px;
					font-weight: bold;
					z-index: 1001;
				">${this.pendingCalls.length}</span>
			`);

			$link.append($greenDot);
			$link.append($badge);

			console.log('💚 Updated navbar with green dot and badge:', this.pendingCalls.length);
		}
	}

	setupCallControls() {
		// Setup will be done when call window is shown
	}

	loadAudioAssets() {
		// Create audio context for call tones
		this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
		console.log('✅ Audio context created for call tones');
	}

	requestNotificationPermission() {
		if ('Notification' in window && Notification.permission === 'default') {
			Notification.requestPermission();
		}
	}

	showIncomingCallDialog(callData) {
		console.log('🔔 showIncomingCallDialog called with:', callData);

		const { call_id, from_user, from_user_name, call_type, is_urgent } = callData;
		const isUrgent = is_urgent === true || is_urgent === 1;

		const callTypeIcon = call_type === 'video' ? '📹' : (call_type === 'screen' ? '🖥️' : '📞');
		const callTypeText = call_type.charAt(0).toUpperCase() + call_type.slice(1);

		console.log('🔔 Showing incoming call dialog for:', from_user_name);

		// Show desktop notification
		this.showDesktopNotification(from_user_name, callTypeText, isUrgent);

		// Close any existing incoming call dialog
		if (this.incomingCallDialog) {
			this.incomingCallDialog.hide();
		}

		this.incomingCallDialog = new frappe.ui.Dialog({
			title: isUrgent ? `🚨 URGENT - ${callTypeIcon} ${__('Incoming')} ${__(callTypeText)} ${__('Call')}` : `${callTypeIcon} ${__('Incoming')} ${__(callTypeText)} ${__('Call')}`,
			static: true,
			minimizable: false,
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'incoming_call_content'
				}
			]
		});

		this.incomingCallDialog.show();

		// Set content after dialog is shown
		setTimeout(() => {
			const $content = this.incomingCallDialog.fields_dict.incoming_call_content.$wrapper;
			$content.html(`
				<div class="f-icecore-incoming-call" style="text-align: center; padding: 30px;">
					<div class="caller-avatar" style="margin-bottom: 20px; display: flex; justify-content: center;">
						<div id="incoming-avatar-container"></div>
					</div>
					<h3 style="margin-bottom: 10px;">${isUrgent ? '🚨 ' : ''}${from_user_name}</h3>
					<p style="color: #888; margin-bottom: 30px; font-size: 18px;">
						${callTypeIcon} ${__(callTypeText)} Call
					</p>
					<div class="call-actions" style="display: flex; justify-content: center; gap: 20px;">
						<button class="btn btn-success btn-lg" id="f-icecore-accept-btn">
							<i class="fa fa-phone"></i> ${__('Accept')}
						</button>
						<button class="btn btn-danger btn-lg" id="f-icecore-decline-btn">
							<i class="fa fa-phone-slash"></i> ${__('Decline')}
						</button>
					</div>
				</div>
			`);

			// Attach click handlers (avoids quote escaping issues in onclick)
			$content.find('#f-icecore-accept-btn').on('click', () => {
				window.FIceCoreUI.acceptCall(call_id, from_user, call_type);
			});
			$content.find('#f-icecore-decline-btn').on('click', () => {
				window.FIceCoreUI.rejectCall(call_id);
			});

			// Render avatar using Frappe's avatar function
			const avatarContainer = document.getElementById('incoming-avatar-container');
			if (avatarContainer) {
				const avatarHtml = frappe.avatar(from_user, 'avatar-large');
				avatarContainer.innerHTML = avatarHtml;
			}
		}, 50);

		// Bring window to focus
		window.focus();
	}

	showDesktopNotification(fromUserName, callType, isUrgent) {
		if ('Notification' in window && Notification.permission === 'granted') {
			const urgentPrefix = isUrgent ? '🚨 URGENT: ' : '';
			const notification = new Notification(`${urgentPrefix}Incoming ${callType} Call`, {
				body: `${fromUserName} is calling you`,
				icon: '/assets/frappe/images/frappe-framework-logo.png',
				tag: 'f-icecore-call',
				requireInteraction: isUrgent,
				vibrate: isUrgent ? [200, 100, 200, 100, 200] : [200, 100, 200]
			});

			notification.onclick = () => {
				window.focus();
				notification.close();
			};

			setTimeout(() => notification.close(), isUrgent ? 60000 : 30000);
		}
	}

	async acceptCall(callId, fromUser, callType) {
		try {
			console.log('✅ User clicked ACCEPT button!');
			console.log('   - Call ID:', callId);
			console.log('   - From user:', fromUser);
			console.log('   - Call type:', callType);

			// Close incoming call dialog
			if (this.incomingCallDialog) {
				this.incomingCallDialog.hide();
			}

			// Stop ringtone
			this.stopRingtone();

			// Remove from pending calls
			this.removePendingCall(callId);

			// Request microphone/camera permission FIRST for the recipient too
			console.log('🎤 Requesting media permission for recipient...');
			const hasPermission = await window.FIceCore.requestMediaPermission(callType);
			if (!hasPermission) {
				console.warn('⚠️ Media permission denied for recipient, proceeding anyway (one-way audio)');
			}

			// Accept call in backend
			const response = await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.accept_call',
				args: { call_id: callId }
			});

			console.log('✅ Backend accepted the call');

			// Show call window
			this.showCallWindow(fromUser, callType, callId, false);

			// Answer the call via WebRTC engine
			console.log('📞 Calling window.FIceCore.answerCall()...');
			await window.FIceCore.answerCall(fromUser, callType, callId);

			// Update presence
			await this.updatePresence('in_call', { call_id: callId });

			console.log('✅ Call accepted and connected!');

		} catch (error) {
			console.error('❌ Failed to accept call:', error);
			frappe.msgprint(__('Failed to accept call'));
		}
	}

	async rejectCall(callId) {
		try {
			console.log('❌ User clicked REJECT button');
			console.log('   - Call ID:', callId);

			if (this.incomingCallDialog) {
				this.incomingCallDialog.hide();
			}

			this.stopRingtone();
			this.removePendingCall(callId);

			await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.reject_call',
				args: { call_id: callId, reason: 'User declined' }
			});

			console.log('✅ Call rejected');

		} catch (error) {
			console.error('❌ Failed to reject call:', error);
		}
	}

	showCallWindow(remoteUser, callType, callId, isCaller) {
		const userName = frappe.boot.user_info[remoteUser]?.fullname || remoteUser;
		const callTypeIcon = callType === 'video' ? '📹' : (callType === 'screen' ? '🖥️' : '📞');
		const hasVideo = callType === 'video' || callType === 'screen';

		console.log('📱 Showing call window:', {
			remoteUser,
			callType,
			callId,
			isCaller,
			hasVideo
		});

		// Close any existing window
		if (this.currentCallWindow) {
			this.currentCallWindow.hide();
		}

		this.currentCallWindow = new frappe.ui.Dialog({
			title: `${callTypeIcon} ${__('Call with')} ${userName}`,
			size: 'extra-large',
			static: true,
			minimizable: false,
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'call_window_content'
				}
			],
			on_hide: () => {
				// If call is still active, show a hint to the user
				if (window.FIceCore?.peerConnection && window.FIceCore?.callId) {
					frappe.show_alert({
						message: __('Call is still active. Click the phone icon to reopen.'),
						indicator: 'blue'
					}, 5);
				}
			}
		});

		this.currentCallWindow.show();

		setTimeout(() => {
			const $content = this.currentCallWindow.fields_dict.call_window_content.$wrapper;

			let contentHtml = `
				<div class="f-icecore-call-window" style="padding: 20px;">
			`;

			if (hasVideo) {
				contentHtml += `
					<div class="video-container" style="position: relative; background: #000; border-radius: 8px; overflow: hidden; height: 500px;">
						<video id="remote-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>

						<!-- PIP container with minimize button -->
						<div class="pip-controls">
							<button class="pip-minimize-btn" id="pip-minimize-btn" title="Minimize">&#8722;</button>
							<video id="local-video" autoplay playsinline muted style="width: 200px; height: 150px; object-fit: cover; border: 3px solid white; border-radius: 8px;"></video>
						</div>

						<!-- Overlay controls (appear on hover) -->
						<div class="video-overlay-controls">
							<button class="overlay-btn" id="overlay-focus-btn" title="View screen only (expand)">
								<i class="fa fa-expand"></i> Focus
							</button>
							<button class="overlay-btn" id="overlay-toggle-pip-btn" title="Show/hide your video">
								<i class="fa fa-picture-o"></i> Hide PIP
							</button>
						</div>

						<!-- Restore PIP button (shown when PIP hidden) -->
						<button class="pip-restore-btn" id="pip-restore-btn" style="display:none;">
							<i class="fa fa-picture-o"></i> Show My Video
						</button>

						<div style="position: absolute; top: 15px; left: 15px; color: white; text-shadow: 0 1px 3px rgba(0,0,0,0.8); z-index: 10;">
							<span id="call-status" style="font-size: 14px;">Connecting...</span>
							<span id="call-duration" style="font-size: 14px; margin-left: 10px;">00:00</span>
						</div>
					</div>
				`;
			} else {
				contentHtml += `
					<div class="audio-call-info" style="text-align: center; padding: 60px 20px;">
						<div style="margin-bottom: 30px;">
							${frappe.avatar(remoteUser, 'avatar-xxlarge')}
						</div>
						<h2 style="margin-bottom: 15px;">${userName}</h2>
						<p id="call-status" style="color: #888; font-size: 18px; margin-bottom: 10px;">Connecting...</p>
						<p id="call-duration" style="font-size: 24px; font-weight: bold; color: #333;">00:00</p>
					</div>
				`;
			}

			contentHtml += `
					<div class="call-controls" style="text-align: center; margin-top: 30px; display: flex; justify-content: center; gap: 15px; flex-wrap: wrap;">
						<button class="btn btn-secondary btn-lg" id="toggle-audio-btn">
							<i class="fa fa-microphone"></i> ${__('Mute')}
						</button>
			`;

			if (hasVideo) {
				contentHtml += `
						<button class="btn btn-secondary btn-lg" id="toggle-video-btn">
							<i class="fa fa-video-camera"></i> ${__('Stop Video')}
						</button>
				`;
			}

			contentHtml += `
						<button class="btn btn-info btn-lg" id="toggle-screen-share-btn" title="${__('Share your screen during this call')}">
							<i class="fa fa-desktop"></i> ${__('Share Screen')}
						</button>
						<button class="btn btn-secondary btn-lg" id="toggle-record-btn" title="${__('Record this call')}">
							<i class="fa fa-circle" style="color: #dc3545;"></i> ${__('Record')}
						</button>
						<button class="btn btn-secondary btn-lg" id="transfer-call-btn" title="${__('Transfer this call to another user')}">
							<i class="fa fa-exchange"></i> ${__('Transfer')}
						</button>
						<button class="btn btn-primary btn-lg" id="add-participant-btn" title="${__('Add another person to this call')}">
							<i class="fa fa-user-plus"></i> ${__('Add')}
						</button>
						<button class="btn btn-danger btn-lg" id="f-icecore-hangup-btn">
							<i class="fa fa-phone" style="transform: rotate(135deg);"></i> ${__('End Call')}
						</button>
					</div>
				</div>
			`;

			$content.html(contentHtml);

			// Attach click handlers via jQuery (no inline onclick)
			$content.find('#toggle-audio-btn').on('click', () => {
				window.FIceCoreUI.toggleAudio();
			});
			if (hasVideo) {
				$content.find('#toggle-video-btn').on('click', () => {
					window.FIceCoreUI.toggleVideo();
				});
			}
			$content.find('#toggle-screen-share-btn').on('click', () => {
				window.FIceCoreUI.toggleScreenShare();
			});
			$content.find('#toggle-record-btn').on('click', () => {
				window.FIceCoreUI.toggleRecording();
			});
			$content.find('#transfer-call-btn').on('click', () => {
				window.FIceCoreUI.showTransferDialog(callId, remoteUser, callType);
			});
			$content.find('#f-icecore-hangup-btn').on('click', () => {
				window.FIceCoreUI.hangup();
			});
			$content.find('#add-participant-btn').on('click', () => {
				window.FIceCoreUI.showAddParticipantDialog(callId, remoteUser, callType);
			});

			// Store current 1:1 call context for add-participant
			this._current1to1CallId = callId;
			this._current1to1CallType = callType;
			this._current1to1RemoteUser = remoteUser;

			// Video overlay controls (focus screen, toggle PIP)
			$content.find('#overlay-focus-btn').on('click', () => {
				window.FIceCoreUI.toggleFocusMode();
			});
			$content.find('#overlay-toggle-pip-btn').on('click', () => {
				window.FIceCoreUI.togglePIP();
			});
			$content.find('#pip-minimize-btn').on('click', () => {
				window.FIceCoreUI.minimizePIP();
			});
			$content.find('#pip-restore-btn').on('click', () => {
				window.FIceCoreUI.restorePIP();
			});

			// Timer will be started by webrtc_engine when connection state reaches 'connected'

			// Reactively attach streams
			this._streamAttachAttempts = 0;
			this._streamAttachInterval = setInterval(() => {
				this._streamAttachAttempts++;
				let localAttached = false;
				let remoteAttached = false;

				if (window.FIceCore) {
					if (window.FIceCore.localStream) {
						window.FIceCore.attachLocalStream();
						localAttached = true;
					}

					if (window.FIceCore.remoteStream) {
						window.FIceCore.attachRemoteStream();
						remoteAttached = true;
					}
				}

				if ((localAttached && remoteAttached) || this._streamAttachAttempts > 120) {
					clearInterval(this._streamAttachInterval);
					this._streamAttachInterval = null;
					if (localAttached && remoteAttached) {
						console.log('✅ Both local and remote streams attached successfully');
					} else {
						console.warn('⚠️ Stream attach timeout. Local:', localAttached, 'Remote:', remoteAttached);
					}
				}
			}, 500);

		}, 100);
	}

	showCallingWindow(targetUser, callType, callId) {
		const userName = frappe.boot.user_info[targetUser]?.fullname || targetUser;
		const callTypeIcon = callType === 'video' ? '📹' : (callType === 'screen' ? '🖥️' : '📞');

		console.log('📞 Showing calling window for:', userName);

		this._currentCallingCallId = callId;

		this.currentCallWindow = new frappe.ui.Dialog({
			title: `${callTypeIcon} ${__('Calling')} ${userName}...`,
			static: true,
			minimizable: false,
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'calling_content'
				}
			]
		});

		this.currentCallWindow.show();

		setTimeout(() => {
			const $content = this.currentCallWindow.fields_dict.calling_content.$wrapper;
			$content.html(`
				<div style="text-align: center; padding: 40px;">
					<div style="margin-bottom: 30px;">
						${frappe.avatar(targetUser, 'avatar-xlarge')}
					</div>
					<h2 style="margin-bottom: 10px;">${userName}</h2>
					<p style="color: #888; font-size: 18px;">${__('Calling')}...</p>
					<div style="margin-top: 40px;">
						<button class="btn btn-danger btn-lg" id="f-icecore-cancel-call-btn">
							<i class="fa fa-phone-slash"></i> ${__('Cancel')}
						</button>
					</div>
				</div>
			`);
			$content.find('#f-icecore-cancel-call-btn').on('click', () => {
				window.FIceCoreUI.cancelCall(callId);
			});
		}, 50);
	}

	async cancelCall(callId) {
		try {
			console.log('❌ Cancelling call...');

			this.stopCallingTone();

			if (this._streamAttachInterval) {
				clearInterval(this._streamAttachInterval);
				this._streamAttachInterval = null;
			}

			if (this.currentCallWindow) {
				this.currentCallWindow.hide();
				this.currentCallWindow = null;
			}

			if (window.FIceCore && typeof window.FIceCore.endCall === 'function') {
				await window.FIceCore.endCall();
			}

			await this.updatePresence('online');

			console.log('✅ Call cancelled');

		} catch (error) {
			console.error('Failed to cancel call:', error);
		}
	}

	async hangup() {
		try {
			console.log('📞 Hanging up call...');

			this.stopRingtone();
			this.stopCallingTone();
			this.stopDurationTimer();

			if (this._streamAttachInterval) {
				clearInterval(this._streamAttachInterval);
				this._streamAttachInterval = null;
			}

			if (this.currentCallWindow) {
				this.currentCallWindow.hide();
				this.currentCallWindow = null;
			}

			if (window.FIceCore && typeof window.FIceCore.endCall === 'function') {
				await window.FIceCore.endCall();
			}

			await this.updatePresence('online');

			console.log('✅ Call ended');

		} catch (error) {
			console.error('Failed to hang up:', error);
		}
	}

	handleCallEnded() {
		console.log('📵 Handling call ended');

		this.stopRingtone();
		this.stopCallingTone();
		this.stopDurationTimer();

		if (this._streamAttachInterval) {
			clearInterval(this._streamAttachInterval);
			this._streamAttachInterval = null;
		}

		if (this.incomingCallDialog) {
			this.incomingCallDialog.hide();
			this.incomingCallDialog = null;
		}

		if (this.currentCallWindow) {
			this.currentCallWindow.hide();
			this.currentCallWindow = null;
		}
	}

	startDurationTimer() {
		// Prevent duplicate timers
		if (this.durationInterval) {
			console.log('⏱️ Timer already running, skipping');
			return;
		}

		const durationEl = document.getElementById('call-duration');
		if (!durationEl) {
			console.log('⏱️ call-duration element not found, retrying in 500ms...');
			setTimeout(() => this.startDurationTimer(), 500);
			return;
		}

		console.log('⏱️ Starting call duration timer');
		let seconds = 0;
		this.durationInterval = setInterval(() => {
			seconds++;
			const minutes = Math.floor(seconds / 60);
			const secs = seconds % 60;
			durationEl.textContent = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
		}, 1000);
	}

	stopDurationTimer() {
		if (this.durationInterval) {
			clearInterval(this.durationInterval);
			this.durationInterval = null;
		}
	}

	toggleAudio() {
		if (!window.FIceCore || !window.FIceCore.localStream) {
			console.warn('⚠️ No local stream available');
			return;
		}

		const audioTrack = window.FIceCore.localStream.getAudioTracks()[0];
		if (audioTrack) {
			audioTrack.enabled = !audioTrack.enabled;
			this.isAudioMuted = !audioTrack.enabled;

			const btn = document.getElementById('toggle-audio-btn');
			if (btn) {
				btn.innerHTML = this.isAudioMuted ?
					'<i class="fa fa-microphone-slash"></i> Unmute' :
					'<i class="fa fa-microphone"></i> Mute';
			}

			console.log('🎤 Audio', this.isAudioMuted ? 'muted' : 'unmuted');
		}
	}

	toggleVideo() {
		if (!window.FIceCore || !window.FIceCore.localStream) {
			console.warn('⚠️ No local stream available');
			return;
		}

		const videoTrack = window.FIceCore.localStream.getVideoTracks()[0];
		if (videoTrack) {
			videoTrack.enabled = !videoTrack.enabled;
			this.isVideoMuted = !videoTrack.enabled;

			const btn = document.getElementById('toggle-video-btn');
			if (btn) {
				btn.innerHTML = this.isVideoMuted ?
					'<i class="fa fa-video-camera"></i> Start Video' :
					'<i class="fa fa-video-camera"></i> Stop Video';
			}

			console.log('📹 Video', this.isVideoMuted ? 'stopped' : 'started');
		}
	}

	async toggleScreenShare() {
		if (!window.FIceCore) {
			console.warn('⚠️ WebRTC engine not available');
			return;
		}

		const btn = document.getElementById('toggle-screen-share-btn');
		if (btn) {
			btn.disabled = true; // Prevent double-clicks while processing
		}

		try {
			const isNowSharing = await window.FIceCore.toggleScreenShare();
			this._updateScreenShareButton(isNowSharing);

			if (isNowSharing) {
				console.log('🖥️ Screen sharing started');
				frappe.show_alert({
					message: __('Screen sharing started'),
					indicator: 'green'
				}, 3);

				// If this was an audio-only call, show video container for the screen share
				this._ensureVideoContainerForScreenShare();
			} else {
				console.log('🖥️ Screen sharing stopped');
				frappe.show_alert({
					message: __('Screen sharing stopped'),
					indicator: 'blue'
				}, 3);
			}
		} catch (error) {
			console.error('❌ Screen share toggle failed:', error);
		} finally {
			if (btn) {
				btn.disabled = false;
			}
		}
	}

	/**
	 * Update the screen share button appearance based on active state.
	 * Also called by WebRTC engine when user stops sharing via browser UI.
	 */
	_updateScreenShareButton(isSharing) {
		const btn = document.getElementById('toggle-screen-share-btn');
		if (!btn) return;

		if (isSharing) {
			btn.className = 'btn btn-warning btn-lg';
			btn.innerHTML = '<i class="fa fa-desktop"></i> ' + __('Stop Sharing');
			btn.title = __('Stop sharing your screen');
		} else {
			btn.className = 'btn btn-info btn-lg';
			btn.innerHTML = '<i class="fa fa-desktop"></i> ' + __('Share Screen');
			btn.title = __('Share your screen during this call');
		}
	}

	/**
	 * Toggle screen sharing for group calls.
	 * Uses the group WebRTC engine which handles multiple peer connections.
	 */
	async toggleGroupScreenShare() {
		if (!window.FIceCoreGroup) {
			console.warn('⚠️ Group WebRTC engine not available');
			return;
		}

		const btn = document.getElementById('group-toggle-screen-share-btn');
		if (btn) {
			btn.disabled = true;
		}

		try {
			const isNowSharing = await window.FIceCoreGroup.toggleScreenShare();
			this._updateGroupScreenShareButton(isNowSharing);

			if (isNowSharing) {
				console.log('🖥️ [Group] Screen sharing started');
				frappe.show_alert({
					message: __('Screen sharing started'),
					indicator: 'green'
				}, 3);
			} else {
				console.log('🖥️ [Group] Screen sharing stopped');
				frappe.show_alert({
					message: __('Screen sharing stopped'),
					indicator: 'blue'
				}, 3);
			}
		} catch (error) {
			console.error('❌ [Group] Screen share toggle failed:', error);
		} finally {
			if (btn) {
				btn.disabled = false;
			}
		}
	}

	/**
	 * Update the group screen share button appearance.
	 * Also called by group WebRTC engine when user stops sharing via browser UI.
	 */
	_updateGroupScreenShareButton(isSharing) {
		const btn = document.getElementById('group-toggle-screen-share-btn');
		if (!btn) return;

		if (isSharing) {
			btn.className = 'btn btn-warning btn-lg';
			btn.innerHTML = '<i class="fa fa-desktop"></i> ' + __('Stop Sharing');
			btn.title = __('Stop sharing your screen');
		} else {
			btn.className = 'btn btn-info btn-lg';
			btn.innerHTML = '<i class="fa fa-desktop"></i> ' + __('Share Screen');
			btn.title = __('Share your screen during this call');
		}
	}

	// ============================================================
	// Video view controls: Focus mode, PIP toggle, PIP minimize
	// ============================================================

	/**
	 * Toggle focus mode: expand the video container to show only the shared screen.
	 * Hides local PIP and enlarges the remote video for maximum visibility.
	 */
	toggleFocusMode() {
		const container = document.querySelector('.video-container');
		if (!container) return;

		const btn = document.getElementById('overlay-focus-btn');
		const isFocused = container.classList.toggle('focus-mode');

		if (isFocused) {
			// Also hide PIP when focusing
			this._setPIPState('hidden');
			if (btn) {
				btn.classList.add('active');
				btn.innerHTML = '<i class="fa fa-compress"></i> Normal';
				btn.title = 'Return to normal view';
			}
			console.log('🖥️ Focus mode ON — full screen view');
		} else {
			// Restore PIP when leaving focus
			this._setPIPState('visible');
			if (btn) {
				btn.classList.remove('active');
				btn.innerHTML = '<i class="fa fa-expand"></i> Focus';
				btn.title = 'View screen only (expand)';
			}
			console.log('🖥️ Focus mode OFF — normal view');
		}
	}

	/**
	 * Toggle local video PIP visibility (show/hide).
	 */
	togglePIP() {
		const pipControls = document.querySelector('.pip-controls');
		if (!pipControls) return;

		const isHidden = pipControls.classList.contains('pip-hidden');
		if (isHidden) {
			this._setPIPState('visible');
		} else {
			this._setPIPState('hidden');
		}
	}

	/**
	 * Minimize PIP to a small thumbnail, or restore if already minimized/hidden.
	 */
	minimizePIP() {
		const pipControls = document.querySelector('.pip-controls');
		if (!pipControls) return;

		const isMinimized = pipControls.classList.contains('pip-minimized');
		const isHidden = pipControls.classList.contains('pip-hidden');

		if (isMinimized || isHidden) {
			this._setPIPState('visible');
		} else {
			this._setPIPState('minimized');
		}
	}

	/**
	 * Restore PIP from hidden or minimized state.
	 */
	restorePIP() {
		this._setPIPState('visible');
	}

	/**
	 * Set PIP state: 'visible', 'hidden', or 'minimized'.
	 * Updates all related UI elements.
	 */
	_setPIPState(state) {
		const pipControls = document.querySelector('.pip-controls');
		const toggleBtn = document.getElementById('overlay-toggle-pip-btn');
		const restoreBtn = document.getElementById('pip-restore-btn');
		const minimizeBtn = document.getElementById('pip-minimize-btn');

		if (!pipControls) return;

		// Clear all states
		pipControls.classList.remove('pip-hidden', 'pip-minimized');

		switch (state) {
			case 'hidden':
				pipControls.classList.add('pip-hidden');
				if (toggleBtn) {
					toggleBtn.innerHTML = '<i class="fa fa-picture-o"></i> Show PIP';
					toggleBtn.title = 'Show your video';
				}
				if (restoreBtn) restoreBtn.style.display = 'block';
				if (minimizeBtn) minimizeBtn.title = 'Show';
				console.log('📹 PIP hidden');
				break;

			case 'minimized':
				pipControls.classList.add('pip-minimized');
				if (toggleBtn) {
					toggleBtn.innerHTML = '<i class="fa fa-picture-o"></i> Show PIP';
					toggleBtn.title = 'Show your video';
				}
				if (restoreBtn) restoreBtn.style.display = 'none';
				if (minimizeBtn) minimizeBtn.title = 'Restore';
				console.log('📹 PIP minimized');
				break;

			case 'visible':
			default:
				if (toggleBtn) {
					toggleBtn.innerHTML = '<i class="fa fa-picture-o"></i> Hide PIP';
					toggleBtn.title = 'Hide your video';
				}
				if (restoreBtn) restoreBtn.style.display = 'none';
				if (minimizeBtn) minimizeBtn.title = 'Minimize';
				console.log('📹 PIP visible');
				break;
		}
	}

	/**
	 * For audio-only calls, dynamically add a video container when screen sharing starts.
	 * This creates the remote-video and local-video elements so the shared screen is visible.
	 */
	_ensureVideoContainerForScreenShare() {
		// If video elements already exist, nothing to do
		if (document.getElementById('remote-video') || document.getElementById('local-video')) {
			return;
		}

		// Find the call window content area
		if (!this.currentCallWindow) return;

		const $content = this.currentCallWindow.$wrapper.find('.f-icecore-call-window');
		if ($content.length === 0) return;

		// Insert video container before the audio-call-info section
		const $audioInfo = $content.find('.audio-call-info');
		if ($audioInfo.length > 0) {
			const videoHtml = `
				<div class="video-container screen-share-container" style="position: relative; background: #000; border-radius: 8px; overflow: hidden; height: 400px; margin-bottom: 15px;">
					<video id="remote-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>

					<!-- PIP container with minimize button -->
					<div class="pip-controls">
						<button class="pip-minimize-btn" id="pip-minimize-btn" title="Minimize">&#8722;</button>
						<video id="local-video" autoplay playsinline muted style="width: 180px; height: 135px; object-fit: contain; border: 2px solid white; border-radius: 6px; background: #222;"></video>
					</div>

					<!-- Overlay controls (appear on hover) -->
					<div class="video-overlay-controls">
						<button class="overlay-btn" id="overlay-focus-btn" title="View screen only (expand)">
							<i class="fa fa-expand"></i> Focus
						</button>
						<button class="overlay-btn" id="overlay-toggle-pip-btn" title="Show/hide your video">
							<i class="fa fa-picture-o"></i> Hide PIP
						</button>
					</div>

					<!-- Restore PIP button (shown when PIP hidden) -->
					<button class="pip-restore-btn" id="pip-restore-btn" style="display:none;">
						<i class="fa fa-picture-o"></i> Show My Video
					</button>
				</div>
			`;
			$audioInfo.before(videoHtml);
			console.log('🖥️ Added video container for screen share in audio call');

			// Bind overlay control events
			const $container = $content.find('.video-container');
			$container.find('#overlay-focus-btn').on('click', () => {
				window.FIceCoreUI.toggleFocusMode();
			});
			$container.find('#overlay-toggle-pip-btn').on('click', () => {
				window.FIceCoreUI.togglePIP();
			});
			$container.find('#pip-minimize-btn').on('click', () => {
				window.FIceCoreUI.minimizePIP();
			});
			$container.find('#pip-restore-btn').on('click', () => {
				window.FIceCoreUI.restorePIP();
			});

			// Attach streams to the new elements
			if (window.FIceCore) {
				window.FIceCore.attachLocalStream();
				window.FIceCore.attachRemoteStream();
			}
		}
	}

	playRingtone() {
		console.log('🔔 Playing ringtone');
		this.ringtoneInterval = setInterval(() => {
			this.playBeep(800, 0.3, 0.2);
		}, 2000);
	}

	stopRingtone() {
		console.log('🔇 Stopped ringtone');
		if (this.ringtoneInterval) {
			clearInterval(this.ringtoneInterval);
			this.ringtoneInterval = null;
		}
	}

	playCallingTone() {
		console.log('📞 Playing calling tone');
		this.callingToneInterval = setInterval(() => {
			this.playBeep(440, 0.2, 0.2);
		}, 3000);
	}

	stopCallingTone() {
		console.log('🔇 Stopped calling tone');
		if (this.callingToneInterval) {
			clearInterval(this.callingToneInterval);
			this.callingToneInterval = null;
		}
	}

	playBeep(frequency, duration, volume) {
		try {
			const oscillator = this.audioContext.createOscillator();
			const gainNode = this.audioContext.createGain();

			oscillator.connect(gainNode);
			gainNode.connect(this.audioContext.destination);

			gainNode.gain.value = volume;
			oscillator.frequency.value = frequency;
			oscillator.type = 'sine';

			oscillator.start(this.audioContext.currentTime);
			oscillator.stop(this.audioContext.currentTime + duration);
		} catch (e) {
			// AudioContext may not be available or may be suspended
			console.warn('⚠️ playBeep failed:', e.message);
		}
	}

	getPendingCalls() {
		return this.pendingCalls || [];
	}

	addPendingCall(callData) {
		const existingIndex = this.pendingCalls.findIndex(c => c.call_id === callData.call_id);
		if (existingIndex === -1) {
			this.pendingCalls.push(callData);
			console.log('📋 Added to pending calls. Total:', this.pendingCalls.length);
			this.updateNavbarNotification();
		}
	}

	removePendingCall(callId) {
		const index = this.pendingCalls.findIndex(c => c.call_id === callId);
		if (index !== -1) {
			this.pendingCalls.splice(index, 1);
			console.log('📋 Removed from pending calls. Remaining:', this.pendingCalls.length);
			this.updateNavbarNotification();
		}
	}

	acceptCallFromNotification(callId, fromUser, callType) {
		this.acceptCall(callId, fromUser, callType);
	}

	rejectCallFromNotification(callId) {
		this.rejectCall(callId);
	}

	showCallMenu() {
		console.log('📞 showCallMenu called (deprecated)');
		frappe.msgprint(__('Please use the phone icon in the navbar to make calls'));
	}

	// ============================================================
	// Group Call UI Methods
	// ============================================================

	/**
	 * Handle incoming group call notification.
	 * Shows a dialog with initiator info and participant list.
	 */
	handleIncomingGroupCall(data) {
		console.log('🔔 [Group UI] Incoming group call:', data);

		const { group_call_id, initiator, initiator_name, call_type, participants } = data;

		// Deduplicate
		if (this._currentGroupCallNotification === group_call_id) {
			return;
		}
		this._currentGroupCallNotification = group_call_id;

		// Play ringtone
		this.playRingtone();

		// Desktop notification
		const callTypeText = call_type === 'video' ? 'Video' : 'Audio';
		this.showDesktopNotification(initiator_name, `Group ${callTypeText}`, false);

		const callTypeIcon = call_type === 'video' ? '📹' : '📞';
		const participantNames = participants.map(p => {
			const info = frappe.boot.user_info[p];
			return info ? info.fullname : p;
		});

		// Close existing incoming dialog
		if (this.incomingCallDialog) {
			this.incomingCallDialog.hide();
		}

		this.incomingCallDialog = new frappe.ui.Dialog({
			title: `${callTypeIcon} ${__('Incoming Group')} ${__(callTypeText)} ${__('Call')}`,
			static: true,
			minimizable: false,
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'group_call_content'
				}
			]
		});

		this.incomingCallDialog.show();

		setTimeout(() => {
			const $content = this.incomingCallDialog.fields_dict.group_call_content.$wrapper;
			$content.html(`
				<div style="text-align: center; padding: 30px;">
					<div style="margin-bottom: 20px; display: flex; justify-content: center;">
						${frappe.avatar(initiator, 'avatar-large')}
					</div>
					<h3 style="margin-bottom: 10px;">${initiator_name}</h3>
					<p style="color: #888; margin-bottom: 15px; font-size: 16px;">
						${callTypeIcon} Group ${callTypeText} Call
					</p>
					<div style="margin-bottom: 25px;">
						<p style="font-size: 13px; color: #666; margin-bottom: 8px;">${__('Participants')}:</p>
						<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 6px;">
							${participantNames.map(name => `<span style="background: #f0f0f0; padding: 4px 10px; border-radius: 12px; font-size: 12px;">${name}</span>`).join('')}
						</div>
					</div>
					<div style="display: flex; justify-content: center; gap: 20px;">
						<button class="btn btn-success btn-lg" id="f-icecore-group-accept-btn">
							<i class="fa fa-phone"></i> ${__('Join')}
						</button>
						<button class="btn btn-danger btn-lg" id="f-icecore-group-decline-btn">
							<i class="fa fa-phone-slash"></i> ${__('Decline')}
						</button>
					</div>
				</div>
			`);

			$content.find('#f-icecore-group-accept-btn').on('click', () => {
				this.acceptGroupCall(group_call_id, call_type, participants);
			});
			$content.find('#f-icecore-group-decline-btn').on('click', () => {
				this.rejectGroupCall(group_call_id);
			});
		}, 50);

		window.focus();
	}

	/**
	 * Accept and join a group call.
	 */
	async acceptGroupCall(groupCallId, callType, participants) {
		try {
			console.log('✅ [Group UI] Accepting group call:', groupCallId);

			// Close incoming dialog
			if (this.incomingCallDialog) {
				this.incomingCallDialog.hide();
				this.incomingCallDialog = null;
			}
			this.stopRingtone();
			this._currentGroupCallNotification = null;

			// Request media permission
			if (window.FIceCore) {
				await window.FIceCore.requestMediaPermission(callType);
			}

			// Show group call window
			this.showGroupCallWindow(groupCallId, callType, participants);

			// Join via group WebRTC engine
			if (window.FIceCoreGroup) {
				await window.FIceCoreGroup.joinGroupCall(groupCallId, callType);
			}

			console.log('✅ [Group UI] Joined group call');

		} catch (error) {
			console.error('❌ [Group UI] Failed to accept group call:', error);
			frappe.msgprint(__('Failed to join group call'));
		}
	}

	/**
	 * Reject a group call invitation.
	 */
	async rejectGroupCall(groupCallId) {
		try {
			console.log('❌ [Group UI] Rejecting group call:', groupCallId);

			if (this.incomingCallDialog) {
				this.incomingCallDialog.hide();
				this.incomingCallDialog = null;
			}
			this.stopRingtone();
			this._currentGroupCallNotification = null;

			await frappe.call({
				method: 'f_icecore.f_icecore.api.group_signaling.reject_group_call',
				args: { group_call_id: groupCallId }
			});

		} catch (error) {
			console.error('❌ [Group UI] Failed to reject group call:', error);
		}
	}

	/**
	 * Show the group call window with video grid and controls.
	 */
	showGroupCallWindow(groupCallId, callType, participants) {
		const hasVideo = callType === 'video';
		const callTypeIcon = hasVideo ? '📹' : '📞';
		const currentUser = frappe.session.user;

		console.log('📱 [Group UI] Showing group call window:', { groupCallId, callType, participants });

		// Close existing windows
		if (this.currentCallWindow) {
			this.currentCallWindow.hide();
		}

		this._groupCallId = groupCallId;
		this._groupParticipants = new Set(participants);

		this.currentCallWindow = new frappe.ui.Dialog({
			title: `${callTypeIcon} ${__('Group Call')} — ${participants.length} ${__('participants')}`,
			size: 'extra-large',
			static: true,
			minimizable: false,
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'group_call_content'
				}
			],
			on_hide: () => {
				// If group call is still active, show a hint
				if (window.FIceCoreGroup?.isInGroupCall) {
					frappe.show_alert({
						message: __('Group call is still active. Click the phone icon to reopen.'),
						indicator: 'blue'
					}, 5);
				}
			}
		});

		this.currentCallWindow.show();

		setTimeout(() => {
			const $content = this.currentCallWindow.fields_dict.group_call_content.$wrapper;

			const participantCount = participants.length;
			const gridClass = `participants-${Math.min(participantCount, 5)}`;

			let tilesHtml = '';
			for (const user of participants) {
				if (user === currentUser) continue;  // Skip self, we show as local PIP
				const userName = frappe.boot.user_info[user]?.fullname || user;
				tilesHtml += `
					<div class="f-ic-participant-tile" id="group-tile-${user.replace(/[@.]/g, '-')}" data-user="${user}">
						<video autoplay playsinline class="participant-video" id="group-video-${user.replace(/[@.]/g, '-')}" style="width:100%; height:100%; object-fit:cover; display:none;"></video>
						<div class="participant-avatar" id="group-avatar-${user.replace(/[@.]/g, '-')}">
							${frappe.avatar(user, 'avatar-large')}
						</div>
						<div class="participant-label">${userName}</div>
						<div class="participant-status-dot connecting" id="group-status-${user.replace(/[@.]/g, '-')}"></div>
					</div>
				`;
			}

			let contentHtml = `
				<div class="f-icecore-group-call-window" style="padding: 15px;">
					<div class="f-ic-group-video-grid ${gridClass}" id="group-video-grid">
						${tilesHtml}
					</div>

					<!-- Local PIP -->
					<div style="position: relative; margin-top: 10px; display: flex; align-items: center; gap: 15px;">
						<div style="position: relative; width: 120px; height: 90px; background: #222; border-radius: 8px; overflow: hidden; border: 2px solid #28a745; flex-shrink: 0;">
							<video id="group-local-video" autoplay playsinline muted style="width:100%; height:100%; object-fit:cover;"></video>
						</div>
						<div>
							<span style="font-size: 13px; color: #666;">${__('You')}</span>
							<span id="group-call-status" style="font-size: 13px; margin-left: 10px; color: #888;">Connecting...</span>
							<span id="group-call-duration" style="font-size: 14px; margin-left: 10px; font-weight: bold;">00:00</span>
						</div>
					</div>

					<!-- Controls -->
					<div class="call-controls" style="text-align: center; margin-top: 20px; display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
						<button class="btn btn-secondary btn-lg" id="group-toggle-audio-btn">
							<i class="fa fa-microphone"></i> ${__('Mute')}
						</button>
			`;

			if (hasVideo) {
				contentHtml += `
						<button class="btn btn-secondary btn-lg" id="group-toggle-video-btn">
							<i class="fa fa-video-camera"></i> ${__('Stop Video')}
						</button>
				`;
			}

			contentHtml += `
						<button class="btn btn-info btn-lg" id="group-toggle-screen-share-btn" title="${__('Share your screen during this call')}">
							<i class="fa fa-desktop"></i> ${__('Share Screen')}
						</button>
						<button class="btn btn-primary btn-lg" id="group-add-participant-btn" title="${__('Add another person to this call')}">
							<i class="fa fa-user-plus"></i> ${__('Add')}
						</button>
						<button class="btn btn-danger btn-lg" id="group-hangup-btn">
							<i class="fa fa-phone" style="transform: rotate(135deg);"></i> ${__('Leave Call')}
						</button>
					</div>
				</div>
			`;

			$content.html(contentHtml);

			// Bind control events
			$content.find('#group-toggle-audio-btn').on('click', () => {
				this._groupToggleAudio();
			});
			if (hasVideo) {
				$content.find('#group-toggle-video-btn').on('click', () => {
					this._groupToggleVideo();
				});
			}
			$content.find('#group-toggle-screen-share-btn').on('click', () => {
				this.toggleGroupScreenShare();
			});
			$content.find('#group-hangup-btn').on('click', () => {
				this.hangupGroupCall();
			});
			$content.find('#group-add-participant-btn').on('click', () => {
				this.showAddParticipantDialog(null, null, callType);
			});

			// Attach local stream
			this._groupAttachLocalStream();

			// Start duration timer
			this._groupStartDurationTimer();

			// Wire up group engine callbacks
			this._wireGroupCallbacks();

		}, 100);
	}

	/**
	 * Wire up callbacks from the group WebRTC engine to update UI.
	 */
	_wireGroupCallbacks() {
		if (!window.FIceCoreGroup) return;

		window.FIceCoreGroup.onParticipantStream = (userId, stream) => {
			this._attachGroupRemoteStream(userId, stream);
		};

		window.FIceCoreGroup.onParticipantJoined = (userId, userName) => {
			this.addParticipantTile(userId, userName);
		};

		window.FIceCoreGroup.onParticipantLeft = (userId) => {
			this.removeParticipantTile(userId);
		};

		window.FIceCoreGroup.onGroupCallEnded = () => {
			this._handleGroupCallEndedUI();
		};
	}

	/**
	 * Add a new participant tile dynamically (when someone joins mid-call).
	 */
	addParticipantTile(userId, userName) {
		const grid = document.getElementById('group-video-grid');
		if (!grid) return;

		const safeId = userId.replace(/[@.]/g, '-');

		// Check if tile already exists
		if (document.getElementById(`group-tile-${safeId}`)) {
			return;
		}

		const tileHtml = `
			<div class="f-ic-participant-tile" id="group-tile-${safeId}" data-user="${userId}">
				<video autoplay playsinline class="participant-video" id="group-video-${safeId}" style="width:100%; height:100%; object-fit:cover; display:none;"></video>
				<div class="participant-avatar" id="group-avatar-${safeId}">
					${frappe.avatar(userId, 'avatar-large')}
				</div>
				<div class="participant-label">${userName}</div>
				<div class="participant-status-dot connecting" id="group-status-${safeId}"></div>
			</div>
		`;

		grid.insertAdjacentHTML('beforeend', tileHtml);

		// Update grid class for layout
		const tileCount = grid.querySelectorAll('.f-ic-participant-tile').length;
		grid.className = `f-ic-group-video-grid participants-${Math.min(tileCount + 1, 5)}`;

		// Update dialog title
		if (this.currentCallWindow) {
			this._groupParticipants.add(userId);
			this.currentCallWindow.set_title(
				`${this.callType === 'video' ? '📹' : '📞'} ${__('Group Call')} — ${this._groupParticipants.size} ${__('participants')}`
			);
		}

		console.log(`👋 [Group UI] Added tile for ${userId}`);
	}

	/**
	 * Remove a participant tile when they leave.
	 */
	removeParticipantTile(userId) {
		const safeId = userId.replace(/[@.]/g, '-');
		const tile = document.getElementById(`group-tile-${safeId}`);
		if (tile) {
			tile.remove();
		}

		// Update grid class
		const grid = document.getElementById('group-video-grid');
		if (grid) {
			const tileCount = grid.querySelectorAll('.f-ic-participant-tile').length;
			grid.className = `f-ic-group-video-grid participants-${Math.min(tileCount + 1, 5)}`;
		}

		// Update dialog title
		if (this.currentCallWindow) {
			this._groupParticipants.delete(userId);
			this.currentCallWindow.set_title(
				`${this.callType === 'video' ? '📹' : '📞'} ${__('Group Call')} — ${this._groupParticipants.size} ${__('participants')}`
			);
		}

		const userName = frappe.boot.user_info[userId]?.fullname || userId;
		frappe.show_alert({
			message: `${userName} ${__('left the call')}`,
			indicator: 'orange'
		}, 3);

		console.log(`👋 [Group UI] Removed tile for ${userId}`);
	}

	/**
	 * Attach a remote stream to a participant's video element.
	 */
	_attachGroupRemoteStream(userId, stream) {
		const safeId = userId.replace(/[@.]/g, '-');
		let videoEl = document.getElementById(`group-video-${safeId}`);
		const avatarEl = document.getElementById(`group-avatar-${safeId}`);
		const statusDot = document.getElementById(`group-status-${safeId}`);

		// If tile doesn't exist yet (timing issue), create it dynamically
		if (!videoEl) {
			const grid = document.getElementById('group-video-grid');
			if (grid && !document.getElementById(`group-tile-${safeId}`)) {
				const userName = frappe.boot.user_info[userId]?.fullname || userId;
				this.addParticipantTile(userId, userName);
				videoEl = document.getElementById(`group-video-${safeId}`);
			}
		}

		if (videoEl) {
			// Force srcObject reassignment to kick video rendering
			videoEl.srcObject = null;
			videoEl.srcObject = stream;

			// Check if stream has video tracks
			const hasVideoTrack = stream.getVideoTracks().some(t => t.readyState === 'live');
			if (hasVideoTrack) {
				videoEl.style.display = 'block';
				if (avatarEl) avatarEl.style.display = 'none';
			} else {
				// Audio only — keep avatar visible, but still attach for audio
				videoEl.style.display = 'none';
				if (avatarEl) avatarEl.style.display = '';
			}

			// Ensure video plays
			videoEl.play().catch(e => console.warn(`⚠️ [Group UI] Video play failed for ${userId}:`, e.message));

			console.log(`📡 [Group UI] Attached remote stream to ${userId} (video: ${stream.getVideoTracks().length}, audio: ${stream.getAudioTracks().length})`);
		}

		if (statusDot) {
			statusDot.classList.remove('connecting');
			statusDot.classList.add('connected');
		}

		// Update call status
		const statusEl = document.getElementById('group-call-status');
		if (statusEl) {
			statusEl.textContent = 'Connected';
			statusEl.style.color = '#28a745';
		}
	}

	/**
	 * Attach local stream to the local PIP video in group call.
	 */
	_groupAttachLocalStream() {
		const localVideo = document.getElementById('group-local-video');
		if (localVideo && window.FIceCoreGroup?.localStream) {
			localVideo.srcObject = window.FIceCoreGroup.localStream;
			localVideo.play().catch(e => console.warn('⚠️ [Group UI] Local video play failed:', e.message));
			console.log('✅ [Group UI] Attached local stream to group PIP');
		}

		// Retry if stream not ready yet (up to 10 retries)
		if (!this._groupLocalStreamRetries) this._groupLocalStreamRetries = 0;
		if (!window.FIceCoreGroup?.localStream && this._groupLocalStreamRetries < 10) {
			this._groupLocalStreamRetries++;
			setTimeout(() => this._groupAttachLocalStream(), 500);
		} else {
			this._groupLocalStreamRetries = 0;
		}
	}

	/**
	 * Toggle audio in group call.
	 */
	_groupToggleAudio() {
		if (!window.FIceCoreGroup?.localStream) return;

		const audioTrack = window.FIceCoreGroup.localStream.getAudioTracks()[0];
		if (audioTrack) {
			audioTrack.enabled = !audioTrack.enabled;
			const muted = !audioTrack.enabled;

			const btn = document.getElementById('group-toggle-audio-btn');
			if (btn) {
				btn.innerHTML = muted
					? '<i class="fa fa-microphone-slash"></i> ' + __('Unmute')
					: '<i class="fa fa-microphone"></i> ' + __('Mute');
			}
		}
	}

	/**
	 * Toggle video in group call.
	 */
	_groupToggleVideo() {
		if (!window.FIceCoreGroup?.localStream) return;

		const videoTrack = window.FIceCoreGroup.localStream.getVideoTracks()[0];
		if (videoTrack) {
			videoTrack.enabled = !videoTrack.enabled;
			const muted = !videoTrack.enabled;

			const btn = document.getElementById('group-toggle-video-btn');
			if (btn) {
				btn.innerHTML = muted
					? '<i class="fa fa-video-camera"></i> ' + __('Start Video')
					: '<i class="fa fa-video-camera"></i> ' + __('Stop Video');
			}
		}
	}

	/**
	 * Leave the group call.
	 */
	async hangupGroupCall() {
		console.log('📞 [Group UI] Hanging up group call');

		this._groupStopDurationTimer();

		if (this.currentCallWindow) {
			this.currentCallWindow.hide();
			this.currentCallWindow = null;
		}

		if (window.FIceCoreGroup) {
			await window.FIceCoreGroup.leaveGroupCall();
		}

		this._groupCallId = null;
		this._groupParticipants = null;
	}

	/**
	 * Handle group call ended notification in UI.
	 */
	_handleGroupCallEndedUI() {
		console.log('📵 [Group UI] Group call ended');

		this._groupStopDurationTimer();

		if (this.currentCallWindow) {
			this.currentCallWindow.hide();
			this.currentCallWindow = null;
		}

		frappe.show_alert({
			message: __('Group call ended'),
			indicator: 'blue'
		}, 5);
	}

	/**
	 * Start the group call duration timer.
	 */
	_groupStartDurationTimer() {
		if (this._groupDurationInterval) return;

		let seconds = 0;
		this._groupDurationInterval = setInterval(() => {
			seconds++;
			const minutes = Math.floor(seconds / 60);
			const secs = seconds % 60;
			const el = document.getElementById('group-call-duration');
			if (el) {
				el.textContent = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
			}
		}, 1000);
	}

	/**
	 * Stop the group call duration timer.
	 */
	_groupStopDurationTimer() {
		if (this._groupDurationInterval) {
			clearInterval(this._groupDurationInterval);
			this._groupDurationInterval = null;
		}
	}

	// ============================================================
	// Add Participant Mid-Call (search + invite dialog)
	// ============================================================

	/**
	 * Show a dialog to search for and add a new participant mid-call.
	 * Works for both 1:1 calls (upgrades to group) and existing group calls.
	 *
	 * @param {string|null} callId - The 1:1 call ID (null if already a group call)
	 * @param {string|null} remoteUser - The other user in 1:1 call (null if group)
	 * @param {string} callType - 'audio' or 'video'
	 */
	showAddParticipantDialog(callId, remoteUser, callType) {
		console.log('👥 [Add Participant] Opening dialog', { callId, remoteUser, callType });

		const isGroupCall = !callId && this._groupCallId;
		const _addState = { query: '', results: [], debounceTimer: null };

		const addDialog = new frappe.ui.Dialog({
			title: `<i class="fa fa-user-plus"></i> ${__('Add Participant')}`,
			size: 'small',
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'add_participant_content'
				}
			]
		});

		addDialog.show();

		setTimeout(() => {
			const $content = addDialog.fields_dict.add_participant_content.$wrapper;
			$content.html(`
				<div style="padding: 10px;">
					<div class="f-ic-search-container" style="margin-bottom: 15px;">
						<input type="text" id="add-participant-search" class="form-control"
							placeholder="${__('Search by name, email, or phone...')}"
							autocomplete="off" />
					</div>
					<div id="add-participant-results" style="max-height: 300px; overflow-y: auto;">
						<p style="text-align: center; color: #888; padding: 20px;">${__('Type to search for users...')}</p>
					</div>
				</div>
			`);

			// Search with debounce
			$content.find('#add-participant-search').on('input', (e) => {
				const query = e.target.value.trim();
				_addState.query = query;
				clearTimeout(_addState.debounceTimer);
				_addState.debounceTimer = setTimeout(() => {
					this._searchUsersForAddParticipant(query, $content, addDialog, callId, remoteUser, callType, isGroupCall);
				}, 300);
			});

			// Focus search input
			$content.find('#add-participant-search').focus();
		}, 100);
	}

	/**
	 * Search users and render results for the add-participant dialog.
	 */
	async _searchUsersForAddParticipant(query, $content, addDialog, callId, remoteUser, callType, isGroupCall) {
		if (!query || query.length < 1) {
			$content.find('#add-participant-results').html(
				`<p style="text-align: center; color: #888; padding: 20px;">${__('Type to search for users...')}</p>`
			);
			return;
		}

		try {
			const response = await frappe.call({
				method: 'f_icecore.f_icecore.api.presence.search_users',
				args: { query: query, page: 1, page_size: 8 }
			});

			const data = response.message;
			const users = data.users || [];

			if (users.length === 0) {
				$content.find('#add-participant-results').html(
					`<p style="text-align: center; color: #888; padding: 20px;">${__('No users found')}</p>`
				);
				return;
			}

			// Filter out users already in the call
			const currentUser = frappe.session.user;
			let excludeUsers = [currentUser];
			if (remoteUser) excludeUsers.push(remoteUser);
			if (isGroupCall && this._groupParticipants) {
				excludeUsers = [...excludeUsers, ...Array.from(this._groupParticipants)];
			}

			const filteredUsers = users.filter(u => !excludeUsers.includes(u.user));

			if (filteredUsers.length === 0) {
				$content.find('#add-participant-results').html(
					`<p style="text-align: center; color: #888; padding: 20px;">${__('No new users to add')}</p>`
				);
				return;
			}

			let html = '';
			for (const user of filteredUsers) {
				const statusColor = user.status === 'online' ? '#28a745' : (user.status === 'in_call' ? '#ffc107' : '#ccc');
				const statusText = user.status === 'online' ? 'Online' : (user.status === 'in_call' ? 'In Call' : 'Offline');
				html += `
					<div class="f-icecore-user-card add-participant-user" data-user="${user.user}" style="cursor: pointer; padding: 10px 12px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 10px; transition: background 0.2s;">
						<div style="flex-shrink: 0;">
							${frappe.avatar(user.user, 'avatar-medium')}
						</div>
						<div style="flex: 1; min-width: 0;">
							<div style="font-weight: 600; font-size: 13px;">${user.full_name}</div>
							<div style="font-size: 11px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${user.user}</div>
						</div>
						<div style="flex-shrink: 0; display: flex; align-items: center; gap: 6px;">
							<span style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; display: inline-block;"></span>
							<span style="font-size: 11px; color: #888;">${statusText}</span>
						</div>
					</div>
				`;
			}

			$content.find('#add-participant-results').html(html);

			// Click handler for each user
			$content.find('.add-participant-user').on('click', async (e) => {
				const selectedUser = $(e.currentTarget).data('user');
				console.log('👥 [Add Participant] Selected:', selectedUser);

				// Disable the card to prevent double-clicks
				$(e.currentTarget).css({ opacity: 0.5, pointerEvents: 'none' });
				$(e.currentTarget).append(' <i class="fa fa-spinner fa-spin"></i>');

				try {
					if (isGroupCall) {
						// Already a group call — just add participant
						await this._addParticipantToGroupCall(this._groupCallId, selectedUser);
					} else {
						// Upgrade 1:1 → group call
						await this._upgradeToGroupCall(callId, selectedUser, callType);
					}
					addDialog.hide();
				} catch (err) {
					console.error('❌ [Add Participant] Failed:', err);
					$(e.currentTarget).css({ opacity: 1, pointerEvents: 'auto' });
					$(e.currentTarget).find('.fa-spinner').remove();
					frappe.show_alert({ message: __('Failed to add participant'), indicator: 'red' }, 5);
				}
			});

			// Hover effect
			$content.find('.add-participant-user').hover(
				function() { $(this).css('background', '#f8f9fa'); },
				function() { $(this).css('background', ''); }
			);

		} catch (error) {
			console.error('❌ [Add Participant] Search failed:', error);
		}
	}

	/**
	 * Add a participant to an existing group call.
	 */
	async _addParticipantToGroupCall(groupCallId, newUser) {
		console.log('👥 [Add Participant] Adding to group call:', groupCallId, newUser);

		const response = await frappe.call({
			method: 'f_icecore.f_icecore.api.group_signaling.add_participant_to_group_call',
			args: {
				group_call_id: groupCallId,
				new_user: newUser
			}
		});

		const result = response.message;
		if (!result.success) {
			frappe.show_alert({ message: result.message, indicator: 'orange' }, 5);
			return;
		}

		const userName = frappe.boot.user_info[newUser]?.fullname || newUser;
		frappe.show_alert({
			message: `${__('Invitation sent to')} ${userName}`,
			indicator: 'green'
		}, 3);
	}

	/**
	 * Upgrade a 1:1 call to a group call by adding a third participant.
	 * Ends the current 1:1 call and creates a new group call.
	 */
	async _upgradeToGroupCall(callId, newUser, callType) {
		console.log('🔄 [Upgrade] Converting 1:1 call to group call:', callId, newUser);

		// End the current 1:1 WebRTC connection
		if (window.FIceCore) {
			// Stop local streams but don't call endCall() which would notify the server
			// The server-side upgrade API handles ending the old call
			if (window.FIceCore.peerConnection) {
				window.FIceCore.peerConnection.close();
				window.FIceCore.peerConnection = null;
			}
			if (window.FIceCore.localStream) {
				window.FIceCore.localStream.getTracks().forEach(t => t.stop());
				window.FIceCore.localStream = null;
			}
			window.FIceCore.remoteStream = null;
			window.FIceCore.callId = null;
			window.FIceCore.remoteUser = null;
		}

		// Remove hidden audio element
		const remoteAudio = document.getElementById('remote-audio');
		if (remoteAudio) {
			remoteAudio.srcObject = null;
			remoteAudio.remove();
		}

		// Stop duration timer
		this.stopDurationTimer();

		// Close 1:1 call window
		if (this.currentCallWindow) {
			this.currentCallWindow.hide();
			this.currentCallWindow = null;
		}

		// Call backend to upgrade
		const response = await frappe.call({
			method: 'f_icecore.f_icecore.api.group_signaling.upgrade_to_group_call',
			args: {
				current_call_id: callId,
				new_user: newUser,
				call_type: callType
			}
		});

		const result = response.message;
		if (!result.success) {
			frappe.show_alert({ message: __('Failed to upgrade call'), indicator: 'red' }, 5);
			return;
		}

		const groupCallId = result.group_call_id;
		const participants = result.participants;

		console.log('✅ [Upgrade] Group call created:', groupCallId);

		// Show group call window and start group WebRTC
		this.showGroupCallWindow(groupCallId, callType, participants);

		if (window.FIceCoreGroup) {
			// The initiator of the upgrade uses startGroupCall-like flow
			// but the group call is already created, so we just join it
			window.FIceCoreGroup.groupCallId = groupCallId;
			window.FIceCoreGroup.callType = callType;
			window.FIceCoreGroup.isInitiator = true;
			window.FIceCoreGroup.isInGroupCall = true;

			// Get local media
			await window.FIceCoreGroup._getLocalMedia(callType);

			// Mark self as connected (already done by backend)
			// Wait for others to join — they'll trigger handleParticipantJoined
		}

		frappe.show_alert({
			message: __('Call upgraded to group call'),
			indicator: 'green'
		}, 3);
	}

	/**
	 * Handle the upgrade_to_group_call event (received by the other user in the 1:1 call).
	 * This user needs to: end 1:1, join the new group call.
	 */
	async handleUpgradeToGroupCall(data) {
		console.log('🔄 [Upgrade] Received upgrade notification:', data);

		const { group_call_id, old_call_id, call_type, participants, initiator_name } = data;

		// End the current 1:1 call
		this.stopDurationTimer();
		this.stopRingtone();
		this.stopCallingTone();

		if (window.FIceCore) {
			if (window.FIceCore.peerConnection) {
				window.FIceCore.peerConnection.close();
				window.FIceCore.peerConnection = null;
			}
			if (window.FIceCore.localStream) {
				window.FIceCore.localStream.getTracks().forEach(t => t.stop());
				window.FIceCore.localStream = null;
			}
			window.FIceCore.remoteStream = null;
			window.FIceCore.callId = null;
			window.FIceCore.remoteUser = null;
		}

		const remoteAudio = document.getElementById('remote-audio');
		if (remoteAudio) {
			remoteAudio.srcObject = null;
			remoteAudio.remove();
		}

		if (this.currentCallWindow) {
			this.currentCallWindow.hide();
			this.currentCallWindow = null;
		}

		frappe.show_alert({
			message: `${initiator_name} ${__('added a participant. Switching to group call...')}`,
			indicator: 'blue'
		}, 5);

		// Show group call window and join
		this.showGroupCallWindow(group_call_id, call_type, participants);

		if (window.FIceCoreGroup) {
			await window.FIceCoreGroup.joinGroupCall(group_call_id, call_type);
		}
	}

	async initiateCall(targetUser, callType = 'audio') {
		try {
			console.log('📞 Initiating call to:', targetUser, 'Type:', callType);

			if (targetUser === frappe.session.user) {
				frappe.msgprint(__('Cannot call yourself'));
				return;
			}

			// Request microphone/camera permission FIRST
			console.log('🎤 Requesting media permission before call...');
			const hasPermission = await window.FIceCore.requestMediaPermission(callType);
			if (!hasPermission) {
				console.log('❌ Media permission denied, aborting call');
				return;
			}
			console.log('✅ Media permission granted, proceeding with call');

			// Check if user is online
			const presence = await this.getUserPresence(targetUser);
			if (presence.status === 'offline') {
				frappe.msgprint(__('User is offline'));
				return;
			}

			if (presence.status === 'in_call') {
				frappe.msgprint(__('User is already in a call'));
				return;
			}

			// Create call session
			const response = await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.initiate_call',
				args: {
					to_user: targetUser,
					call_type: callType
				}
			});

			if (!response.message.success) {
				frappe.msgprint(response.message.message);
				return;
			}

			const callSession = response.message.call_session;

			// Show calling window
			this.showCallingWindow(targetUser, callType, callSession.name);

			// Start WebRTC call
			await window.FIceCore.startCall(targetUser, callType, callSession.name);

			// Play calling tone
			this.playCallingTone();

			// Update presence
			await this.updatePresence('in_call', { call_id: callSession.name });

			console.log('✅ Call initiated successfully');

		} catch (error) {
			console.error('Failed to initiate call:', error);
			this.stopCallingTone();
			if (this.currentCallWindow) {
				this.currentCallWindow.hide();
				this.currentCallWindow = null;
			}
			frappe.msgprint(__('Failed to initiate call'));
		}
	}

	async getUserPresence(user) {
		const response = await frappe.call({
			method: 'f_icecore.f_icecore.api.presence.get_user_presence',
			args: { user: user }
		});
		return response.message || { status: 'offline' };
	}

	async updatePresence(status, metadata) {
		try {
			await frappe.call({
				method: 'f_icecore.f_icecore.api.presence.update_presence',
				args: {
					status: status,
					metadata: metadata ? JSON.stringify(metadata) : null
				}
			});
		} catch (error) {
			console.error('Failed to update presence:', error);
		}
	}

	// ============================================================
	// Call Recording UI
	// ============================================================

	/**
	 * Toggle call recording on/off.
	 */
	async toggleRecording() {
		if (!window.FIceCore) {
			console.warn('WebRTC engine not available');
			return;
		}

		const btn = document.getElementById('toggle-record-btn');
		if (btn) btn.disabled = true;

		try {
			if (window.FIceCore.isRecording()) {
				await window.FIceCore.stopRecording();
				this._updateRecordButton(false);
				frappe.show_alert({
					message: __('Recording stopped. File is being saved...'),
					indicator: 'blue'
				}, 5);
			} else {
				const started = await window.FIceCore.startRecording();
				if (started) {
					this._updateRecordButton(true);
					frappe.show_alert({
						message: __('Recording started'),
						indicator: 'red'
					}, 3);
				} else {
					frappe.show_alert({
						message: __('Failed to start recording'),
						indicator: 'red'
					}, 5);
				}
			}
		} catch (error) {
			console.error('Recording toggle failed:', error);
		} finally {
			if (btn) btn.disabled = false;
		}
	}

	/**
	 * Update the record button appearance.
	 */
	_updateRecordButton(isRecording) {
		const btn = document.getElementById('toggle-record-btn');
		if (!btn) return;

		if (isRecording) {
			btn.className = 'btn btn-danger btn-lg';
			btn.innerHTML = '<i class="fa fa-stop-circle"></i> ' + __('Stop Rec');
			btn.title = __('Stop recording');
		} else {
			btn.className = 'btn btn-secondary btn-lg';
			btn.innerHTML = '<i class="fa fa-circle" style="color: #dc3545;"></i> ' + __('Record');
			btn.title = __('Record this call');
		}
	}

	// ============================================================
	// Call Transfer UI
	// ============================================================

	/**
	 * Show the transfer dialog where user can search for a transfer target.
	 */
	showTransferDialog(callId, remoteUser, callType) {
		console.log('Transfer: Opening transfer dialog', { callId, remoteUser, callType });

		const _transferState = { query: '', debounceTimer: null };

		const transferDialog = new frappe.ui.Dialog({
			title: `<i class="fa fa-exchange"></i> ${__('Transfer Call')}`,
			size: 'small',
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'transfer_content'
				}
			]
		});

		transferDialog.show();

		setTimeout(() => {
			const $content = transferDialog.fields_dict.transfer_content.$wrapper;
			$content.html(`
				<div style="padding: 10px;">
					<div style="margin-bottom: 15px;">
						<p style="font-size: 12px; color: #888; margin-bottom: 10px;">
							${__('Search for a user to transfer this call to. The other party will be connected to the selected user.')}
						</p>
					</div>
					<div class="f-ic-search-container" style="margin-bottom: 15px;">
						<input type="text" id="transfer-search" class="form-control"
							placeholder="${__('Search by name, email, or phone...')}"
							autocomplete="off" />
					</div>
					<div id="transfer-results" style="max-height: 300px; overflow-y: auto;">
						<p style="text-align: center; color: #888; padding: 20px;">${__('Type to search for users...')}</p>
					</div>
				</div>
			`);

			// Search with debounce
			$content.find('#transfer-search').on('input', (e) => {
				const query = e.target.value.trim();
				_transferState.query = query;
				clearTimeout(_transferState.debounceTimer);
				_transferState.debounceTimer = setTimeout(() => {
					this._searchUsersForTransfer(query, $content, transferDialog, callId, remoteUser, callType);
				}, 300);
			});

			$content.find('#transfer-search').focus();
		}, 100);
	}

	/**
	 * Search users for transfer target.
	 */
	async _searchUsersForTransfer(query, $content, transferDialog, callId, remoteUser, callType) {
		if (!query || query.length < 1) {
			$content.find('#transfer-results').html(
				`<p style="text-align: center; color: #888; padding: 20px;">${__('Type to search for users...')}</p>`
			);
			return;
		}

		try {
			const response = await frappe.call({
				method: 'f_icecore.f_icecore.api.presence.search_users',
				args: { query: query, page: 1, page_size: 8 }
			});

			const data = response.message;
			const users = data.users || [];

			if (users.length === 0) {
				$content.find('#transfer-results').html(
					`<p style="text-align: center; color: #888; padding: 20px;">${__('No users found')}</p>`
				);
				return;
			}

			// Filter out current user and the other party in the call
			const currentUser = frappe.session.user;
			const excludeUsers = [currentUser, remoteUser];
			const filteredUsers = users.filter(u => !excludeUsers.includes(u.user));

			if (filteredUsers.length === 0) {
				$content.find('#transfer-results').html(
					`<p style="text-align: center; color: #888; padding: 20px;">${__('No available users to transfer to')}</p>`
				);
				return;
			}

			let html = '';
			for (const user of filteredUsers) {
				const statusColor = user.status === 'online' ? '#28a745' : (user.status === 'in_call' ? '#ffc107' : '#ccc');
				const statusText = user.status === 'online' ? 'Online' : (user.status === 'in_call' ? 'In Call' : 'Offline');
				html += `
					<div class="f-icecore-user-card transfer-user" data-user="${user.user}" style="cursor: pointer; padding: 10px 12px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 10px; transition: background 0.2s;">
						<div style="flex-shrink: 0;">
							${frappe.avatar(user.user, 'avatar-medium')}
						</div>
						<div style="flex: 1; min-width: 0;">
							<div style="font-weight: 600; font-size: 13px;">${user.full_name}</div>
							<div style="font-size: 11px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${user.user}</div>
						</div>
						<div style="flex-shrink: 0; display: flex; align-items: center; gap: 6px;">
							<span style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; display: inline-block;"></span>
							<span style="font-size: 11px; color: #888;">${statusText}</span>
						</div>
					</div>
				`;
			}

			$content.find('#transfer-results').html(html);

			// Click handler: initiate blind transfer
			$content.find('.transfer-user').on('click', async (e) => {
				const selectedUser = $(e.currentTarget).data('user');
				console.log('Transfer: Selected target:', selectedUser);

				$(e.currentTarget).css({ opacity: 0.5, pointerEvents: 'none' });
				$(e.currentTarget).append(' <i class="fa fa-spinner fa-spin"></i>');

				try {
					await this._initiateTransfer(callId, selectedUser, 'blind', callType);
					transferDialog.hide();
				} catch (err) {
					console.error('Transfer failed:', err);
					$(e.currentTarget).css({ opacity: 1, pointerEvents: 'auto' });
					$(e.currentTarget).find('.fa-spinner').remove();
					frappe.show_alert({ message: __('Failed to transfer call'), indicator: 'red' }, 5);
				}
			});

			// Hover effect
			$content.find('.transfer-user').hover(
				function() { $(this).css('background', '#f8f9fa'); },
				function() { $(this).css('background', ''); }
			);

		} catch (error) {
			console.error('Transfer search failed:', error);
		}
	}

	/**
	 * Initiate a call transfer via backend API.
	 */
	async _initiateTransfer(callId, transferTarget, transferType, callType) {
		console.log('Transfer: Initiating', { callId, transferTarget, transferType });

		const response = await frappe.call({
			method: 'f_icecore.f_icecore.api.call_transfer.initiate_transfer',
			args: {
				call_id: callId,
				transfer_target: transferTarget,
				transfer_type: transferType
			}
		});

		const result = response.message;
		if (!result.success) {
			frappe.show_alert({ message: result.message, indicator: 'red' }, 5);
			return;
		}

		this._activeTransferId = result.transfer_id;

		if (transferType === 'blind') {
			// For blind transfer: end our side of the call
			frappe.show_alert({
				message: __('Call is being transferred...'),
				indicator: 'blue'
			}, 5);

			// End our connection (the other party will be reconnected to the target)
			this.stopDurationTimer();
			if (this.currentCallWindow) {
				this.currentCallWindow.hide();
				this.currentCallWindow = null;
			}
			if (window.FIceCore) {
				// Stop recording if active
				if (window.FIceCore.isRecording()) {
					await window.FIceCore.stopRecording();
				}
				await window.FIceCore.endCall();
			}
			await this.updatePresence('online');
		}
	}

	/**
	 * Handle incoming transfer notification (you are the transfer target).
	 * Shows a dialog similar to incoming call, but with transfer context.
	 */
	handleTransferIncoming(data) {
		console.log('Transfer: Incoming transfer:', data);

		const { transfer_id, from_user, from_user_name, transferred_by_name, call_type } = data;
		const callTypeIcon = call_type === 'video' ? 'video-camera' : 'phone';
		const callTypeText = call_type === 'video' ? 'Video' : 'Audio';

		// Play ringtone
		this.playRingtone();

		// Desktop notification
		this.showDesktopNotification(from_user_name, `${callTypeText} Transfer`, false);

		// Close existing incoming dialog
		if (this.incomingCallDialog) {
			this.incomingCallDialog.hide();
		}

		this.incomingCallDialog = new frappe.ui.Dialog({
			title: `<i class="fa fa-exchange"></i> ${__('Incoming Call Transfer')}`,
			static: true,
			minimizable: false,
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'transfer_incoming_content'
				}
			]
		});

		this.incomingCallDialog.show();

		setTimeout(() => {
			const $content = this.incomingCallDialog.fields_dict.transfer_incoming_content.$wrapper;
			$content.html(`
				<div style="text-align: center; padding: 30px;">
					<div style="margin-bottom: 20px; display: flex; justify-content: center;">
						${frappe.avatar(from_user, 'avatar-large')}
					</div>
					<h3 style="margin-bottom: 10px;">${from_user_name}</h3>
					<p style="color: #888; margin-bottom: 10px; font-size: 14px;">
						<i class="fa fa-exchange"></i> ${__('Call transferred by')} ${transferred_by_name}
					</p>
					<p style="color: #888; margin-bottom: 25px; font-size: 16px;">
						<i class="fa fa-${callTypeIcon}"></i> ${callTypeText} ${__('Call')}
					</p>
					<div style="display: flex; justify-content: center; gap: 20px;">
						<button class="btn btn-success btn-lg" id="f-icecore-transfer-accept-btn">
							<i class="fa fa-phone"></i> ${__('Accept')}
						</button>
						<button class="btn btn-danger btn-lg" id="f-icecore-transfer-decline-btn">
							<i class="fa fa-phone-slash"></i> ${__('Decline')}
						</button>
					</div>
				</div>
			`);

			$content.find('#f-icecore-transfer-accept-btn').on('click', () => {
				this._acceptTransfer(transfer_id, data);
			});
			$content.find('#f-icecore-transfer-decline-btn').on('click', () => {
				this._rejectTransfer(transfer_id);
			});
		}, 50);

		window.focus();
	}

	/**
	 * Accept an incoming transfer.
	 */
	async _acceptTransfer(transferId, data) {
		try {
			console.log('Transfer: Accepting transfer:', transferId);

			if (this.incomingCallDialog) {
				this.incomingCallDialog.hide();
				this.incomingCallDialog = null;
			}
			this.stopRingtone();

			// Accept transfer in backend — creates new call session
			const response = await frappe.call({
				method: 'f_icecore.f_icecore.api.call_transfer.accept_transfer',
				args: { transfer_id: transferId }
			});

			const result = response.message;
			if (!result.success) {
				frappe.show_alert({ message: __('Failed to accept transfer'), indicator: 'red' }, 5);
				return;
			}

			const { new_call_id, remaining_user, remaining_user_name, call_type } = result;

			// Request media permission
			if (window.FIceCore) {
				await window.FIceCore.requestMediaPermission(call_type);
			}

			// Show call window with the remaining user
			this.showCallWindow(remaining_user, call_type, new_call_id, false);

			// Start WebRTC connection — we answer the call (remaining user will send offer)
			if (window.FIceCore) {
				await window.FIceCore.answerCall(remaining_user, call_type, new_call_id);
			}

			await this.updatePresence('in_call', { call_id: new_call_id });

			frappe.show_alert({
				message: `${__('Connected with')} ${remaining_user_name}`,
				indicator: 'green'
			}, 3);

		} catch (error) {
			console.error('Transfer: Failed to accept:', error);
			frappe.msgprint(__('Failed to accept transferred call'));
		}
	}

	/**
	 * Reject an incoming transfer.
	 */
	async _rejectTransfer(transferId) {
		try {
			if (this.incomingCallDialog) {
				this.incomingCallDialog.hide();
				this.incomingCallDialog = null;
			}
			this.stopRingtone();

			await frappe.call({
				method: 'f_icecore.f_icecore.api.call_transfer.reject_transfer',
				args: { transfer_id: transferId }
			});

		} catch (error) {
			console.error('Transfer: Failed to reject:', error);
		}
	}

	/**
	 * Handle transfer notification (you are the remaining party being transferred).
	 * Shows an alert that the call is being transferred.
	 */
	handleTransferNotify(data) {
		console.log('Transfer: Notify — call is being transferred:', data);

		const { transfer_target_name, transfer_type, message: msg } = data;

		if (msg) {
			frappe.show_alert({
				message: msg,
				indicator: 'blue'
			}, 8);
		} else {
			frappe.show_alert({
				message: `${__('Call is being transferred to')} ${transfer_target_name}...`,
				indicator: 'blue'
			}, 8);
		}
	}

	/**
	 * Handle transfer completed — reconnect to the new peer.
	 * The remaining party (B) needs to establish a new WebRTC connection with the target (C).
	 */
	async handleTransferCompleted(data) {
		console.log('Transfer: Completed:', data);

		const { new_call_id, new_peer, new_peer_name, call_type, old_call_id } = data;

		if (!new_peer || !new_call_id) {
			// This is just a status notification to the original transferrer
			if (data.status === 'completed') {
				frappe.show_alert({
					message: __('Transfer completed successfully'),
					indicator: 'green'
				}, 5);
			}
			return;
		}

		// We are the remaining party — need to reconnect to the new peer
		console.log('Transfer: Reconnecting to new peer:', new_peer);

		// End the old connection cleanly (without notifying backend — it's already ended)
		if (window.FIceCore) {
			if (window.FIceCore.peerConnection) {
				window.FIceCore.peerConnection.close();
				window.FIceCore.peerConnection = null;
			}
			if (window.FIceCore.localStream) {
				window.FIceCore.localStream.getTracks().forEach(t => t.stop());
				window.FIceCore.localStream = null;
			}
			window.FIceCore.remoteStream = null;
			window.FIceCore.callId = null;
			window.FIceCore.remoteUser = null;
		}

		// Remove hidden audio element
		const remoteAudio = document.getElementById('remote-audio');
		if (remoteAudio) {
			remoteAudio.srcObject = null;
			remoteAudio.remove();
		}

		this.stopDurationTimer();

		// Close old call window
		if (this.currentCallWindow) {
			this.currentCallWindow.hide();
			this.currentCallWindow = null;
		}

		frappe.show_alert({
			message: `${__('Transferred. Connecting to')} ${new_peer_name}...`,
			indicator: 'green'
		}, 5);

		// Show new call window and start a new WebRTC call to the transfer target
		this.showCallWindow(new_peer, call_type || 'audio', new_call_id, true);

		if (window.FIceCore) {
			await window.FIceCore.startCall(new_peer, call_type || 'audio', new_call_id);
		}

		await this.updatePresence('in_call', { call_id: new_call_id });
	}

	/**
	 * Handle transfer failed notification.
	 */
	handleTransferFailed(data) {
		console.log('Transfer: Failed:', data);

		frappe.show_alert({
			message: data.reason || __('Transfer failed'),
			indicator: 'red'
		}, 5);

		this._activeTransferId = null;
	}

	/**
	 * Handle transfer cancelled notification.
	 */
	handleTransferCancelled(data) {
		console.log('Transfer: Cancelled:', data);

		// Close incoming transfer dialog if open
		if (this.incomingCallDialog) {
			this.incomingCallDialog.hide();
			this.incomingCallDialog = null;
		}
		this.stopRingtone();

		frappe.show_alert({
			message: data.message || __('Transfer was cancelled'),
			indicator: 'orange'
		}, 5);

		this._activeTransferId = null;
	}
}

// Initialize when frappe is ready
$(document).ready(function() {
	if (typeof frappe !== 'undefined') {
		console.log('🔵 F-IceCore: Creating FIceCoreUI instance...');
		window.FIceCoreUI = new FIceCoreCallUI();
		console.log('✅ F-IceCore: FIceCoreUI instance created successfully:', window.FIceCoreUI);
	} else {
		setTimeout(function() {
			if (typeof frappe !== 'undefined') {
				console.log('🔵 F-IceCore: Creating FIceCoreUI instance (delayed)...');
				window.FIceCoreUI = new FIceCoreCallUI();
				console.log('✅ F-IceCore: FIceCoreUI instance created successfully:', window.FIceCoreUI);
			}
		}, 500);
	}
});
