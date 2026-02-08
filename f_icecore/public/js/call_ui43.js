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
			]
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
						<video id="local-video" autoplay playsinline muted style="position: absolute; bottom: 20px; right: 20px; width: 200px; height: 150px; object-fit: cover; border: 3px solid white; border-radius: 8px;"></video>
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
					<div class="call-controls" style="text-align: center; margin-top: 30px; display: flex; justify-content: center; gap: 15px;">
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
			$content.find('#f-icecore-hangup-btn').on('click', () => {
				window.FIceCoreUI.hangup();
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
