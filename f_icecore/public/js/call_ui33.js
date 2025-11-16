/**
 * F-IceCore Call UI v33 - Enhanced with Accept/Reject Notifications + Urgent Calls
 * Handles incoming call notifications, call dialogs, and UI interactions
 *
 * NEW FEATURES:
 * - Caller sees "Accepted" notification when callee accepts
 * - Caller sees "Rejected" notification when callee rejects
 * - Support for urgent calls (direct popup, no need to click navbar)
 * - Fixed showCallMenu undefined error
 */

class FIceCoreCallUI {
	constructor() {
		console.log('🔵 F-IceCore CallUI v33: Constructor called');
		this.currentCallWindow = null;
		this.incomingCallDialog = null;
		this.isAudioMuted = false;
		this.isVideoMuted = false;
		this.ringtone = null;
		this.callingTone = null;
		this.pendingCalls = []; // Track pending incoming calls

		console.log('🔵 F-IceCore CallUI: Calling init()...');
		this.init();
		console.log('✅ F-IceCore CallUI v33: Constructor completed');
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

		console.log('✅ F-IceCore CallUI: init() completed');
	}

	setupIncomingCallListener() {
		console.log('🎧 F-IceCore: Setting up incoming call listener');
		console.log('🎧 F-IceCore: frappe exists?', typeof frappe !== 'undefined');
		console.log('🎧 F-IceCore: frappe.realtime exists?', typeof frappe.realtime !== 'undefined');
		console.log('🎧 F-IceCore: frappe.realtime.on exists?', typeof frappe.realtime?.on === 'function');

		const user = frappe.session.user;
		console.log('🎧 F-IceCore: Current user:', user);

		// ✅ Listen for incoming_call event
		const eventName = 'f_icecore:incoming_call';
		console.log('🎧 F-IceCore: Registering listener for event:', eventName);

		try {
			frappe.realtime.on(eventName, (data) => {
				console.log('🔔🔔🔔 F-IceCore: incoming_call event received!');
				console.log('📦 Event data:', data);
				console.log('   - From user:', data.from_user);
				console.log('   - To user:', data.to_user);
				console.log('   - Call type:', data.call_type);
				console.log('   - Call ID:', data.call_id);
				console.log('   - Is Urgent:', data.is_urgent);

				// Check if this call is for the current user
				if (data.to_user === user) {
					console.log('✅ This call is for me! Showing dialog...');

					// 🆕 For urgent calls, show popup immediately
					if (data.is_urgent) {
						console.log('🚨 URGENT CALL - Showing popup immediately!');
						this.showIncomingCallDialog(data, true);
					} else {
						this.showIncomingCallDialog(data, false);
					}

					this.playRingtone();
				} else {
					console.log('ℹ️  This call is not for me (to_user:', data.to_user, ', current user:', user, ')');
				}
			});

			console.log('✅ F-IceCore: f_icecore:incoming_call listener registered!');

		} catch (error) {
			console.error('❌ F-IceCore: Failed to register incoming_call listener:', error);
		}

		// 🆕 ENHANCED: Show "Accepted" notification to caller
		frappe.realtime.on('f_icecore:call_accepted', (data) => {
			console.log('✅ Call accepted event received:', data);
			if (data.from_user === user) {
				// The caller receives this when callee accepts
				console.log('🎉 Callee accepted my call!');
				this.stopCallingTone();

				// Show success notification to caller
				frappe.show_alert({
					message: __('Call Accepted! Connecting...'),
					indicator: 'green'
				}, 3);
			}
		});

		// 🆕 ENHANCED: Show "Rejected" notification to caller
		frappe.realtime.on('f_icecore:call_rejected', (data) => {
			console.log('❌ Call rejected event received:', data);
			if (data.from_user === user) {
				// The caller receives this when callee rejects
				console.log('😞 Callee rejected my call');
				this.stopCallingTone();

				// Close calling window
				if (this.currentCallWindow) {
					this.currentCallWindow.hide();
					this.currentCallWindow = null;
				}

				// 🆕 Show rejection notification to caller
				frappe.show_alert({
					message: __('Call was rejected by {0}', [data.rejected_by]),
					indicator: 'red'
				}, 5);
			}
		});

		frappe.realtime.on('f_icecore:call_ended', (data) => {
			console.log('📵 Call ended event received:', data);
			this.handleCallEnded();
		});

		console.log('✅ F-IceCore: Incoming call listeners registered');
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

	showIncomingCallDialog(callData, isUrgent = false) {
		console.log('🔔 showIncomingCallDialog called with:', callData);

		const { call_id, from_user, from_user_name, call_type, is_urgent } = callData;

		// Add to pending calls
		this.addPendingCall(callData);

		const callTypeIcon = call_type === 'video' ? '📹' : (call_type === 'screen' ? '🖥️' : '📞');
		const callTypeText = call_type.charAt(0).toUpperCase() + call_type.slice(1);

		// 🆕 Urgent call styling
		const urgentBadge = is_urgent ? '<span style="background: #ff4444; color: white; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">🚨 URGENT</span>' : '';

		console.log('🔔 Showing incoming call dialog for:', from_user_name);

		// Show desktop notification
		this.showDesktopNotification(from_user_name, callTypeText, is_urgent);

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
				<div class="f-icecore-incoming-call" style="text-align: center; padding: 30px; ${is_urgent ? 'background: linear-gradient(135deg, #fff3cd 0%, #ffe4e1 100%); border: 3px solid #ff4444;' : ''}">
					${urgentBadge ? '<div style="margin-bottom: 15px;">' + urgentBadge + '</div>' : ''}
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

		// 🆕 For urgent calls, make dialog more prominent
		if (is_urgent) {
			// Add pulsing animation
			setTimeout(() => {
				if (this.incomingCallDialog && this.incomingCallDialog.$wrapper) {
					this.incomingCallDialog.$wrapper.find('.modal-content').css({
						'animation': 'pulse 1s infinite',
						'box-shadow': '0 0 30px rgba(255, 68, 68, 0.8)'
					});
				}
			}, 100);
		}
	}

	showDesktopNotification(fromUserName, callType, isUrgent = false) {
		if ('Notification' in window && Notification.permission === 'granted') {
			const notification = new Notification(`${isUrgent ? '🚨 URGENT ' : ''}Incoming ${callType} Call`, {
				body: `${fromUserName} is calling you${isUrgent ? ' - URGENT!' : ''}`,
				icon: '/assets/frappe/images/frappe-framework-logo.png',
				tag: 'f-icecore-call',
				requireInteraction: true,
				vibrate: isUrgent ? [200, 100, 200, 100, 200] : [200, 100, 200]
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
			console.log('✅ User clicked ACCEPT button!');
			console.log('   - Call ID:', callId);
			console.log('   - From user:', fromUser);
			console.log('   - Call type:', callType);

			// Remove from pending calls
			this.removePendingCall(callId);

			// Close incoming call dialog
			if (this.incomingCallDialog) {
				this.incomingCallDialog.hide();
			}

			// Stop ringtone
			this.stopRingtone();

			// 🆕 Show "Accepting..." notification
			frappe.show_alert({
				message: __('Accepting call...'),
				indicator: 'blue'
			}, 2);

			// Accept call in backend
			console.log('📞 Accepting call in backend...');
			await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.accept_call',
				args: { call_id: callId }
			});

			// Show call window
			console.log('🪟 Showing call window...');
			this.showCallWindow(fromUser, callType, callId, false);

			// Answer WebRTC call
			console.log('📞 Answering WebRTC call...');
			await window.FIceCore.answerCall(fromUser, callType, callId);

			// Update presence
			console.log('📡 Updating presence to in_call...');
			await this.updatePresence('in_call', { call_id: callId });

			console.log('✅ Call accepted successfully!');

		} catch (error) {
			console.error('❌ Failed to accept call:', error);
			frappe.msgprint(__('Failed to accept call'));
		}
	}

	async rejectCall(callId) {
		try {
			console.log('❌ User clicked REJECT button!');
			console.log('   - Call ID:', callId);

			// Remove from pending calls
			this.removePendingCall(callId);

			// Close dialog
			if (this.incomingCallDialog) {
				this.incomingCallDialog.hide();
			}

			// Stop ringtone
			this.stopRingtone();

			// Reject call in backend
			console.log('📞 Rejecting call in backend...');
			await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.reject_call',
				args: { call_id: callId, reason: 'User declined' }
			});

			console.log('✅ Call rejected successfully!');

			// 🆕 Show confirmation to user who rejected
			frappe.show_alert({
				message: __('Call declined'),
				indicator: 'orange'
			}, 3);

		} catch (error) {
			console.error('❌ Failed to reject call:', error);
		}
	}

	showCallingWindow(targetUser, callType, callId) {
		const userName = frappe.boot.user_info[targetUser]?.fullname || targetUser;
		const callTypeIcon = callType === 'video' ? '📹' : (callType === 'screen' ? '🖥️' : '📞');

		this.currentCallWindow = new frappe.ui.Dialog({
			title: __('Calling...'),
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

		// Set content after dialog is shown
		setTimeout(() => {
			const $content = this.currentCallWindow.fields_dict.calling_content.$wrapper;
			$content.html(`
				<div class="f-icecore-calling" style="text-align: center; padding: 30px;">
					<div class="callee-avatar" style="margin-bottom: 20px;" id="calling-avatar-container"></div>
					<h3 style="margin-bottom: 10px;">${userName}</h3>
					<p style="color: #888; margin-bottom: 30px;">
						${callTypeIcon} Calling...
					</p>
					<button class="btn btn-danger btn-lg" onclick="window.FIceCoreUI.endCall('${callId}')">
						<i class="fa fa-phone-slash"></i> ${__('End Call')}
					</button>
				</div>
			`);

			// Render avatar
			const avatarContainer = document.getElementById('calling-avatar-container');
			if (avatarContainer) {
				avatarContainer.innerHTML = frappe.avatar(targetUser, 'avatar-large');
			}
		}, 50);
	}

	showCallWindow(remoteUser, callType, callId, isCaller) {
		const userName = frappe.boot.user_info[remoteUser]?.fullname || remoteUser;
		const callTypeIcon = callType === 'video' ? '📹' : (callType === 'screen' ? '🖥️' : '📞');

		// Close calling window if it exists
		if (this.currentCallWindow) {
			this.currentCallWindow.hide();
		}

		this.currentCallWindow = new frappe.ui.Dialog({
			title: __('Call with {0}', [userName]),
			static: true,
			minimizable: false,
			size: callType === 'video' || callType === 'screen' ? 'large' : 'medium',
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'call_content'
				}
			]
		});

		this.currentCallWindow.show();

		// Set content after dialog is shown
		setTimeout(() => {
			const $content = this.currentCallWindow.fields_dict.call_content.$wrapper;
			$content.html(`
				<div class="f-icecore-call-window">
					<!-- Video containers -->
					<div class="video-container" style="position: relative; background: #000; ${callType === 'video' || callType === 'screen' ? 'min-height: 400px;' : 'display: none;'}">
						<video id="f-icecore-remote-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>
						<video id="f-icecore-local-video" autoplay playsinline muted style="position: absolute; bottom: 10px; right: 10px; width: 150px; height: 100px; border: 2px solid #fff; border-radius: 8px; object-fit: cover;"></video>
					</div>

					<!-- Audio container -->
					<div class="audio-container" style="text-align: center; padding: 40px; ${callType === 'audio' ? '' : 'display: none;'}">
						<div style="margin-bottom: 20px;" id="call-avatar-container"></div>
						<h3>${userName}</h3>
						<p style="color: #888;">${callTypeIcon} Connected</p>
					</div>

					<!-- Audio element for remote audio -->
					<audio id="f-icecore-remote-audio" autoplay></audio>

					<!-- Call controls -->
					<div class="call-controls" style="text-align: center; padding: 20px; border-top: 1px solid #ddd;">
						${callType !== 'screen' ? `
							<button class="btn btn-default btn-lg" onclick="window.FIceCoreUI.toggleAudio()" id="toggle-audio-btn">
								<i class="fa fa-microphone"></i> ${__('Mute')}
							</button>
						` : ''}
						${callType === 'video' ? `
							<button class="btn btn-default btn-lg" onclick="window.FIceCoreUI.toggleVideo()" id="toggle-video-btn">
								<i class="fa fa-video-camera"></i> ${__('Stop Video')}
							</button>
						` : ''}
						<button class="btn btn-danger btn-lg" onclick="window.FIceCoreUI.endCall('${callId}')">
							<i class="fa fa-phone-slash"></i> ${__('End Call')}
						</button>
					</div>
				</div>
			`);

			// Render avatar for audio calls
			if (callType === 'audio') {
				const avatarContainer = document.getElementById('call-avatar-container');
				if (avatarContainer) {
					avatarContainer.innerHTML = frappe.avatar(remoteUser, 'avatar-xl');
				}
			}
		}, 50);

		// Setup media streams
		this.setupMediaStreams(callType);
	}

	setupMediaStreams(callType) {
		// Get video/audio elements
		const remoteVideo = document.getElementById('f-icecore-remote-video');
		const localVideo = document.getElementById('f-icecore-local-video');
		const remoteAudio = document.getElementById('f-icecore-remote-audio');

		// Setup remote stream callback
		window.FIceCore.onRemoteStream = (stream) => {
			console.log('📺 Received remote stream');
			if (callType === 'video' || callType === 'screen') {
				if (remoteVideo) {
					remoteVideo.srcObject = stream;
				}
			} else {
				if (remoteAudio) {
					remoteAudio.srcObject = stream;
				}
			}
		};

		// Setup local stream callback
		window.FIceCore.onLocalStream = (stream) => {
			console.log('📹 Received local stream');
			if (callType === 'video' && localVideo) {
				localVideo.srcObject = stream;
			}
		};

		// Setup call ended callback
		window.FIceCore.onCallEnded = () => {
			this.handleCallEnded();
		};
	}

	async initiateCall(targetUser, callType, isUrgent = false) {
		try {
			// Check if user is online
			const presenceData = await frappe.call({
				method: 'f_icecore.f_icecore.api.presence.get_user_presence',
				args: { user: targetUser }
			});

			if (presenceData.message?.status !== 'online') {
				frappe.msgprint(__('User is not online'));
				return;
			}

			if (presenceData.message?.status === 'in_call') {
				frappe.msgprint(__('User is already in a call'));
				return;
			}

			// Create call session
			const response = await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.initiate_call',
				args: {
					to_user: targetUser,
					call_type: callType,
					is_urgent: isUrgent ? 1 : 0
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

	async endCall(callId) {
		try {
			// End WebRTC call
			await window.FIceCore.endCall();

			// Close call window
			if (this.currentCallWindow) {
				this.currentCallWindow.hide();
				this.currentCallWindow = null;
			}

			// Stop tones
			this.stopRingtone();
			this.stopCallingTone();

			// Update presence
			await this.updatePresence('online', null);

		} catch (error) {
			console.error('Failed to end call:', error);
		}
	}

	handleCallEnded() {
		// Close any open dialogs
		if (this.currentCallWindow) {
			this.currentCallWindow.hide();
			this.currentCallWindow = null;
		}

		if (this.incomingCallDialog) {
			this.incomingCallDialog.hide();
		}

		// Stop all tones
		this.stopRingtone();
		this.stopCallingTone();

		// Update presence
		this.updatePresence('online', null);

		frappe.show_alert({
			message: __('Call ended'),
			indicator: 'orange'
		}, 3);
	}

	toggleAudio() {
		this.isAudioMuted = !this.isAudioMuted;
		window.FIceCore.toggleAudio(this.isAudioMuted);

		const btn = document.getElementById('toggle-audio-btn');
		if (btn) {
			btn.innerHTML = this.isAudioMuted ?
				'<i class="fa fa-microphone-slash"></i> Unmute' :
				'<i class="fa fa-microphone"></i> Mute';
		}
	}

	toggleVideo() {
		this.isVideoMuted = !this.isVideoMuted;
		window.FIceCore.toggleVideo(this.isVideoMuted);

		const btn = document.getElementById('toggle-video-btn');
		if (btn) {
			btn.innerHTML = this.isVideoMuted ?
				'<i class="fa fa-video-camera"></i> Start Video' :
				'<i class="fa fa-video-camera"></i> Stop Video';
		}
	}

	playRingtone() {
		// Play repeating ringtone
		console.log('🔔 Playing ringtone (repeating beep pattern)');
		this.ringtoneInterval = setInterval(() => {
			this.playBeep(800, 0.3, 0.2); // 800Hz, 0.3s duration, 0.2 volume
		}, 2000); // Repeat every 2 seconds
	}

	stopRingtone() {
		console.log('🔇 Stopped ringtone');
		if (this.ringtoneInterval) {
			clearInterval(this.ringtoneInterval);
			this.ringtoneInterval = null;
		}
	}

	playCallingTone() {
		// Play single beep every 3 seconds
		console.log('📞 Playing calling tone (single beep pattern)');
		this.callingToneInterval = setInterval(() => {
			this.playBeep(440, 0.2, 0.2); // 440Hz, 0.2s duration, 0.2 volume
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
		const oscillator = this.audioContext.createOscillator();
		const gainNode = this.audioContext.createGain();

		oscillator.connect(gainNode);
		gainNode.connect(this.audioContext.destination);

		gainNode.gain.value = volume;
		oscillator.frequency.value = frequency;
		oscillator.type = 'sine';

		oscillator.start(this.audioContext.currentTime);
		oscillator.stop(this.audioContext.currentTime + duration);
	}

	getPendingCalls() {
		return this.pendingCalls || [];
	}

	addPendingCall(callData) {
		const existingIndex = this.pendingCalls.findIndex(c => c.call_id === callData.call_id);
		if (existingIndex === -1) {
			this.pendingCalls.push(callData);
			console.log('📋 Added to pending calls. Total:', this.pendingCalls.length);
		}
	}

	removePendingCall(callId) {
		const index = this.pendingCalls.findIndex(c => c.call_id === callId);
		if (index !== -1) {
			this.pendingCalls.splice(index, 1);
			console.log('📋 Removed from pending calls. Remaining:', this.pendingCalls.length);
		}
	}

	acceptCallFromNotification(callId, fromUser, callType) {
		// Same as acceptCall but called from notification badge
		this.acceptCall(callId, fromUser, callType);
	}

	rejectCallFromNotification(callId) {
		// Same as rejectCall but called from notification badge
		this.rejectCall(callId);
	}

	// 🆕 FIXED: Initialize showCallMenu as empty function initially
	// This prevents "Cannot set properties of undefined" error
	showCallMenu() {
		// This method will be replaced by the bundle file
		console.log('📞 showCallMenu placeholder - will be enhanced by bundle');
		frappe.msgprint(__('Please use the phone icon in the navbar to make calls'));
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
	// Wait for frappe to be fully loaded
	if (typeof frappe !== 'undefined') {
		console.log('🔵 F-IceCore v33: Creating FIceCoreUI instance...');
		window.FIceCoreUI = new FIceCoreCallUI();
		console.log('✅ F-IceCore v33: FIceCoreUI instance created successfully:', window.FIceCoreUI);
	} else {
		// Retry after a short delay if frappe isn't loaded yet
		setTimeout(function() {
			if (typeof frappe !== 'undefined') {
				console.log('🔵 F-IceCore v33: Creating FIceCoreUI instance (delayed)...');
				window.FIceCoreUI = new FIceCoreCallUI();
				console.log('✅ F-IceCore v33: FIceCoreUI instance created successfully:', window.FIceCoreUI);
			}
		}, 500);
	}
});
