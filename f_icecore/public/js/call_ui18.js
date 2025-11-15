/**
 * F-IceCore Call UI
 * Discord-like calling interface
 */

class FIceCoreCallUI {
	constructor() {
		this.currentCallWindow = null;
		this.incomingCallDialog = null;
		this.isAudioMuted = false;
		this.isVideoMuted = false;
		this.ringtone = null;
		this.callingTone = null;

		this.init();
	}

	init() {
		// Setup realtime listeners for incoming calls
		this.setupIncomingCallListener();

		// Setup call control handlers
		this.setupCallControls();

		// Load audio assets
		this.loadAudioAssets();
	}

	setupIncomingCallListener() {
		const user = frappe.session.user;

		// Listen for incoming calls (event sent with user= parameter, no suffix needed)
		frappe.realtime.on('f_icecore:incoming_call', (data) => {
			console.log('📞 F-IceCore: Incoming call from:', data.from_user);
			console.log('📞 F-IceCore: Call data:', data);
			this.showIncomingCallDialog(data);
			this.playRingtone();
		});

		frappe.realtime.on('f_icecore:call_accepted', (data) => {
			console.log('✅ F-IceCore: Call accepted by:', data.accepted_by);
			this.stopCallingTone();
		});

		frappe.realtime.on('f_icecore:call_rejected', (data) => {
			console.log('❌ F-IceCore: Call rejected by:', data.rejected_by);
			this.stopCallingTone();
			frappe.show_alert({
				message: __('Call was declined'),
				indicator: 'red'
			}, 5);
			this.closeCallWindow();
		});
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

		this.incomingCallDialog = new frappe.ui.Dialog({
			title: __('Incoming Call'),
			static: true,
			fields: [
				{
					fieldtype: 'HTML',
					options: `
						<div class="f-icecore-incoming-call" style="text-align: center; padding: 30px;">
							<div class="caller-avatar" style="margin-bottom: 20px;">
								<img src="${frappe.avatar(from_user, "avatar-medium")}"
									style="width: 80px; height: 80px; border-radius: 50%;">
							</div>
							<h3 style="margin-bottom: 10px;">${from_user_name}</h3>
							<p style="color: #888; margin-bottom: 30px;">
								${callTypeIcon} ${__(callType.charAt(0).toUpperCase() + callType.slice(1))} Call
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
					`
				}
			]
		});

		this.incomingCallDialog.show();
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

		} catch (error) {
			console.error('Failed to reject call:', error);
		}
	}

	showCallingWindow(targetUser, callType, callId) {
		const userName = frappe.boot.user_info[targetUser]?.fullname || targetUser;
		const callTypeIcon = callType === 'video' ? '📹' : (callType === 'screen' ? '🖥️' : '📞');
		const avatarUrl = frappe.avatar(targetUser, 'avatar-medium');

		this.currentCallWindow = new frappe.ui.Dialog({
			title: __('Calling...'),
			static: true,
			size: 'large',
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
					<div class="caller-avatar" style="margin-bottom: 20px;">
						<img src="${avatarUrl}" style="width: 100px; height: 100px; border-radius: 50%;">
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
		}, 50);
	}

	showCallWindow(remoteUser, callType, callId, isCaller) {
		const userName = frappe.boot.user_info[remoteUser]?.fullname || remoteUser;
		const hasVideo = callType === 'video' || callType === 'screen';

		this.currentCallWindow = new frappe.ui.Dialog({
			title: __('In Call'),
			static: true,
			size: 'extra-large',
			fields: [
				{
					fieldtype: 'HTML',
					options: `
						<div class="f-icecore-call-window">
							<div class="video-container" style="position: relative; background: #000; min-height: 500px; border-radius: 8px;">
								${hasVideo ? `
									<video id="f-icecore-remote-video" autoplay playsinline
										style="width: 100%; height: 500px; object-fit: cover; border-radius: 8px;">
									</video>
									<video id="f-icecore-local-video" autoplay playsinline muted
										style="position: absolute; bottom: 20px; right: 20px; width: 200px; height: 150px;
										object-fit: cover; border-radius: 8px; border: 2px solid #fff;">
									</video>
								` : `
									<div style="display: flex; align-items: center; justify-content: center; height: 500px;">
										<div style="text-align: center;">
											<img src="${frappe.avatar(remoteUser, "avatar-medium")}"
												style="width: 120px; height: 120px; border-radius: 50%; margin-bottom: 20px;">
											<h3 style="color: #fff;">${userName}</h3>
											<p style="color: #aaa;" id="call-duration">00:00</p>
										</div>
									</div>
								`}
							</div>

							<div class="call-controls" style="display: flex; justify-content: center; gap: 15px; margin-top: 20px; padding: 20px;">
								<button class="btn btn-secondary btn-lg" id="toggle-audio" onclick="window.FIceCoreUI.toggleAudio()">
									<i class="fa fa-microphone"></i>
								</button>
								${hasVideo ? `
									<button class="btn btn-secondary btn-lg" id="toggle-video" onclick="window.FIceCoreUI.toggleVideo()">
										<i class="fa fa-video"></i>
									</button>
								` : ''}
								<button class="btn btn-danger btn-lg" onclick="window.FIceCoreUI.hangup()">
									<i class="fa fa-phone-slash"></i> ${__('End Call')}
								</button>
							</div>
						</div>
					`
				}
			]
		});

		this.currentCallWindow.show();

		// Setup WebRTC stream handlers
		this.setupStreamHandlers(hasVideo);

		// Start call duration counter
		this.startCallDurationCounter();
	}

	setupStreamHandlers(hasVideo) {
		// Handle local stream
		window.FIceCore.onLocalStream = (stream) => {
			if (hasVideo) {
				const localVideo = document.getElementById('f-icecore-local-video');
				if (localVideo) {
					localVideo.srcObject = stream;
				}
			}
		};

		// Handle remote stream
		window.FIceCore.onRemoteStream = (stream) => {
			if (hasVideo) {
				const remoteVideo = document.getElementById('f-icecore-remote-video');
				if (remoteVideo) {
					remoteVideo.srcObject = stream;
				}
			}
		};

		// Handle call ended
		window.FIceCore.onCallEnded = () => {
			this.closeCallWindow();
		};

		// Handle errors
		window.FIceCore.onError = (error) => {
			frappe.msgprint({
				title: __('Call Error'),
				message: error.toString(),
				indicator: 'red'
			});
			this.closeCallWindow();
		};
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
window.FIceCoreUI = new FIceCoreCallUI();
