/**
 * F-IceCore Group WebRTC Engine — Full Mesh Topology
 *
 * Manages N-1 peer connections for group calls (max 5 participants by default).
 * Each participant connects to every other participant directly.
 *
 * Connection protocol (prevents offer collision):
 * - When a new user joins, all already-connected participants send offers to the joiner.
 * - The joiner only responds with answers, never initiates offers.
 *
 * Exposed as window.FIceCoreGroup
 */

class FIceCoreGroupWebRTC {
	constructor() {
		/**
		 * Map of userId -> { peerConnection, remoteStream, pendingIceCandidates }
		 */
		this.peers = new Map();

		this.localStream = null;
		this.groupCallId = null;
		this.callType = 'audio';
		this.isInitiator = false;
		this.isInGroupCall = false;

		// Callbacks for UI
		this.onParticipantStream = null;   // (userId, stream) => {}
		this.onParticipantJoined = null;   // (userId, userName) => {}
		this.onParticipantLeft = null;     // (userId) => {}
		this.onGroupCallEnded = null;      // () => {}
		this.onError = null;               // (error) => {}

		// Setup SocketIO listeners for group events
		this._setupRealtimeListeners();

		console.log('🔵 F-IceCore Group WebRTC Engine initialized');
	}

	// ============================================================
	// SocketIO Realtime Listeners (for group-specific events)
	// ============================================================

	_setupRealtimeListeners() {
		const user = frappe.session.user;

		// Listen for group WebRTC offers directed at us
		frappe.realtime.on(`f_icecore:group_webrtc_offer:${user}`, async (data) => {
			console.log('🔔 [Group] Received WebRTC offer from:', data.from_user);
			await this.handleGroupOffer(data);
		});

		// Listen for group WebRTC answers directed at us
		frappe.realtime.on(`f_icecore:group_webrtc_answer:${user}`, async (data) => {
			console.log('🔔 [Group] Received WebRTC answer from:', data.from_user);
			await this.handleGroupAnswer(data);
		});

		// Listen for group ICE candidates directed at us
		frappe.realtime.on(`f_icecore:group_ice_candidate:${user}`, async (data) => {
			console.log('🧊 [Group] Received ICE candidate from:', data.from_user);
			await this.handleGroupIceCandidate(data);
		});

		// Listen for participant joined
		frappe.realtime.on('f_icecore:group_participant_joined', async (data) => {
			console.log('👋 [Group] Participant joined:', data.user);
			await this.handleParticipantJoined(data);
		});

		// Listen for participant left
		frappe.realtime.on('f_icecore:group_participant_left', (data) => {
			console.log('👋 [Group] Participant left:', data.user);
			this.handleParticipantLeft(data);
		});

		// Listen for group call ended
		frappe.realtime.on('f_icecore:group_call_ended', (data) => {
			console.log('📵 [Group] Call ended:', data.reason);
			this.handleGroupCallEnded(data);
		});

		// Listen for incoming group call (notification)
		frappe.realtime.on('f_icecore:incoming_group_call', (data) => {
			console.log('🔔 [Group] Incoming group call:', data);
			if (window.FIceCoreUI && window.FIceCoreUI.handleIncomingGroupCall) {
				window.FIceCoreUI.handleIncomingGroupCall(data);
			}
		});

		// Listen for upgrade from 1:1 to group call
		frappe.realtime.on('f_icecore:upgrade_to_group_call', (data) => {
			console.log('🔄 [Group] Upgrade to group call:', data);
			if (window.FIceCoreUI && window.FIceCoreUI.handleUpgradeToGroupCall) {
				window.FIceCoreUI.handleUpgradeToGroupCall(data);
			}
		});
	}

	// ============================================================
	// Start Group Call (initiator side)
	// ============================================================

