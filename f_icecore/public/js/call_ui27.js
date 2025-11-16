/**
 * F-IceCore Call UI
 * Discord-like calling interface
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
		this.pendingCalls = [];  // Store pending incoming calls

		console.log('🔵 F-IceCore CallUI: Calling init()...');
		this.init();
		console.log('✅ F-IceCore CallUI: Constructor completed');
	}

	init() {
		console.log('🔵 F-IceCore CallUI: init() started');

		// Setup realtime listeners for incoming calls
		console.log('🔵 F-IceCore CallUI: Setting up incoming call listener...');
		this.setupIncomingCallListener();

		// Setup call control handlers
		console.log('🔵 F-IceCore CallUI: Setting up call controls...');
		this.setupCallControls();

		// Load audio assets
		console.log('🔵 F-IceCore CallUI: Loading audio assets...');
		this.loadAudioAssets();

		// Request notification permission
		console.log('🔵 F-IceCore CallUI: Requesting notification permission...');
		this.requestNotificationPermission();

		console.log('✅ F-IceCore CallUI: init() completed');
	}

	requestNotificationPermission() {
		if ('Notification' in window && Notification.permission === 'default') {
			Notification.requestPermission().then(permission => {
				console.log('Notification permission:', permission);
			});
		}
	}

	setupIncomingCallListener() {
		console.log('🎧 F-IceCore: Setting up incoming call listener');
		console.log('🎧 F-IceCore: frappe exists?', typeof frappe !== 'undefined');
		console.log('🎧 F-IceCore: frappe.realtime exists?', typeof frappe.realtime !== 'undefined');
		console.log('🎧 F-IceCore: frappe.realtime.on exists?', typeof frappe.realtime.on === 'function');

		if (!frappe.realtime || typeof frappe.realtime.on !== 'function') {
			console.error('❌ F-IceCore: frappe.realtime.on is not available!');
			console.log('🔍 F-IceCore: frappe.realtime =', frappe.realtime);
			console.log('🔍 F-IceCore: Will retry in 2 seconds...');
			setTimeout(() => {
				console.log('🔄 F-IceCore: Retrying setupIncomingCallListener...');
				this.setupIncomingCallListener();
			}, 2000);
			return;
		}

		// Listen for incoming calls - using f_icecore:incoming_call (colon format like presence_update)
		console.log('🎧 F-IceCore: Registering f_icecore:incoming_call listener...');
		frappe.realtime.on('f_icecore:incoming_call', (data) => {
			// Get current user dynamically (not from closure) to avoid undefined issues
			const currentUser = frappe.session.user;
			console.log('📞 F-IceCore: 🔔🔔🔔 f_icecore:incoming_call event FIRED in FIceCoreUI listener!');
			console.log('📞 F-IceCore: f_icecore:incoming_call event received:', data);
			console.log('📞 F-IceCore: Current user:', currentUser);
			console.log('📞 F-IceCore: to_user:', data.to_user);
			console.log('📞 F-IceCore: from_user:', data.from_user);

			// Filter: Only show if we're the recipient and NOT the caller
			if (data.to_user === currentUser && data.from_user !== currentUser) {
				console.log('✅ F-IceCore: This call is for me!');
				this.handleIncomingCall(data);
			} else {
				console.log('⏭️ F-IceCore: This call is not for me, ignoring');
			}
		});
		console.log('✅ F-IceCore: f_icecore:incoming_call listener registered!');

		// DEBUG: Listen to ALL Socket.IO events to see what's actually being received
		if (frappe.socketio && frappe.socketio.socket) {
			console.log('🐛 DEBUG: Setting up catch-all Socket.IO listener...');
			const originalOnevent = frappe.socketio.socket.onevent;
			frappe.socketio.socket.onevent = function(packet) {
				console.log('🐛 Socket.IO event received:', packet.data);
				if (packet.data && packet.data[0] && packet.data[0].includes('incoming')) {
					console.log('🔔 INCOMING-RELATED EVENT:', packet.data);
				}
				originalOnevent.call(this, packet);
			};
			console.log('✅ DEBUG: Catch-all listener installed');
		}

		frappe.realtime.on('call_accepted', (data) => {
			const currentUser = frappe.session.user;
			console.log('✅ F-IceCore: call_accepted event:', data);
			// Only process if this involves us
			if (data.accepted_by === currentUser || data.call_id) {
				this.stopCallingTone();
				this.removePendingCall(data.call_id);
			}
		});

		frappe.realtime.on('call_rejected', (data) => {
			const currentUser = frappe.session.user;
			console.log('❌ F-IceCore: call_rejected event:', data);
			// Only process if this involves us
			if (data.rejected_by === currentUser || data.call_id) {
				this.stopCallingTone();
				frappe.show_alert({
					message: __('Call was declined'),
					indicator: 'red'
				}, 5);
				this.closeCallWindow();
				this.removePendingCall(data.call_id);
			}
		});

		frappe.realtime.on('call_ended', (data) => {
			console.log('📞 F-IceCore: call_ended event:', data);
			if (data.call_id) {
				this.removePendingCall(data.call_id);
				this.closeCallWindow();
			}
		});

		console.log('✅ F-IceCore: Incoming call listeners registered');
	}

	handleIncomingCall(data) {
		console.log('🔔 Handling incoming call:', data);

		// Add to pending calls
		const existingIndex = this.pendingCalls.findIndex(c => c.call_id === data.call_id);
		if (existingIndex === -1) {
			this.pendingCalls.push(data);
			console.log('📋 Added to pending calls. Total pending:', this.pendingCalls.length);
		}

		// Update navbar badge
		this.updateNavbarBadge();

		// Play ringtone
		this.playRingtone();

		// Show desktop notification
		const callTypeText = data.call_type.charAt(0).toUpperCase() + data.call_type.slice(1);
		this.showDesktopNotification(data.from_user_name, callTypeText);

		// Show toast notification
		frappe.show_alert({
			message: __(`Incoming ${callTypeText} call from ${data.from_user_name}`),
			indicator: 'blue'
		}, 10);
	}

	updateNavbarBadge() {
		const $btn = $('#f-icecore-nav-btn');
		if ($btn.length === 0) return;

		// Remove existing badge
		$btn.find('.badge').remove();

		// Add new badge if there are pending calls
		if (this.pendingCalls.length > 0) {
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
					z-index: 1000;
				">${this.pendingCalls.length}</span>
			`);
			$btn.find('a').css('position', 'relative').append($badge);
			console.log('🔔 Updated badge:', this.pendingCalls.length);
		}
	}

	removePendingCall(callId) {
		const index = this.pendingCalls.findIndex(c => c.call_id === callId);
		if (index !== -1) {
			this.pendingCalls.splice(index, 1);
			console.log('✅ Removed pending call. Remaining:', this.pendingCalls.length);
			this.updateNavbarBadge();
		}
	}

	getPendingCalls() {
		return this.pendingCalls;
	}

	setupCallControls() {
		// Add call button to user list (if exists)
		// This would be integrated into Frappe's user interface
	}

	loadAudioAssets() {
		// Create Web Audio API context for generating beep tones
		try {
			this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
			this.ringtoneInterval = null;
			this.callingToneInterval = null;
			console.log('✅ Audio context created for call tones');
		} catch (e) {
			console.warn('⚠️ Web Audio API not supported:', e);
			this.audioContext = null;
		}
	}

	async initiateCall(targetUser, callType = 'audio') {
		try {
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

			// Update presence to in_call
			await this.updatePresence('in_call', { call_id: callSession.name });

		} catch (error) {
			console.error('Failed to initiate call:', error);
			frappe.msgprint(__('Failed to start call'));
		}
	}

	showIncomingCallDialog(callData) {
		const { call_id, from_user, from_user_name, call_type } = callData;

		const callTypeIcon = call_type === 'video' ? '📹' : (call_type === 'screen' ? '🖥️' : '📞');
		const callTypeText = call_type.charAt(0).toUpperCase() + call_type.slice(1);

		console.log('🔔 Showing incoming call dialog for:', from_user_name);

		// Show desktop notification
		this.showDesktopNotification(from_user_name, callTypeText);

		// Close any existing incoming call dialog
		if (this.incomingCallDialog) {
			this.incomingCallDialog.hide();
		}

		this.incomingCallDialog = new frappe.ui.Dialog({
			title: __('Incoming Call'),
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
					<h3 style="margin-bottom: 10px;">${from_user_name}</h3>
					<p style="color: #888; margin-bottom: 30px; font-size: 18px;">
						${callTypeIcon} ${__(callTypeText)} Call
					</p>
					<div class="call-actions" style="display: flex; justify-content: center; gap: 20px;">
						<button class="btn btn-success btn-lg" onclick="window.FIceCoreUI.acceptCall('${call_id}', '${from_user}', '${call_type}')">
							<i class="fa fa-phone"></i> ${__('Accept')}
						</button>
						<button class="btn btn-danger btn-lg" onclick="window.FIceCoreUI.rejectCall('${call_id}')">
							<i class="fa fa-phone-slash"></i> ${__('Decline')}
						</button>
					</div>
				</div>
			`);

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

	showDesktopNotification(fromUserName, callType) {
		if ('Notification' in window && Notification.permission === 'granted') {
			const notification = new Notification(`Incoming ${callType} Call`, {
				body: `${fromUserName} is calling you`,
				icon: '/assets/frappe/images/frappe-framework-logo.png',
				tag: 'f-icecore-call',
				requireInteraction: true,
				vibrate: [200, 100, 200]
			});

			notification.onclick = () => {
				window.focus();
				notification.close();
			};

			// Close notification after 30 seconds
			setTimeout(() => notification.close(), 30000);
		}
	}

	async acceptCall(callId, fromUser, callType) {
		try {
			// Close incoming call dialog
			if (this.incomingCallDialog) {
				this.incomingCallDialog.hide();
			}

			// Stop ringtone
			this.stopRingtone();

			// Accept call in backend
			await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.accept_call',
				args: { call_id: callId }
			});

			// Show call window
			this.showCallWindow(fromUser, callType, callId, false);

			// Answer WebRTC call
			await window.FIceCore.answerCall(fromUser, callType, callId);

			// Update presence
			await this.updatePresence('in_call', { call_id: callId });

		} catch (error) {
			console.error('Failed to accept call:', error);
			frappe.msgprint(__('Failed to accept call'));
		}
	}

	async rejectCall(callId) {
		try {
			// Close dialog
			if (this.incomingCallDialog) {
				this.incomingCallDialog.hide();
			}

			// Stop ringtone
			this.stopRingtone();

			// Reject call in backend
			await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.reject_call',
				args: { call_id: callId, reason: 'User declined' }
			});

			// Remove from pending
			this.removePendingCall(callId);

		} catch (error) {
			console.error('Failed to reject call:', error);
		}
	}

	async acceptCallFromNotification(callId, fromUser, callType) {
		console.log('📞 Accepting call from notification:', callId);

		// Stop ringtone
		this.stopRingtone();

		// Remove from pending calls
		this.removePendingCall(callId);

		// Accept the call
		await this.acceptCall(callId, fromUser, callType);
	}

	async rejectCallFromNotification(callId) {
		console.log('❌ Rejecting call from notification:', callId);

		// Stop ringtone
		this.stopRingtone();

		// Remove from pending calls
		this.removePendingCall(callId);

		// Reject the call
		await this.rejectCall(callId);

		// Show feedback
		frappe.show_alert({
			message: __('Call declined'),
			indicator: 'red'
		}, 3);
	}

	showCallingWindow(targetUser, callType, callId) {
		const userName = frappe.boot.user_info[targetUser]?.fullname || targetUser;
		const callTypeIcon = callType === 'video' ? '📹' : (callType === 'screen' ? '🖥️' : '📞');

		// Close any existing calling window
		if (this.currentCallWindow) {
			this.currentCallWindow.hide();
		}

		this.currentCallWindow = new frappe.ui.Dialog({
			title: __('Calling...'),
			static: true,
			size: 'large',
			minimizable: false,
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'calling_content'
				}
			]
		});

		this.currentCallWindow.show();

		// Set content after dialog is shown to avoid escaping issues
		setTimeout(() => {
			const $content = this.currentCallWindow.fields_dict.calling_content.$wrapper;
			$content.html(`
				<div class="f-icecore-calling" style="text-align: center; padding: 40px;">
					<div class="caller-avatar" style="margin-bottom: 20px; display: flex; justify-content: center;">
						<div id="calling-avatar-container"></div>
					</div>
					<h3 style="margin-bottom: 10px;">${userName}</h3>
					<p style="color: #888; margin-bottom: 30px;">
						${callTypeIcon} ${__('Calling...')}
					</p>
					<button class="btn btn-danger btn-lg" onclick="window.FIceCoreUI.hangup()">
						<i class="fa fa-phone-slash"></i> ${__('Cancel')}
					</button>
				</div>
			`);

			// Render avatar using Frappe's avatar function
			const avatarContainer = document.getElementById('calling-avatar-container');
			if (avatarContainer) {
				const avatarHtml = frappe.avatar(targetUser, 'avatar-large');
				avatarContainer.innerHTML = avatarHtml;
			}
		}, 50);
	}

	showCallWindow(remoteUser, callType, callId, isCaller) {
		const userName = frappe.boot.user_info[remoteUser]?.fullname || remoteUser;
		const hasVideo = callType === 'video' || callType === 'screen';

		// Close any existing call window
		if (this.currentCallWindow) {
			this.currentCallWindow.hide();
		}

		this.currentCallWindow = new frappe.ui.Dialog({
			title: __('In Call') + ' - ' + userName,
			static: true,
			size: 'extra-large',
			minimizable: false,
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'call_content',
					options: `
						<div class="f-icecore-call-window">
							<div class="video-container" style="position: relative; background: #1a1a1a; min-height: 500px; border-radius: 8px; overflow: hidden;">
								${hasVideo ? `
									<video id="f-icecore-remote-video" autoplay playsinline
										style="width: 100%; height: 500px; object-fit: contain; background: #000; border-radius: 8px;">
									</video>
									<video id="f-icecore-local-video" autoplay playsinline muted
										style="position: absolute; bottom: 20px; right: 20px; width: 200px; height: 150px;
										object-fit: cover; border-radius: 8px; border: 2px solid #fff; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">
									</video>
								` : `
									<div style="display: flex; align-items: center; justify-content: center; height: 500px;">
										<div style="text-align: center;">
											<img src="${frappe.avatar(remoteUser, "avatar-medium")}"
												style="width: 120px; height: 120px; border-radius: 50%; margin-bottom: 20px;">
											<h3 style="color: #fff; margin-bottom: 10px;">${userName}</h3>
											<p style="color: #aaa; font-size: 24px; font-weight: 500;" id="call-duration">00:00</p>
										</div>
									</div>
								`}
							</div>

							<div class="call-controls" style="display: flex; justify-content: center; gap: 15px; margin-top: 20px; padding: 20px;">
								<button class="btn btn-secondary btn-lg" id="toggle-audio" onclick="window.FIceCoreUI.toggleAudio()" title="${__('Mute/Unmute Microphone')}">
									<i class="fa fa-microphone"></i>
								</button>
								${hasVideo ? `
									<button class="btn btn-secondary btn-lg" id="toggle-video" onclick="window.FIceCoreUI.toggleVideo()" title="${__('Turn Camera On/Off')}">
										<i class="fa fa-video"></i>
									</button>
								` : ''}
								<button class="btn btn-danger btn-lg" onclick="window.FIceCoreUI.hangup()" title="${__('End Call')}">
									<i class="fa fa-phone-slash"></i> ${__('End Call')}
								</button>
							</div>
						</div>
					`
				}
			]
		});

		this.currentCallWindow.show();

		// Setup WebRTC stream handlers (wait for DOM to be ready)
		setTimeout(() => {
			this.setupStreamHandlers(hasVideo);
		}, 100);

		// Start call duration counter for audio calls
		if (!hasVideo) {
			this.startCallDurationCounter();
		}
	}

	setupStreamHandlers(hasVideo) {
		// Handle local stream
		window.FIceCore.onLocalStream = (stream) => {
			console.log('📹 Local stream received:', stream);
			if (hasVideo) {
				const localVideo = document.getElementById('f-icecore-local-video');
				if (localVideo) {
					localVideo.srcObject = stream;
					console.log('✅ Local video element updated');
				} else {
					console.warn('⚠️ Local video element not found');
				}
			}
		};

		// Handle remote stream
		window.FIceCore.onRemoteStream = (stream) => {
			console.log('📹 Remote stream received:', stream);
			if (hasVideo) {
				const remoteVideo = document.getElementById('f-icecore-remote-video');
				if (remoteVideo) {
					remoteVideo.srcObject = stream;
					console.log('✅ Remote video element updated');
				} else {
					console.warn('⚠️ Remote video element not found');
				}
			}
		};

		// Handle call ended
		window.FIceCore.onCallEnded = () => {
			console.log('📞 Call ended - closing window');
			this.closeCallWindow();
		};

		// Handle errors
		window.FIceCore.onError = (error) => {
			console.error('❌ WebRTC Error:', error);
			frappe.msgprint({
				title: __('Call Error'),
				message: error.toString(),
				indicator: 'red'
			});
			this.closeCallWindow();
		};

		// Trigger callbacks if streams already exist
		if (window.FIceCore.localStream && window.FIceCore.onLocalStream) {
			window.FIceCore.onLocalStream(window.FIceCore.localStream);
		}
		if (window.FIceCore.remoteStream && window.FIceCore.onRemoteStream) {
			window.FIceCore.onRemoteStream(window.FIceCore.remoteStream);
		}
	}

	toggleAudio() {
		this.isAudioMuted = !this.isAudioMuted;
		window.FIceCore.toggleAudio(!this.isAudioMuted);

		const btn = document.getElementById('toggle-audio');
		if (btn) {
			btn.innerHTML = this.isAudioMuted
				? '<i class="fa fa-microphone-slash"></i>'
				: '<i class="fa fa-microphone"></i>';
			btn.classList.toggle('btn-danger', this.isAudioMuted);
		}
	}

	toggleVideo() {
		this.isVideoMuted = !this.isVideoMuted;
		window.FIceCore.toggleVideo(!this.isVideoMuted);

		const btn = document.getElementById('toggle-video');
		if (btn) {
			btn.innerHTML = this.isVideoMuted
				? '<i class="fa fa-video-slash"></i>'
				: '<i class="fa fa-video"></i>';
			btn.classList.toggle('btn-danger', this.isVideoMuted);
		}
	}

	async hangup() {
		await window.FIceCore.endCall();
		this.closeCallWindow();
		await this.updatePresence('online');
	}

	closeCallWindow() {
		if (this.currentCallWindow) {
			this.currentCallWindow.hide();
			this.currentCallWindow = null;
		}
		this.stopRingtone();
		this.stopCallingTone();
	}

	startCallDurationCounter() {
		let seconds = 0;
		const interval = setInterval(() => {
			seconds++;
			const minutes = Math.floor(seconds / 60);
			const secs = seconds % 60;
			const duration = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

			const durationEl = document.getElementById('call-duration');
			if (durationEl) {
				durationEl.textContent = duration;
			} else {
				clearInterval(interval);
			}
		}, 1000);
	}

	// Generate a beep tone using Web Audio API
	playBeep(frequency = 800, duration = 200) {
		if (!this.audioContext) return;

		try {
			const oscillator = this.audioContext.createOscillator();
			const gainNode = this.audioContext.createGain();

			oscillator.connect(gainNode);
			gainNode.connect(this.audioContext.destination);

			oscillator.frequency.value = frequency;
			oscillator.type = 'sine';

			gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
			gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration / 1000);

			oscillator.start(this.audioContext.currentTime);
			oscillator.stop(this.audioContext.currentTime + duration / 1000);
		} catch (e) {
			console.warn('Failed to play beep:', e);
		}
	}

	playRingtone() {
		if (!this.audioContext) return;

		// Play double beep pattern for incoming call (800Hz, 600Hz)
		this.stopRingtone(); // Clear any existing ringtone

		const playPattern = () => {
			this.playBeep(800, 300);  // First beep
			setTimeout(() => this.playBeep(600, 300), 350);  // Second beep
		};

		playPattern(); // Play immediately
		this.ringtoneInterval = setInterval(playPattern, 2000); // Repeat every 2 seconds
		console.log('🔔 Playing ringtone (double beep pattern)');
	}

	stopRingtone() {
		if (this.ringtoneInterval) {
			clearInterval(this.ringtoneInterval);
			this.ringtoneInterval = null;
			console.log('🔇 Stopped ringtone');
		}
	}

	playCallingTone() {
		if (!this.audioContext) return;

		// Play single beep pattern for outgoing call (900Hz)
		this.stopCallingTone(); // Clear any existing tone

		const playPattern = () => {
			this.playBeep(900, 400);  // Single longer beep
		};

		playPattern(); // Play immediately
		this.callingToneInterval = setInterval(playPattern, 3000); // Repeat every 3 seconds
		console.log('📞 Playing calling tone (single beep pattern)');
	}

	stopCallingTone() {
		if (this.callingToneInterval) {
			clearInterval(this.callingToneInterval);
			this.callingToneInterval = null;
			console.log('🔇 Stopped calling tone');
		}
	}

	async getUserPresence(user) {
		const response = await frappe.call({
			method: 'f_icecore.f_icecore.api.presence.get_user_presence',
			args: { user }
		});
		return response.message;
	}

	async updatePresence(status, metadata) {
		await frappe.call({
			method: 'f_icecore.f_icecore.api.presence.update_presence',
			args: { status, metadata }
		});
	}

	// Quick call button for user cards
	addCallButtonToUserCard(userElement, username) {
		const callBtn = `
			<button class="btn btn-xs btn-default"
				onclick="window.FIceCoreUI.initiateCall('${username}', 'audio')"
				title="${__('Audio Call')}">
				<i class="fa fa-phone"></i>
			</button>
			<button class="btn btn-xs btn-default"
				onclick="window.FIceCoreUI.initiateCall('${username}', 'video')"
				title="${__('Video Call')}">
				<i class="fa fa-video"></i>
			</button>
		`;

		$(userElement).append(callBtn);
	}
}

// Global instance
console.log('🔵 F-IceCore: Creating FIceCoreUI instance...');
try {
	window.FIceCoreUI = new FIceCoreCallUI();
	console.log('✅ F-IceCore: FIceCoreUI instance created successfully:', window.FIceCoreUI);
} catch (error) {
	console.error('❌ F-IceCore: Error creating FIceCoreUI instance:', error);
	console.error('Error stack:', error.stack);
}
