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

		frappe.realtime.on(`f_icecore:incoming_call:${user}`, (data) => {
			console.log('Incoming call from:', data.from_user);
			this.showIncomingCallDialog(data);
			this.playRingtone();
		});

		frappe.realtime.on(`f_icecore:call_accepted:${user}`, (data) => {
			console.log('Call accepted by:', data.accepted_by);
			this.stopCallingTone();
		});

		frappe.realtime.on(`f_icecore:call_rejected:${user}`, (data) => {
			console.log('Call rejected by:', data.rejected_by);
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
		// Load ringtone
		this.ringtone = new Audio('data:audio/mp3;base64,');
		this.ringtone.loop = true;

		// Load calling tone
		this.callingTone = new Audio('data:audio/mp3;base64,');
		this.callingTone.loop = true;
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

		this.currentCallWindow = new frappe.ui.Dialog({
			title: __('Calling...'),
			static: true,
			size: 'large',
			fields: [
				{
					fieldtype: 'HTML',
					options: `
						<div class="f-icecore-calling" style="text-align: center; padding: 40px;">
							<div class="caller-avatar" style="margin-bottom: 20px;">
								<img src="${frappe.avatar(targetUser, "avatar-medium")}"
									style="width: 100px; height: 100px; border-radius: 50%;">
							</div>
							<h3 style="margin-bottom: 10px;">${userName}</h3>
							<p style="color: #888; margin-bottom: 30px;">
								${callTypeIcon} ${__('Calling...')}
							</p>
							<button class="btn btn-danger btn-lg" onclick="window.FIceCoreUI.hangup()">
								<i class="fa fa-phone-slash"></i> ${__('Cancel')}
							</button>
						</div>
					`
				}
			]
		});

		this.currentCallWindow.show();
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

	playRingtone() {
		if (this.ringtone) {
			this.ringtone.play().catch(e => console.error('Failed to play ringtone:', e));
		}
	}

	stopRingtone() {
		if (this.ringtone) {
			this.ringtone.pause();
			this.ringtone.currentTime = 0;
		}
	}

	playCallingTone() {
		if (this.callingTone) {
			this.callingTone.play().catch(e => console.error('Failed to play calling tone:', e));
		}
	}

	stopCallingTone() {
		if (this.callingTone) {
			this.callingTone.pause();
			this.callingTone.currentTime = 0;
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