	/**
	 * Start a group call as the initiator.
	 * Gets local media, calls backend to create group call, then waits for joiners.
	 *
	 * @param {string[]} userEmails - Array of user emails to invite
	 * @param {string} callType - 'audio' or 'video'
	 */
	async startGroupCall(userEmails, callType = 'audio') {
		try {
			console.log('📞 [Group] Starting group call:', { userEmails, callType });

			this.callType = callType;
			this.isInitiator = true;
			this.isInGroupCall = true;

			// Get local media
			await this._getLocalMedia(callType);

			// Call backend to create group call session
			const response = await frappe.call({
				method: 'f_icecore.f_icecore.api.group_signaling.initiate_group_call',
				args: {
					participants_json: JSON.stringify(userEmails),
					call_type: callType
				}
			});

			const result = response.message;
			if (!result.success) {
				throw new Error('Failed to initiate group call');
			}

			this.groupCallId = result.group_call_id;

			console.log('✅ [Group] Group call created:', this.groupCallId);
			console.log('   Participants:', result.participants);

			// Show the group call UI window
			if (window.FIceCoreUI && window.FIceCoreUI.showGroupCallWindow) {
				window.FIceCoreUI.showGroupCallWindow(
					this.groupCallId,
					callType,
					result.participants
				);
			}

			// Update presence
			try {
				await frappe.call({
					method: 'f_icecore.f_icecore.api.presence.update_presence',
					args: { status: 'in_call', metadata: JSON.stringify({ group_call_id: this.groupCallId }) }
				});
			} catch (e) {
				console.warn('⚠️ [Group] Failed to update presence:', e);
			}

			return this.groupCallId;

		} catch (error) {
			console.error('❌ [Group] Failed to start group call:', error);
			this.isInGroupCall = false;
			if (this.onError) this.onError(error);
			throw error;
		}
	}

	// ============================================================
	// Join Group Call (joiner side)
	// ============================================================

	/**
	 * Join an existing group call. Gets media, notifies backend, waits for offers.
	 *
	 * @param {string} groupCallId - The group call session ID
	 * @param {string} callType - 'audio' or 'video'
	 */
	async joinGroupCall(groupCallId, callType = 'audio') {
		try {
			console.log('📞 [Group] Joining group call:', groupCallId);

			this.groupCallId = groupCallId;
			this.callType = callType;
			this.isInitiator = false;
			this.isInGroupCall = true;

			// Get local media
			await this._getLocalMedia(callType);

			// Accept the call in backend — returns list of already-connected users
			const response = await frappe.call({
				method: 'f_icecore.f_icecore.api.group_signaling.accept_group_call',
				args: { group_call_id: groupCallId }
			});

			const result = response.message;
			if (!result.success) {
				throw new Error('Failed to accept group call');
			}

			console.log('✅ [Group] Joined call. Connected users:', result.connected_users);

			// The connected users will send us offers (we just wait and respond with answers).
			// This is handled by handleGroupOffer() via SocketIO/polling.

			// Update presence
			try {
				await frappe.call({
					method: 'f_icecore.f_icecore.api.presence.update_presence',
					args: { status: 'in_call', metadata: JSON.stringify({ group_call_id: groupCallId }) }
				});
			} catch (e) {
				console.warn('⚠️ [Group] Failed to update presence:', e);
			}

			return result.connected_users;

		} catch (error) {
			console.error('❌ [Group] Failed to join group call:', error);
			this.isInGroupCall = false;
			if (this.onError) this.onError(error);
			throw error;
		}
	}

	// ============================================================
	// Leave Group Call
	// ============================================================

	/**
	 * Leave the current group call. Closes all peer connections, stops local media.
	 */
	async leaveGroupCall() {
		if (!this.isInGroupCall) return;

		console.log('📤 [Group] Leaving group call:', this.groupCallId);

		// Stop screen sharing if active
		if (this._isScreenSharing) {
			if (this._screenStream) {
				this._screenStream.getTracks().forEach(t => t.stop());
				this._screenStream = null;
			}
			if (this._savedCameraTrack) {
				this._savedCameraTrack.stop();
				this._savedCameraTrack = null;
			}
			this._isScreenSharing = false;
		}

		// Close all peer connections
		for (const [userId, peerData] of this.peers) {
			this._closePeerConnection(userId);
		}
		this.peers.clear();

		// Stop local media
		if (this.localStream) {
			this.localStream.getTracks().forEach(track => track.stop());
			this.localStream = null;
		}

		// Notify backend
		if (this.groupCallId) {
			try {
				await frappe.call({
					method: 'f_icecore.f_icecore.api.group_signaling.leave_group_call',
					args: { group_call_id: this.groupCallId }
				});
			} catch (e) {
				console.warn('⚠️ [Group] Failed to notify backend about leaving:', e);
			}
		}

		// Update presence back to online
		try {
			await frappe.call({
				method: 'f_icecore.f_icecore.api.presence.update_presence',
				args: { status: 'online' }
			});
		} catch (e) {
			console.warn('⚠️ [Group] Failed to update presence:', e);
		}

		// Reset state
		this.groupCallId = null;
		this.isInGroupCall = false;
		this.isInitiator = false;

		if (this.onGroupCallEnded) {
			this.onGroupCallEnded();
		}

		console.log('✅ [Group] Left group call');
	}

	// ============================================================
	// Peer Connection Management
	// ============================================================

	/**
	 * Create a new RTCPeerConnection for a specific user.
	 */
	_createPeerConnectionForUser(userId) {
		const iceServers = window.FIceCore?.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }];

		const pc = new RTCPeerConnection({ iceServers });

		const peerData = {
			peerConnection: pc,
			remoteStream: new MediaStream(),
			pendingIceCandidates: []
		};

		// Add local tracks to the peer connection
		if (this.localStream) {
			this.localStream.getTracks().forEach(track => {
				pc.addTrack(track, this.localStream);
			});
		} else {
			// No local media — add transceivers for receiving
			pc.addTransceiver('audio', { direction: 'recvonly' });
			if (this.callType === 'video') {
				pc.addTransceiver('video', { direction: 'recvonly' });
			}
		}

		// Handle ICE candidates
		pc.onicecandidate = (event) => {
			if (event.candidate) {
				this._sendIceCandidate(userId, event.candidate);
			}
		};

		// Handle incoming remote tracks
		pc.ontrack = (event) => {
			console.log(`📡 [Group] Remote track from ${userId}:`, event.track.kind);

			// Check if this track already exists in remoteStream (renegotiation scenario)
			const existingTrack = peerData.remoteStream.getTracks().find(
				t => t.kind === event.track.kind
			);
			if (existingTrack && existingTrack.id !== event.track.id) {
				// Replace old track with new one (e.g. camera→screen or screen→camera)
				peerData.remoteStream.removeTrack(existingTrack);
			}
			if (!peerData.remoteStream.getTracks().find(t => t.id === event.track.id)) {
				peerData.remoteStream.addTrack(event.track);
			}

			console.log(`📡 [Group] Remote stream for ${userId} now has ${peerData.remoteStream.getTracks().length} tracks`);

			if (this.onParticipantStream) {
				this.onParticipantStream(userId, peerData.remoteStream);
			}
		};

		// Handle connection state changes
		pc.onconnectionstatechange = () => {
			const state = pc.connectionState;
			console.log(`🔗 [Group] Connection state for ${userId}: ${state}`);

			if (state === 'connected') {
				console.log(`✅ [Group] Connected to ${userId}`);
				// Re-attach stream to ensure video element displays properly
				if (this.onParticipantStream && peerData.remoteStream.getTracks().length > 0) {
					this.onParticipantStream(userId, peerData.remoteStream);
				}
				// Update group call status in UI
				const statusEl = document.getElementById('group-call-status');
				if (statusEl) {
					statusEl.textContent = 'Connected';
					statusEl.style.color = '#28a745';
				}
				// Start duration timer
				if (window.FIceCoreUI && window.FIceCoreUI._groupStartDurationTimer) {
					window.FIceCoreUI._groupStartDurationTimer();
				}
			}

			if (state === 'failed') {
				console.warn(`⚠️ [Group] Connection to ${userId} failed`);
				// Update status dot
				const safeId = userId.replace(/[@.]/g, '-');
				const statusDot = document.getElementById(`group-status-${safeId}`);
				if (statusDot) {
					statusDot.classList.remove('connecting', 'connected');
					statusDot.classList.add('disconnected');
				}
			}

			if (state === 'closed') {
				console.warn(`⚠️ [Group] Connection to ${userId} closed`);
			}
		};

		pc.oniceconnectionstatechange = () => {
			const iceState = pc.iceConnectionState;
			console.log(`🧊 [Group] ICE state for ${userId}: ${iceState}`);

			// Some browsers fire ICE connected before peer connection connected
			if (iceState === 'connected' || iceState === 'completed') {
				if (this.onParticipantStream && peerData.remoteStream.getTracks().length > 0) {
					this.onParticipantStream(userId, peerData.remoteStream);
				}
			}
		};

		this.peers.set(userId, peerData);

		console.log(`✅ [Group] Created peer connection for ${userId}`);
		return peerData;
	}

	/**
	 * Close peer connection for a specific user.
	 */
	_closePeerConnection(userId) {
		const peerData = this.peers.get(userId);
		if (!peerData) return;

		if (peerData.peerConnection) {
			peerData.peerConnection.close();
		}

		this.peers.delete(userId);
		console.log(`🔌 [Group] Closed peer connection for ${userId}`);
	}

	// ============================================================
	// Send WebRTC signals
	// ============================================================

	/**
	 * Send an offer to a specific user in the group call.
	 */
	async _sendOfferToUser(userId) {
		const peerData = this.peers.get(userId);
		if (!peerData) {
			console.error(`❌ [Group] No peer data for ${userId}`);
			return;
		}

		try {
			const offer = await peerData.peerConnection.createOffer();
			await peerData.peerConnection.setLocalDescription(offer);

			await frappe.call({
				method: 'f_icecore.f_icecore.api.group_signaling.send_group_offer',
				args: {
					group_call_id: this.groupCallId,
					to_user: userId,
					offer_sdp: JSON.stringify(offer)
				}
			});

			console.log(`📤 [Group] Sent offer to ${userId}`);
		} catch (error) {
			console.error(`❌ [Group] Failed to send offer to ${userId}:`, error);
		}
	}

	/**
	 * Send ICE candidate to a specific user.
	 */
	async _sendIceCandidate(userId, candidate) {
		try {
			await frappe.call({
				method: 'f_icecore.f_icecore.api.group_signaling.send_group_ice_candidate',
				args: {
					group_call_id: this.groupCallId,
					to_user: userId,
					candidate: candidate.toJSON()
				}
			});
		} catch (error) {
			console.error(`❌ [Group] Failed to send ICE candidate to ${userId}:`, error);
		}
	}

	// ============================================================
	// Handle incoming WebRTC signals
	// ============================================================

	/**
	 * Handle a WebRTC offer from a peer (we are the joiner).
	 * Create a peer connection, set remote desc, create and send answer.
	 */
	async handleGroupOffer(data) {
		const { from_user, offer, group_call_id } = data;

		if (group_call_id && group_call_id !== this.groupCallId) {
			console.warn(`⚠️ [Group] Offer for unknown call ${group_call_id}, ignoring`);
			return;
		}

		try {
			// Create peer connection for this user (if not exists)
			let peerData = this.peers.get(from_user);
			if (!peerData) {
				peerData = this._createPeerConnectionForUser(from_user);
			}

			// Set remote description
			const offerDesc = JSON.parse(offer);
			await peerData.peerConnection.setRemoteDescription(new RTCSessionDescription(offerDesc));

			// Process any pending ICE candidates
			await this._processPendingIceCandidates(from_user);

			// Create and send answer
			const answer = await peerData.peerConnection.createAnswer();
			await peerData.peerConnection.setLocalDescription(answer);

			await frappe.call({
				method: 'f_icecore.f_icecore.api.group_signaling.send_group_answer',
				args: {
					group_call_id: this.groupCallId,
					to_user: from_user,
					answer_sdp: JSON.stringify(answer)
				}
			});

			console.log(`📤 [Group] Sent answer to ${from_user}`);

		} catch (error) {
			console.error(`❌ [Group] Failed to handle offer from ${from_user}:`, error);
		}
	}

	/**
	 * Handle a WebRTC answer from a peer (we sent the offer, they respond with answer).
	 */
	async handleGroupAnswer(data) {
		const { from_user, answer } = data;

		const peerData = this.peers.get(from_user);
		if (!peerData) {
			console.warn(`⚠️ [Group] No peer connection for ${from_user}, ignoring answer`);
			return;
		}

		try {
			const answerDesc = JSON.parse(answer);
			await peerData.peerConnection.setRemoteDescription(new RTCSessionDescription(answerDesc));

			console.log(`✅ [Group] Set remote answer from ${from_user}`);

			// Process any pending ICE candidates
			await this._processPendingIceCandidates(from_user);

		} catch (error) {
			console.error(`❌ [Group] Failed to handle answer from ${from_user}:`, error);
		}
	}

	/**
	 * Handle an ICE candidate from a peer.
	 */
	async handleGroupIceCandidate(data) {
		const { from_user, candidate } = data;

		const peerData = this.peers.get(from_user);

		if (!peerData || !peerData.peerConnection.remoteDescription) {
			// Queue the ICE candidate until peer connection is ready
			if (!peerData) {
				// Create a placeholder for pending candidates
				if (!this._pendingCandidatesForUnknownPeers) {
					this._pendingCandidatesForUnknownPeers = new Map();
				}
				if (!this._pendingCandidatesForUnknownPeers.has(from_user)) {
					this._pendingCandidatesForUnknownPeers.set(from_user, []);
				}
				this._pendingCandidatesForUnknownPeers.get(from_user).push(candidate);
			} else {
				peerData.pendingIceCandidates.push(candidate);
			}
			console.log(`⏳ [Group] Queued ICE candidate from ${from_user}`);
			return;
		}

		try {
			let candidateData = typeof candidate === 'string' ? JSON.parse(candidate) : candidate;
			const iceCandidate = new RTCIceCandidate(candidateData);
			await peerData.peerConnection.addIceCandidate(iceCandidate);
			console.log(`✅ [Group] Added ICE candidate from ${from_user}`);
		} catch (error) {
			console.error(`❌ [Group] Failed to add ICE candidate from ${from_user}:`, error);
		}
	}

	/**
	 * Process queued ICE candidates for a user after their peer connection is ready.
	 */
	async _processPendingIceCandidates(userId) {
		const peerData = this.peers.get(userId);
		if (!peerData) return;

		// Process candidates queued in peerData
		const pending = peerData.pendingIceCandidates;
		if (pending.length > 0) {
			console.log(`🧊 [Group] Processing ${pending.length} pending ICE candidates for ${userId}`);
			for (const candidate of pending) {
				try {
					let candidateData = typeof candidate === 'string' ? JSON.parse(candidate) : candidate;
					await peerData.peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
				} catch (e) {
					console.error(`❌ [Group] Failed to add pending ICE candidate for ${userId}:`, e);
				}
			}
			peerData.pendingIceCandidates = [];
		}

		// Process candidates that arrived before peer connection existed
		if (this._pendingCandidatesForUnknownPeers && this._pendingCandidatesForUnknownPeers.has(userId)) {
			const unknownPending = this._pendingCandidatesForUnknownPeers.get(userId);
			console.log(`🧊 [Group] Processing ${unknownPending.length} early ICE candidates for ${userId}`);
			for (const candidate of unknownPending) {
				try {
					let candidateData = typeof candidate === 'string' ? JSON.parse(candidate) : candidate;
					await peerData.peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
				} catch (e) {
					console.error(`❌ [Group] Failed to add early ICE candidate for ${userId}:`, e);
				}
			}
			this._pendingCandidatesForUnknownPeers.delete(userId);
		}
	}

	// ============================================================
	// Handle participant events
	// ============================================================

	/**
	 * Handle when a new participant joins the group call.
	 * If we're already connected, we send them an offer.
	 */
	async handleParticipantJoined(data) {
		const { user, user_name, group_call_id } = data;

		if (group_call_id && group_call_id !== this.groupCallId) {
			return; // Not our call
		}

		if (!this.isInGroupCall) return;

		console.log(`👋 [Group] New participant: ${user} (${user_name})`);

		// Notify UI
		if (this.onParticipantJoined) {
			this.onParticipantJoined(user, user_name);
		}

		// We are an already-connected participant, so WE send the offer to the joiner
		// (This prevents offer collision — the joiner never initiates offers)
		let peerData = this.peers.get(user);
		if (!peerData) {
			peerData = this._createPeerConnectionForUser(user);
		}

		// Small delay to let the joiner finish setup
		await new Promise(resolve => setTimeout(resolve, 500));

		await this._sendOfferToUser(user);
	}

	/**
	 * Handle when a participant leaves the group call.
	 */
	handleParticipantLeft(data) {
		const { user, user_name, group_call_id } = data;

		if (group_call_id && group_call_id !== this.groupCallId) {
			return; // Not our call
		}

		console.log(`👋 [Group] Participant left: ${user} (${user_name})`);

		// Close their peer connection
		this._closePeerConnection(user);

		// Notify UI
		if (this.onParticipantLeft) {
			this.onParticipantLeft(user);
		}
	}

	/**
	 * Handle group call ended by server.
	 */
	handleGroupCallEnded(data) {
		console.log('📵 [Group] Call ended by server');

		// Stop screen sharing if active
		if (this._isScreenSharing) {
			if (this._screenStream) {
				this._screenStream.getTracks().forEach(t => t.stop());
				this._screenStream = null;
			}
			if (this._savedCameraTrack) {
				this._savedCameraTrack.stop();
				this._savedCameraTrack = null;
			}
			this._isScreenSharing = false;
		}

		// Close all peer connections
		for (const [userId] of this.peers) {
			this._closePeerConnection(userId);
		}
		this.peers.clear();

		// Stop local media
		if (this.localStream) {
			this.localStream.getTracks().forEach(track => track.stop());
			this.localStream = null;
		}

		// Reset state
		this.groupCallId = null;
		this.isInGroupCall = false;
		this.isInitiator = false;

		if (this.onGroupCallEnded) {
			this.onGroupCallEnded();
		}
	}

	// ============================================================
	// Media
	// ============================================================

	async _getLocalMedia(callType) {
		try {
			if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
				console.warn('⚠️ [Group] navigator.mediaDevices not available');
				return;
			}

			const constraints = callType === 'video'
				? {
					audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
					video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } }
				}
				: {
					audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
					video: false
				};

			this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
			console.log('✅ [Group] Got local media:', this.localStream.getTracks().map(t => t.kind));

		} catch (error) {
			console.warn('⚠️ [Group] Failed to get local media:', error.message);
			// Continue without local media — one-way audio
		}
	}

	// ============================================================
	// Audio/Video toggles for group call
	// ============================================================

	toggleAudio(muted) {
		if (this.localStream) {
			this.localStream.getAudioTracks().forEach(track => {
				track.enabled = !muted;
			});
		}
	}

	toggleVideo(muted) {
		if (this.localStream) {
			this.localStream.getVideoTracks().forEach(track => {
				track.enabled = !muted;
			});
		}
	}

	// ============================================================
	// Screen Sharing for Group Calls
	// ============================================================

	/**
	 * Toggle screen sharing on/off for group call.
	 * Replaces video track on ALL peer connections with screen capture track.
	 * Returns true if screen sharing is now active, false if stopped.
	 */
	async toggleScreenShare() {
		if (this._isScreenSharing) {
			await this.stopScreenShare();
			return false;
		} else {
			const started = await this.startScreenShare();
			return started;
		}
	}

	/**
	 * Start screen sharing in a group call.
	 * Gets display media, replaces video track on all peer connections.
	 * For audio-only calls, adds the track and renegotiates with all peers.
	 */
	async startScreenShare() {
		try {
			if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
				console.error('❌ [Group] getDisplayMedia not available');
				frappe.show_alert({
					message: __('Screen sharing is not available. Use HTTPS for screen sharing.'),
					indicator: 'red'
				}, 5);
				return false;
			}

			if (!this.isInGroupCall || this.peers.size === 0) {
				console.error('❌ [Group] No active group call for screen share');
				return false;
			}

			console.log('🖥️ [Group] Starting screen share...');

			// Get screen capture stream
			const screenStream = await navigator.mediaDevices.getDisplayMedia({
				video: {
					cursor: 'always',
					width: { ideal: 1920 },
					height: { ideal: 1080 },
					frameRate: { ideal: 30 }
				},
				audio: false
			});

			const screenTrack = screenStream.getVideoTracks()[0];
			if (!screenTrack) {
				console.error('❌ [Group] No video track from getDisplayMedia');
				return false;
			}

			// Save current camera track so we can restore it later
			this._savedCameraTrack = null;
			if (this.localStream) {
				const cameraTrack = this.localStream.getVideoTracks()[0];
				if (cameraTrack) {
					this._savedCameraTrack = cameraTrack;
				}
			}

			// Replace/add screen track on ALL peer connections
			let needsRenegotiation = false;

			for (const [userId, peerData] of this.peers) {
				const pc = peerData.peerConnection;
				const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');

				if (videoSender) {
					// Replace existing video track with screen track
					await videoSender.replaceTrack(screenTrack);
					console.log(`✅ [Group] Replaced video track with screen track for ${userId}`);
				} else {
					// Audio-only call — add screen track, needs renegotiation
					pc.addTrack(screenTrack, screenStream);
					console.log(`✅ [Group] Added screen track for ${userId} (was audio-only)`);
					needsRenegotiation = true;
				}
			}

			// If we added a new track (audio-only call), renegotiate with ALL peers
			if (needsRenegotiation) {
				for (const [userId, peerData] of this.peers) {
					try {
						const offer = await peerData.peerConnection.createOffer();
						await peerData.peerConnection.setLocalDescription(offer);

						await frappe.call({
							method: 'f_icecore.f_icecore.api.group_signaling.send_group_offer',
							args: {
								group_call_id: this.groupCallId,
								to_user: userId,
								offer_sdp: JSON.stringify(offer)
							}
						});
						console.log(`📤 [Group] Sent renegotiation offer to ${userId} for screen share`);
					} catch (e) {
						console.error(`❌ [Group] Renegotiation failed for ${userId}:`, e);
					}
				}
			}

			// Update local stream reference
			if (!this.localStream) {
				this.localStream = new MediaStream();
			}
			this.localStream.getVideoTracks().forEach(t => {
				if (t !== screenTrack) {
					this.localStream.removeTrack(t);
				}
			});
			this.localStream.addTrack(screenTrack);

			// Update local video preview
			const localVideo = document.getElementById('group-local-video');
			if (localVideo) {
				localVideo.srcObject = this.localStream;
			}

			// Store references for cleanup
			this._screenStream = screenStream;
			this._isScreenSharing = true;

			// Listen for user stopping screen share via browser's built-in "Stop sharing" button
			screenTrack.onended = () => {
				console.log('🖥️ [Group] User stopped screen sharing via browser UI');
				this.stopScreenShare();
				// Notify CallUI to update button state
				if (window.FIceCoreUI) {
					window.FIceCoreUI._updateGroupScreenShareButton(false);
				}
			};

			console.log('✅ [Group] Screen sharing started successfully');
			return true;

		} catch (error) {
			if (error.name === 'NotAllowedError') {
				console.log('🖥️ [Group] User cancelled screen share picker');
			} else {
				console.error('❌ [Group] Failed to start screen share:', error);
				frappe.show_alert({
					message: __('Failed to start screen sharing: ') + error.message,
					indicator: 'red'
				}, 5);
			}
			return false;
		}
	}

	/**
	 * Stop screen sharing and restore the camera video track (or remove video).
	 */
	async stopScreenShare() {
		try {
			if (!this._isScreenSharing) return;

			console.log('🖥️ [Group] Stopping screen share...');

			// Stop screen capture tracks
			if (this._screenStream) {
				this._screenStream.getTracks().forEach(t => t.stop());
				this._screenStream = null;
			}

			// Restore/remove video track on all peer connections
			for (const [userId, peerData] of this.peers) {
				const pc = peerData.peerConnection;
				const videoSender = pc.getSenders().find(s =>
					s.track && s.track.kind === 'video'
				);

				if (videoSender && this._savedCameraTrack && this._savedCameraTrack.readyState === 'live') {
					// Restore camera track
					await videoSender.replaceTrack(this._savedCameraTrack);
					console.log(`✅ [Group] Restored camera track for ${userId}`);
				} else if (videoSender) {
					// No camera to restore (was audio-only) — send null
					await videoSender.replaceTrack(null);
					console.log(`✅ [Group] Removed screen track for ${userId} (no camera to restore)`);
				}
			}

			// Update local stream
			if (this.localStream) {
				this.localStream.getVideoTracks().forEach(t => {
					t.stop();
					this.localStream.removeTrack(t);
				});
				if (this._savedCameraTrack && this._savedCameraTrack.readyState === 'live') {
					this.localStream.addTrack(this._savedCameraTrack);
				}
			}

			// Update local video preview
			const localVideo = document.getElementById('group-local-video');
			if (localVideo && this.localStream) {
				localVideo.srcObject = this.localStream;
			}

			this._savedCameraTrack = null;
			this._isScreenSharing = false;

			console.log('✅ [Group] Screen sharing stopped');

		} catch (error) {
			console.error('❌ [Group] Failed to stop screen share:', error);
		}
	}

	// ============================================================
	// Utility
	// ============================================================

	getConnectedPeerCount() {
		let count = 0;
		for (const [, peerData] of this.peers) {
			if (peerData.peerConnection.connectionState === 'connected') {
				count++;
			}
		}
		return count;
	}

	getPeerIds() {
		return Array.from(this.peers.keys());
	}
}

// Initialize Group WebRTC engine
window.FIceCoreGroup = new FIceCoreGroupWebRTC();
