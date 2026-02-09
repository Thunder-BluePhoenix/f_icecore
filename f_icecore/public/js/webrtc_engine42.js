/**
 * F-IceCore WebRTC Engine v37 - With HTTP Polling Fallback
 * Handles peer connections, media streams, and WebRTC logic
 *
 * NEW: When SocketIO is disconnected (e.g. mobile via IP address),
 * automatically falls back to HTTP polling for receiving signals
 * (offers, answers, ICE candidates, call events).
 */

class FIceCoreWebRTC {
	constructor() {
		this.peerConnection = null;
		this.localStream = null;
		this.remoteStream = null;
		this.iceServers = [];
		this.callId = null;
		this.remoteUser = null;
		this.callType = 'audio'; // 'audio', 'video', 'screen'
		this.isCaller = false;
		this.pendingIceCandidates = []; // Queue for ICE candidates that arrive before peer connection is ready

		// Store incoming offer until user accepts
		this.pendingOffer = null;
		this.pendingOfferData = null;

		// HTTP Polling fallback state
		this._pollingInterval = null;
		this._pollingActive = false;
		this._socketConnected = false;

		// Event callbacks
		this.onRemoteStream = null;
		this.onLocalStream = null;
		this.onCallEnded = null;
		this.onError = null;
		this.onConnectionStateChange = null;

		// Call Recording state
		this._mediaRecorder = null;
		this._recordedChunks = [];
		this._recordingId = null;
		this._isRecording = false;

		// Initialize
		this.init();
	}

	async init() {
		// Load ICE servers configuration
		await this.loadIceServers();

		// Setup realtime listeners (SocketIO)
		this.setupRealtimeListeners();

		// Start presence heartbeat
		this.startPresenceHeartbeat();

		// Check SocketIO connection and start polling if needed
		this._checkSocketAndStartPolling();
	}

	// ============================================================
	// HTTP Polling Fallback
	// ============================================================

	/**
	 * Check if SocketIO is connected. If not, start HTTP polling.
	 * Also monitors for SocketIO reconnection to stop polling.
	 */
	_checkSocketAndStartPolling() {
		// Check initial state
		const connected = frappe.socketio?.socket?.connected || false;
		this._socketConnected = connected;
		console.log(`🔌 F-IceCore: SocketIO connected = ${connected}`);

		if (!connected) {
			console.log('⚠️ F-IceCore: SocketIO NOT connected! Starting HTTP polling fallback...');
			this._startPolling();
		}

		// Monitor for connect/disconnect events
		if (frappe.socketio?.socket) {
			frappe.socketio.socket.on('connect', () => {
				console.log('🔌 F-IceCore: SocketIO CONNECTED! Stopping polling...');
				this._socketConnected = true;
				this._stopPolling();
			});

			frappe.socketio.socket.on('disconnect', () => {
				console.log('⚠️ F-IceCore: SocketIO DISCONNECTED! Starting polling...');
				this._socketConnected = false;
				this._startPolling();
			});

			frappe.socketio.socket.on('connect_error', () => {
				if (!this._pollingActive) {
					console.log('⚠️ F-IceCore: SocketIO connect_error! Starting polling...');
					this._socketConnected = false;
					this._startPolling();
				}
			});
		} else {
			// No socket object at all — definitely need polling
			console.log('⚠️ F-IceCore: No SocketIO socket object! Starting HTTP polling...');
			this._startPolling();
		}

		// Periodic re-check every 10 seconds in case SocketIO state changes
		setInterval(() => {
			const nowConnected = frappe.socketio?.socket?.connected || false;
			if (nowConnected && !this._socketConnected) {
				console.log('🔌 F-IceCore: SocketIO reconnected (periodic check)');
				this._socketConnected = true;
				this._stopPolling();
			} else if (!nowConnected && !this._pollingActive) {
				console.log('⚠️ F-IceCore: SocketIO still disconnected (periodic check), restarting polling');
				this._socketConnected = false;
				this._startPolling();
			}
		}, 10000);
	}

	/**
	 * Start HTTP polling for signals every 1.5 seconds.
	 */
	_startPolling() {
		if (this._pollingActive) {
			return; // Already polling
		}
		this._pollingActive = true;
		console.log('📡 F-IceCore: HTTP polling started (every 1.5s)');

		this._pollingInterval = setInterval(() => {
			this._pollSignals();
		}, 1500);

		// Also poll immediately
		this._pollSignals();
	}

	/**
	 * Stop HTTP polling.
	 */
	_stopPolling() {
		if (!this._pollingActive) {
			return;
		}
		this._pollingActive = false;
		if (this._pollingInterval) {
			clearInterval(this._pollingInterval);
			this._pollingInterval = null;
		}
		console.log('📡 F-IceCore: HTTP polling stopped');
	}

	/**
	 * Poll the server for pending signals and dispatch them.
	 */
	async _pollSignals() {
		try {
			const response = await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.poll_signals',
				type: 'GET',
				async: true,
				// Don't show loading indicator for background polling
				freeze: false
			});

			const signals = response?.message || [];

			if (signals.length > 0) {
				console.log(`📡 F-IceCore: Polled ${signals.length} signal(s)`);

				// Sort signals so that answers and offers are processed BEFORE ICE candidates.
				// When polling returns a batch, the answer may appear after ICE candidates
				// in the queue, but we need the answer first to set remoteDescription.
				const priority = {
					'f_icecore:incoming_call': 0,
					'f_icecore:incoming_group_call': 0,
				'f_icecore:upgrade_to_group_call': 0,
					'call_accepted': 1,
					'f_icecore:group_participant_joined': 1,
					'f_icecore:webrtc_offer': 2,
					'f_icecore:group_webrtc_offer': 2,
					'f_icecore:webrtc_answer': 3,
					'f_icecore:group_webrtc_answer': 3,
					'f_icecore:ice_candidate': 4,
					'f_icecore:group_ice_candidate': 4,
					'call_rejected': 5,
					'call_ended': 6,
					'f_icecore:group_participant_left': 6,
					'f_icecore:group_call_ended': 6,
					'f_icecore:transfer_incoming': 1,
					'f_icecore:transfer_notify': 5,
					'f_icecore:transfer_completed': 1,
					'f_icecore:transfer_failed': 5,
					'f_icecore:transfer_cancelled': 5,
					'f_icecore:test_ping': 7
				};
				signals.sort((a, b) => {
					const pa = priority[a.event] ?? 99;
					const pb = priority[b.event] ?? 99;
					return pa - pb;
				});
			}

			for (const signal of signals) {
				await this._dispatchPolledSignal(signal);
			}
		} catch (error) {
			// Silently ignore polling errors (network issues, etc.)
			// Will retry on next interval
		}
	}

	/**
	 * Dispatch a polled signal to the appropriate handler.
	 * Mimics what SocketIO event listeners would do.
	 */
	async _dispatchPolledSignal(signal) {
		const { event, message } = signal;
		console.log(`📡 F-IceCore: Processing polled signal: ${event}`);

		switch (event) {
			case 'f_icecore:incoming_call':
				// Incoming call notification - dispatch to CallUI
				console.log('📡 [POLL] Incoming call from:', message.from_user);
				if (window.FIceCoreUI) {
					window.FIceCoreUI.handleIncomingCall(message);
				}
				break;

			case 'f_icecore:webrtc_offer':
				// WebRTC offer received
				console.log('📡 [POLL] WebRTC offer from:', message.from_user);
				this.storePendingOffer(message);
				break;

			case 'f_icecore:webrtc_answer':
				// WebRTC answer received
				console.log('📡 [POLL] WebRTC answer from:', message.from_user);
				await this.handleRemoteAnswer(message);
				break;

			case 'f_icecore:ice_candidate':
				// ICE candidate received
				console.log('📡 [POLL] ICE candidate from:', message.from_user);
				await this.handleRemoteIceCandidate(message);
				break;

			case 'call_accepted':
				// Call accepted by recipient
				console.log('📡 [POLL] Call accepted:', message);
				if (window.FIceCoreUI) {
					// Trigger the same logic as the SocketIO listener
					const user = frappe.session.user;
					if (message.from_user === user) {
						window.FIceCoreUI.stopCallingTone();
						frappe.show_alert({
							message: __('Call accepted! Connecting...'),
							indicator: 'green'
						}, 3);
						const callType = window.FIceCore?.callType || 'audio';
						const callId = message.call_id;
						const remoteUser = message.accepted_by || message.to_user;
						window.FIceCoreUI.showCallWindow(remoteUser, callType, callId, true);
					}
					window.FIceCoreUI.removePendingCall(message.call_id);
				}
				break;

			case 'call_rejected':
				// Call rejected
				console.log('📡 [POLL] Call rejected:', message);
				if (window.FIceCoreUI) {
					const user = frappe.session.user;
					if (message.from_user === user) {
						window.FIceCoreUI.stopCallingTone();
						if (window.FIceCoreUI.currentCallWindow) {
							window.FIceCoreUI.currentCallWindow.hide();
							window.FIceCoreUI.currentCallWindow = null;
						}
						frappe.show_alert({
							message: __('Call was declined'),
							indicator: 'red'
						}, 5);
					}
					window.FIceCoreUI.removePendingCall(message.call_id);
				}
				break;

			case 'call_ended':
				// Call ended
				console.log('📡 [POLL] Call ended:', message);
				if (window.FIceCoreUI) {
					window.FIceCoreUI.handleCallEnded();
					window.FIceCoreUI.removePendingCall(message.call_id);
				}
				break;

			case 'f_icecore:test_ping':
				// Test ping
				console.log('📡 [POLL] Test ping from:', message.from_user);
				frappe.show_alert({
					message: `Test ping from ${message.from_user}! (via polling)`,
					indicator: 'green'
				}, 5);
				break;

			// ============================================================
			// Group Call Events (dispatched to FIceCoreGroup engine)
			// ============================================================

			case 'f_icecore:incoming_group_call':
				console.log('📡 [POLL] Incoming group call from:', message.initiator);
				if (window.FIceCoreUI && window.FIceCoreUI.handleIncomingGroupCall) {
					window.FIceCoreUI.handleIncomingGroupCall(message);
				}
				break;

			case 'f_icecore:upgrade_to_group_call':
				console.log('📡 [POLL] Upgrade to group call:', message.group_call_id);
				if (window.FIceCoreUI && window.FIceCoreUI.handleUpgradeToGroupCall) {
					window.FIceCoreUI.handleUpgradeToGroupCall(message);
				}
				break;

			case 'f_icecore:group_participant_joined':
				console.log('📡 [POLL] Group participant joined:', message.user);
				if (window.FIceCoreGroup) {
					await window.FIceCoreGroup.handleParticipantJoined(message);
				}
				break;

			case 'f_icecore:group_participant_left':
				console.log('📡 [POLL] Group participant left:', message.user);
				if (window.FIceCoreGroup) {
					window.FIceCoreGroup.handleParticipantLeft(message);
				}
				break;

			case 'f_icecore:group_call_ended':
				console.log('📡 [POLL] Group call ended:', message.reason);
				if (window.FIceCoreGroup) {
					window.FIceCoreGroup.handleGroupCallEnded(message);
				}
				break;

			case 'f_icecore:group_webrtc_offer':
				console.log('📡 [POLL] Group WebRTC offer from:', message.from_user);
				if (window.FIceCoreGroup) {
					await window.FIceCoreGroup.handleGroupOffer(message);
				}
				break;

			case 'f_icecore:group_webrtc_answer':
				console.log('📡 [POLL] Group WebRTC answer from:', message.from_user);
				if (window.FIceCoreGroup) {
					await window.FIceCoreGroup.handleGroupAnswer(message);
				}
				break;

			case 'f_icecore:group_ice_candidate':
				console.log('📡 [POLL] Group ICE candidate from:', message.from_user);
				if (window.FIceCoreGroup) {
					await window.FIceCoreGroup.handleGroupIceCandidate(message);
				}
				break;

			// ============================================================
			// Call Transfer Events
			// ============================================================

			case 'f_icecore:transfer_incoming':
				console.log('📡 [POLL] Transfer incoming:', message.transfer_id);
				if (window.FIceCoreUI && window.FIceCoreUI.handleTransferIncoming) {
					window.FIceCoreUI.handleTransferIncoming(message);
				}
				break;

			case 'f_icecore:transfer_notify':
				console.log('📡 [POLL] Transfer notify:', message.transfer_id);
				if (window.FIceCoreUI && window.FIceCoreUI.handleTransferNotify) {
					window.FIceCoreUI.handleTransferNotify(message);
				}
				break;

			case 'f_icecore:transfer_completed':
				console.log('📡 [POLL] Transfer completed:', message.transfer_id);
				if (window.FIceCoreUI && window.FIceCoreUI.handleTransferCompleted) {
					window.FIceCoreUI.handleTransferCompleted(message);
				}
				break;

			case 'f_icecore:transfer_failed':
				console.log('📡 [POLL] Transfer failed:', message.transfer_id);
				if (window.FIceCoreUI && window.FIceCoreUI.handleTransferFailed) {
					window.FIceCoreUI.handleTransferFailed(message);
				}
				break;

			case 'f_icecore:transfer_cancelled':
				console.log('📡 [POLL] Transfer cancelled:', message.transfer_id);
				if (window.FIceCoreUI && window.FIceCoreUI.handleTransferCancelled) {
					window.FIceCoreUI.handleTransferCancelled(message);
				}
				break;

			default:
				console.log(`📡 [POLL] Unknown signal event: ${event}`);
				break;
		}
	}

	// ============================================================
	// ICE Servers
	// ============================================================

	async loadIceServers() {
		try {
			const response = await frappe.call({
				method: 'f_icecore.f_icecore.api.turn_credentials.get_ice_servers',
				callback: (r) => {
					if (r.message) {
						this.iceServers = r.message;
						console.log('ICE Servers loaded:', this.iceServers);
					}
				}
			});
		} catch (error) {
			console.error('Failed to load ICE servers:', error);
			// Fallback to public STUN server
			this.iceServers = [
				{ urls: 'stun:stun.l.google.com:19302' }
			];
		}
	}

	// ============================================================
	// SocketIO Realtime Listeners
	// ============================================================

	setupRealtimeListeners() {
		const user = frappe.session.user;

		// Listen for incoming offers but DON'T auto-answer
		frappe.realtime.on(`f_icecore:webrtc_offer:${user}`, async (data) => {
			console.log('🔔 Received WebRTC offer from:', data.from_user);
			console.log('⏸️  WAITING for user to accept call before answering...');
			this.storePendingOffer(data);
		});

		// Listen for incoming answers
		frappe.realtime.on(`f_icecore:webrtc_answer:${user}`, async (data) => {
			console.log('Received WebRTC answer from:', data.from_user);
			await this.handleRemoteAnswer(data);
		});

		// Listen for ICE candidates
		frappe.realtime.on(`f_icecore:ice_candidate:${user}`, async (data) => {
			console.log('Received ICE candidate from:', data.from_user);
			await this.handleRemoteIceCandidate(data);
		});

		// Listen for call ended
		frappe.realtime.on(`f_icecore:call_ended:${user}`, (data) => {
			console.log('Call ended by:', data.ended_by);
			this.endCall();
		});

		// Listen for transfer events (SocketIO path)
		frappe.realtime.on('f_icecore:transfer_incoming', (data) => {
			console.log('Transfer incoming (SocketIO):', data);
			if (window.FIceCoreUI?.handleTransferIncoming) {
				window.FIceCoreUI.handleTransferIncoming(data);
			}
		});

		frappe.realtime.on('f_icecore:transfer_notify', (data) => {
			console.log('Transfer notify (SocketIO):', data);
			if (window.FIceCoreUI?.handleTransferNotify) {
				window.FIceCoreUI.handleTransferNotify(data);
			}
		});

		frappe.realtime.on('f_icecore:transfer_completed', (data) => {
			console.log('Transfer completed (SocketIO):', data);
			if (window.FIceCoreUI?.handleTransferCompleted) {
				window.FIceCoreUI.handleTransferCompleted(data);
			}
		});

		frappe.realtime.on('f_icecore:transfer_failed', (data) => {
			console.log('Transfer failed (SocketIO):', data);
			if (window.FIceCoreUI?.handleTransferFailed) {
				window.FIceCoreUI.handleTransferFailed(data);
			}
		});

		frappe.realtime.on('f_icecore:transfer_cancelled', (data) => {
			console.log('Transfer cancelled (SocketIO):', data);
			if (window.FIceCoreUI?.handleTransferCancelled) {
				window.FIceCoreUI.handleTransferCancelled(data);
			}
		});
	}

	// ============================================================
	// Offer handling (store, wait, answer)
	// ============================================================

	/**
	 * Store incoming offer without answering.
	 * The offer will be answered only when user clicks "Accept".
	 * Also resolves any pending waitForOffer promise.
	 *
	 * IMPORTANT: If we already have an active peer connection with this user
	 * (same call_id), this is a mid-call renegotiation (e.g. screen share
	 * track added). Handle it automatically instead of storing.
	 */
	storePendingOffer(data) {
		try {
			// Check if this is a mid-call renegotiation (same call, active peer connection)
			if (this.peerConnection && this.callId === data.call_id && this.remoteUser === data.from_user) {
				console.log('🔄 Mid-call renegotiation offer from:', data.from_user);
				this.handleRenegotiationOffer(data);
				return;
			}

			console.log('📥 Storing pending offer from:', data.from_user);

			this.pendingOfferData = data;
			this.pendingOffer = JSON.parse(data.offer);
			this.remoteUser = data.from_user;
			this.callId = data.call_id;
			this.callType = data.call_type || 'audio';

			console.log('✅ Offer stored. Waiting for user acceptance...');
			console.log('   - From:', this.remoteUser);
			console.log('   - Call ID:', this.callId);
			console.log('   - Call Type:', this.callType);

			// If answerCall is already waiting for the offer, resolve it now
			if (this._offerResolver) {
				console.log('✅ Resolving waiting answerCall with offer');
				this._offerResolver();
				this._offerResolver = null;
			}

		} catch (error) {
			console.error('❌ Failed to store pending offer:', error);
			this.handleError(error);
		}
	}

	/**
	 * Handle a mid-call renegotiation offer.
	 * This happens when the remote peer adds/removes tracks (e.g. screen share).
	 * We automatically set the new remote description and send an answer.
	 */
	async handleRenegotiationOffer(data) {
		try {
			const offer = JSON.parse(data.offer);
			console.log('🔄 Setting renegotiation remote description...');

			await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

			// Create and send answer for the renegotiation
			const answer = await this.peerConnection.createAnswer();
			await this.peerConnection.setLocalDescription(answer);

			console.log('🔄 Sending renegotiation answer to:', this.remoteUser);
			await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.send_answer',
				args: {
					to_user: this.remoteUser,
					answer_sdp: JSON.stringify(answer),
					call_id: this.callId
				}
			});

			// Process any pending ICE candidates
			await this.processPendingIceCandidates();

			// Force re-attach streams to update video elements.
			// After renegotiation, the video element may need a srcObject kick
			// to display the new track content (screen share vs camera).
			setTimeout(() => {
				this.attachRemoteStream();
				this.attachLocalStream();

				// Also ensure video container exists for audio-only calls getting screen share
				if (window.FIceCoreUI) {
					window.FIceCoreUI._ensureVideoContainerForScreenShare();
					// Re-attach after container is created
					setTimeout(() => {
						this.attachRemoteStream();
					}, 100);
				}
			}, 200);

			console.log('✅ Renegotiation complete — remote screen share should now be visible');

		} catch (error) {
			console.error('❌ Renegotiation failed:', error);
		}
	}

	/**
	 * Wait for the WebRTC offer to arrive (up to timeout).
	 * The incoming_call notification may arrive before the webrtc_offer event.
	 */
	waitForOffer(timeoutMs = 15000) {
		return new Promise((resolve, reject) => {
			// If offer already arrived, resolve immediately
			if (this.pendingOffer && this.pendingOfferData) {
				console.log('✅ Offer already available, no need to wait');
				resolve();
				return;
			}

			console.log('⏳ Waiting for WebRTC offer to arrive...');

			// Set up resolver that storePendingOffer will call
			this._offerResolver = resolve;

			// Timeout - don't wait forever
			setTimeout(() => {
				if (this._offerResolver) {
					this._offerResolver = null;
					reject(new Error('Timed out waiting for WebRTC offer'));
				}
			}, timeoutMs);
		});
	}

	/**
	 * Answer the pending offer after user accepts.
	 * This is called by FIceCoreCallUI.acceptCall() method.
	 * If the offer hasn't arrived yet, waits up to 15 seconds for it.
	 */
	async answerCall(remoteUser, callType, callId) {
		try {
			console.log('✅ User ACCEPTED call! Now answering...');
			console.log('   - Remote user:', remoteUser);
			console.log('   - Call type:', callType);
			console.log('   - Call ID:', callId);

			// Wait for the offer if it hasn't arrived yet
			if (!this.pendingOffer || !this.pendingOfferData) {
				console.log('⏳ Offer not yet received, waiting...');
				await this.waitForOffer(15000);
			}

			// Final check
			if (!this.pendingOffer || !this.pendingOfferData) {
				throw new Error('No pending offer to answer after waiting');
			}

			console.log('✅ Offer is available, proceeding to answer');

			// Set call metadata
			this.remoteUser = remoteUser;
			this.callType = callType;
			this.callId = callId;
			this.isCaller = false;

			// Get user media (audio/video) - non-fatal if fails
			try {
				await this.getUserMedia(callType);
				console.log('✅ answerCall: Got user media');
			} catch (mediaError) {
				console.warn('⚠️ answerCall: getUserMedia failed, proceeding without local media:', mediaError.message);
			}

			// Create peer connection
			await this.createPeerConnection();

			// Add local stream tracks to peer connection (if we got them)
			if (this.localStream) {
				this.localStream.getTracks().forEach(track => {
					this.peerConnection.addTrack(track, this.localStream);
				});
				console.log('✅ answerCall: Added local tracks to peer connection');
			} else {
				console.log('⚠️ answerCall: No local media available, will receive only');
			}

			// Set remote description from pending offer
			console.log('📨 Setting remote description from stored offer');
			await this.peerConnection.setRemoteDescription(new RTCSessionDescription(this.pendingOffer));

			// Process any pending ICE candidates that arrived before the peer connection was ready
			await this.processPendingIceCandidates();

			// Create and send answer
			console.log('📤 Creating answer...');
			const answer = await this.peerConnection.createAnswer();
			await this.peerConnection.setLocalDescription(answer);

			// Send answer back to caller
			console.log('📤 Sending answer to:', this.remoteUser);
			await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.send_answer',
				args: {
					to_user: this.remoteUser,
					answer_sdp: JSON.stringify(answer),
					call_id: this.callId
				}
			});

			console.log('✅ Answer sent to:', this.remoteUser);

			// Clear pending offer
			this.pendingOffer = null;
			this.pendingOfferData = null;

		} catch (error) {
			console.error('❌ Failed to answer call:', error);
			this.handleError(error);
			throw error;
		}
	}

	// ============================================================
	// Peer Connection
	// ============================================================

	async createPeerConnection() {
		const config = {
			iceServers: this.iceServers
		};

		this.peerConnection = new RTCPeerConnection(config);

		// Handle ICE candidates
		this.peerConnection.onicecandidate = (event) => {
			if (event.candidate) {
				this.sendIceCandidate(event.candidate);
			}
		};

		// Handle incoming media tracks
		this.peerConnection.ontrack = (event) => {
			console.log('📡 Received remote track:', event.track.kind, 'readyState:', event.track.readyState);
			console.log('📡 Track streams:', event.streams?.length || 0);
			if (!this.remoteStream) {
				this.remoteStream = new MediaStream();
			}
			this.remoteStream.addTrack(event.track);
			console.log('📡 Remote stream now has', this.remoteStream.getTracks().length, 'tracks');

			// Callback for custom handlers
			if (this.onRemoteStream) {
				this.onRemoteStream(this.remoteStream);
			}

			// Auto-attach to video/audio elements in the call window
			this.attachRemoteStream();
		};

		// Handle connection state changes
		this.peerConnection.onconnectionstatechange = () => {
			const state = this.peerConnection.connectionState;
			console.log('🔗 Connection state:', state);
			if (this.onConnectionStateChange) {
				this.onConnectionStateChange(state);
			}

			// Update call status in UI
			const statusEl = document.getElementById('call-status');
			if (statusEl) {
				const statusMap = {
					'connecting': 'Connecting...',
					'connected': 'Connected',
					'disconnected': 'Reconnecting...',
					'failed': 'Connection Failed',
					'closed': 'Call Ended'
				};
				statusEl.textContent = statusMap[state] || state;
			}

			if (state === 'connected') {
				console.log('✅ Peer connection CONNECTED! Ensuring streams are attached...');
				this.attachLocalStream();
				this.attachRemoteStream();

				// Start the call duration timer now that we're actually connected
				if (window.FIceCoreUI) {
					console.log('⏱️ Triggering startDurationTimer from connection state');
					window.FIceCoreUI.startDurationTimer();
				}
			}

			if (state === 'failed') {
				this.handleError('Connection failed');
			}
		};

		// Handle ICE connection state
		this.peerConnection.oniceconnectionstatechange = () => {
			const iceState = this.peerConnection.iceConnectionState;
			console.log('🧊 ICE connection state:', iceState);

			// Some browsers fire ICE 'connected' before peer connection 'connected'
			if (iceState === 'connected' || iceState === 'completed') {
				console.log('✅ ICE CONNECTED! Updating UI and starting timer...');
				const statusEl = document.getElementById('call-status');
				if (statusEl) {
					statusEl.textContent = 'Connected';
					console.log('✅ Updated call status to Connected');
				}
				if (window.FIceCoreUI) {
					console.log('⏱️ Triggering startDurationTimer from ICE connected');
					window.FIceCoreUI.startDurationTimer();
				}
				this.attachLocalStream();
				this.attachRemoteStream();
			}

			if (iceState === 'failed') {
				this.handleError('ICE connection failed');
			}
		};

		return this.peerConnection;
	}

	// ============================================================
	// Start Call (caller side)
	// ============================================================

	async startCall(remoteUser, callType, callId) {
		try {
			this.remoteUser = remoteUser;
			this.callType = callType;
			this.callId = callId;
			this.isCaller = true;

			console.log('📞 startCall: Getting user media...');

			// Get user media first so tracks can be added to the offer
			try {
				await this.getUserMedia(callType);
				console.log('✅ startCall: Got user media');
			} catch (mediaError) {
				console.warn('⚠️ startCall: getUserMedia failed, proceeding without local media:', mediaError.message);
			}

			console.log('📞 startCall: Creating peer connection...');

			// Create peer connection
			await this.createPeerConnection();

			// Add local stream to peer connection (if we got it)
			if (this.localStream) {
				this.localStream.getTracks().forEach(track => {
					this.peerConnection.addTrack(track, this.localStream);
				});
				console.log('✅ startCall: Added local tracks to peer connection');
			} else {
				// No local media (e.g. HTTP connection) — add transceivers so
				// the SDP offer still negotiates audio/video channels.
				console.log('📡 startCall: No local media, adding transceivers for receiving...');
				this.peerConnection.addTransceiver('audio', { direction: 'recvonly' });
				if (callType === 'video') {
					this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
				}
				console.log('✅ startCall: Added recvonly transceivers');
			}

			// Create and send offer
			console.log('📞 startCall: Creating offer...');
			const offer = await this.peerConnection.createOffer();
			await this.peerConnection.setLocalDescription(offer);

			// Send offer to remote user
			console.log('📞 startCall: Sending offer to', remoteUser);
			await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.send_offer',
				args: {
					to_user: remoteUser,
					offer_sdp: JSON.stringify(offer),
					call_id: callId
				}
			});

			console.log('✅ Call started, offer sent to:', remoteUser);

		} catch (error) {
			console.error('❌ Failed to start call:', error);
			this.handleError(error);
			throw error;
		}
	}

	// ============================================================
	// Media Permission & getUserMedia
	// ============================================================

	/**
	 * Check and request microphone/camera permission before making a call.
	 * On HTTP (no mediaDevices), returns true with a warning — call proceeds without local media.
	 */
	async requestMediaPermission(callType) {
		try {
			if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
				console.warn('⚠️ navigator.mediaDevices not available (HTTP connection)');
				frappe.show_alert({
					message: __('Note: Microphone/camera not available on HTTP. Call will connect but the other person may not hear you. Use HTTPS for full audio/video.'),
					indicator: 'orange'
				}, 10);
				return true;
			}

			if (navigator.permissions && navigator.permissions.query) {
				try {
					const micPermission = await navigator.permissions.query({ name: 'microphone' });
					console.log('🎤 Microphone permission state:', micPermission.state);

					if (micPermission.state === 'denied') {
						frappe.msgprint({
							title: __('Microphone Blocked'),
							message: __('Microphone access is blocked. Please allow microphone access in your browser settings and try again.'),
							indicator: 'red'
						});
						return true;
					}
				} catch (e) {
					console.log('⚠️ Cannot query microphone permission, will try getUserMedia directly');
				}
			}

			console.log('🎤 Requesting media permission...');
			const testConstraints = callType === 'video'
				? { audio: true, video: true }
				: { audio: true };

			const testStream = await navigator.mediaDevices.getUserMedia(testConstraints);
			testStream.getTracks().forEach(track => track.stop());
			console.log('✅ Media permission granted');
			return true;

		} catch (error) {
			console.error('❌ Media permission error:', error);

			if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
				frappe.show_alert({
					message: __('Microphone access denied. Call will connect but the other person may not hear you.'),
					indicator: 'orange'
				}, 8);
			} else if (error.name === 'NotFoundError') {
				frappe.show_alert({
					message: __('No microphone found. Call will connect but without audio from your side.'),
					indicator: 'orange'
				}, 8);
			} else if (error.name === 'NotReadableError') {
				frappe.show_alert({
					message: __('Microphone is busy. Call will connect but the other person may not hear you.'),
					indicator: 'orange'
				}, 8);
			} else {
				frappe.show_alert({
					message: __('Could not access microphone: ') + error.message,
					indicator: 'orange'
				}, 8);
			}
			return true;
		}
	}

	async getUserMedia(callType) {
		try {
			if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
				console.warn('⚠️ getUserMedia: navigator.mediaDevices not available (HTTP connection). Proceeding without local media.');
				return null;
			}

			if (callType === 'screen') {
				await this.getScreenShare();
			} else {
				const constraints = this.getMediaConstraints(callType);
				this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

				if (this.onLocalStream) {
					this.onLocalStream(this.localStream);
				}
			}

			// Auto-attach local stream to video element if present
			this.attachLocalStream();

			return this.localStream;

		} catch (error) {
			console.error('Failed to get user media:', error);
			throw new Error('Could not access camera/microphone. Please check permissions.');
		}
	}

	getMediaConstraints(callType) {
		switch (callType) {
			case 'video':
				return {
					audio: {
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true
					},
					video: {
						width: { ideal: 1280 },
						height: { ideal: 720 },
						frameRate: { ideal: 30 }
					}
				};

			case 'screen':
				return null;

			case 'audio':
			default:
				return {
					audio: {
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true
					},
					video: false
				};
		}
	}

	async getScreenShare() {
		try {
			this.localStream = await navigator.mediaDevices.getDisplayMedia({
				video: {
					cursor: 'always'
				},
				audio: false
			});

			if (this.onLocalStream) {
				this.onLocalStream(this.localStream);
			}

			// Handle screen share stop
			this.localStream.getVideoTracks()[0].onended = () => {
				console.log('Screen sharing stopped');
				this.endCall();
			};

			return this.localStream;

		} catch (error) {
			console.error('Failed to get screen share:', error);
			throw new Error('Could not access screen. Please check permissions.');
		}
	}

	// ============================================================
	// Handle Remote Signals
	// ============================================================

	async handleRemoteAnswer(data) {
		try {
			const answer = JSON.parse(data.answer);
			await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
			console.log('✅ Remote answer set');

			// CRITICAL: Process any ICE candidates that arrived before the answer
			// This is especially important for the polling fallback where answer
			// and ICE candidates may arrive in the same batch
			await this.processPendingIceCandidates();

		} catch (error) {
			console.error('Failed to handle remote answer:', error);
			this.handleError(error);
		}
	}

	async handleRemoteIceCandidate(data) {
		try {
			if (data.candidate) {
				console.log('🧊 ICE candidate received:', data.candidate);

				let candidateData;
				if (typeof data.candidate === 'string') {
					console.log('🧊 Parsing ICE candidate from string');
					candidateData = JSON.parse(data.candidate);
				} else {
					candidateData = data.candidate;
				}

				// Check if peer connection is ready
				if (!this.peerConnection || !this.peerConnection.remoteDescription) {
					console.log('⏳ Peer connection not ready, queuing ICE candidate');
					this.pendingIceCandidates.push(candidateData);
					return;
				}

				const candidate = new RTCIceCandidate(candidateData);
				await this.peerConnection.addIceCandidate(candidate);
				console.log('✅ ICE candidate added successfully');
			}
		} catch (error) {
			console.error('❌ Failed to handle ICE candidate:', error);
		}
	}

	async processPendingIceCandidates() {
		if (this.pendingIceCandidates.length === 0) {
			return;
		}

		console.log(`🧊 Processing ${this.pendingIceCandidates.length} pending ICE candidates`);

		for (const candidateData of this.pendingIceCandidates) {
			try {
				const candidate = new RTCIceCandidate(candidateData);
				await this.peerConnection.addIceCandidate(candidate);
				console.log('✅ Pending ICE candidate added successfully');
			} catch (error) {
				console.error('❌ Failed to add pending ICE candidate:', error);
			}
		}

		this.pendingIceCandidates = [];
	}

	async sendIceCandidate(candidate) {
		try {
			await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.send_ice_candidate',
				args: {
					to_user: this.remoteUser,
					candidate: candidate.toJSON(),
					call_id: this.callId
				}
			});
		} catch (error) {
			console.error('Failed to send ICE candidate:', error);
		}
	}

	// ============================================================
	// Stream Attachment
	// ============================================================

	/**
	 * Attach remote stream to the remote video/audio element in the call window.
	 */
	attachRemoteStream() {
		if (!this.remoteStream) {
			console.log('⚠️ attachRemoteStream: No remote stream available yet');
			return;
		}

		const remoteVideo = document.getElementById('remote-video');
		if (remoteVideo) {
			remoteVideo.srcObject = this.remoteStream;
			console.log('✅ Attached remote stream to #remote-video');
			return;
		}

		let remoteAudio = document.getElementById('remote-audio');
		if (!remoteAudio) {
			remoteAudio = document.createElement('audio');
			remoteAudio.id = 'remote-audio';
			remoteAudio.autoplay = true;
			document.body.appendChild(remoteAudio);
			console.log('🔊 Created hidden audio element for remote stream');
		}
		remoteAudio.srcObject = this.remoteStream;
		console.log('✅ Attached remote stream to #remote-audio');
	}

	/**
	 * Attach local stream to the local video element in the call window.
	 */
	attachLocalStream() {
		if (!this.localStream) {
			console.log('⚠️ attachLocalStream: No local stream available yet');
			return;
		}

		const localVideo = document.getElementById('local-video');
		if (localVideo) {
			localVideo.srcObject = this.localStream;
			console.log('✅ Attached local stream to #local-video');
		}
	}

	// ============================================================
	// Audio/Video Toggle
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
	// Mid-call Screen Sharing (toggle on/off)
	// ============================================================

	/**
	 * Start screen sharing mid-call.
	 * Replaces the current video track (camera) with the screen capture track
	 * on the existing peer connection. No renegotiation needed.
	 *
	 * For audio-only calls, adds a video track to the peer connection.
	 *
	 * Returns true on success, false on failure/cancel.
	 */
	async startScreenShare() {
		try {
			if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
				console.error('❌ getDisplayMedia not available');
				frappe.show_alert({
					message: __('Screen sharing is not available. Use HTTPS for screen sharing.'),
					indicator: 'red'
				}, 5);
				return false;
			}

			if (!this.peerConnection) {
				console.error('❌ No active peer connection for screen share');
				return false;
			}

			console.log('🖥️ Starting screen share...');

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
				console.error('❌ No video track from getDisplayMedia');
				return false;
			}

			// Save the current camera track so we can restore it later
			this._savedCameraTrack = null;
			if (this.localStream) {
				const cameraTrack = this.localStream.getVideoTracks()[0];
				if (cameraTrack) {
					this._savedCameraTrack = cameraTrack;
				}
			}

			// Find the video sender on the peer connection and replace its track
			const videoSender = this.peerConnection.getSenders().find(s =>
				s.track && s.track.kind === 'video'
			);

			if (videoSender) {
				// Replace existing video track with screen track
				await videoSender.replaceTrack(screenTrack);
				console.log('✅ Replaced camera track with screen track on sender');
			} else {
				// No video sender yet (audio-only call) — add screen track
				this.peerConnection.addTrack(screenTrack, screenStream);
				console.log('✅ Added screen track to peer connection (was audio-only)');
			}

			// Always renegotiate so the remote side updates its video rendering.
			// For video calls: replaceTrack alone may not update the remote display.
			// For audio-only calls: new track requires renegotiation anyway.
			const offer = await this.peerConnection.createOffer();
			await this.peerConnection.setLocalDescription(offer);
			await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.send_offer',
				args: {
					to_user: this.remoteUser,
					offer_sdp: JSON.stringify(offer),
					call_id: this.callId
				}
			});
			console.log('📤 Sent renegotiation offer for screen share');

			// Update local stream reference
			if (!this.localStream) {
				this.localStream = new MediaStream();
			}
			// Remove old video track from localStream, add screen track
			this.localStream.getVideoTracks().forEach(t => {
				if (t !== screenTrack) {
					this.localStream.removeTrack(t);
				}
			});
			this.localStream.addTrack(screenTrack);

			// Update local video preview to show screen share
			this.attachLocalStream();

			// Store screen stream reference for cleanup
			this._screenStream = screenStream;
			this._isScreenSharing = true;

			// Listen for user stopping screen share via browser's built-in "Stop sharing" button
			screenTrack.onended = () => {
				console.log('🖥️ User stopped screen sharing via browser UI');
				this.stopScreenShare();
				// Notify CallUI to update button state
				if (window.FIceCoreUI) {
					window.FIceCoreUI._updateScreenShareButton(false);
				}
			};

			console.log('✅ Screen sharing started successfully');
			return true;

		} catch (error) {
			if (error.name === 'NotAllowedError') {
				console.log('🖥️ User cancelled screen share picker');
			} else {
				console.error('❌ Failed to start screen share:', error);
				frappe.show_alert({
					message: __('Failed to start screen sharing: ') + error.message,
					indicator: 'red'
				}, 5);
			}
			return false;
		}
	}

	/**
	 * Stop screen sharing and restore the camera video track.
	 * If the original call was audio-only, just removes the video track.
	 */
	async stopScreenShare() {
		try {
			if (!this._isScreenSharing) {
				return;
			}

			console.log('🖥️ Stopping screen share...');

			// Stop screen capture tracks
			if (this._screenStream) {
				this._screenStream.getTracks().forEach(t => t.stop());
				this._screenStream = null;
			}

			// Find the video sender (check track kind, or fallback to transceiver mid)
			const videoSender = this.peerConnection?.getSenders().find(s => {
				if (s.track && s.track.kind === 'video') return true;
				// Fallback: check transceiver
				const transceivers = this.peerConnection.getTransceivers();
				const tr = transceivers.find(t => t.sender === s);
				return tr && tr.mid && tr.receiver?.track?.kind === 'video';
			});

			if (videoSender && this._savedCameraTrack && this._savedCameraTrack.readyState === 'live') {
				// Restore the camera track
				await videoSender.replaceTrack(this._savedCameraTrack);
				console.log('✅ Restored camera track');

				// Update localStream
				if (this.localStream) {
					this.localStream.getVideoTracks().forEach(t => this.localStream.removeTrack(t));
					this.localStream.addTrack(this._savedCameraTrack);
				}
			} else if (videoSender) {
				// No camera track to restore (was audio-only call) — send null to stop video
				await videoSender.replaceTrack(null);
				console.log('✅ Removed screen track (no camera to restore)');

				// Remove video tracks from localStream
				if (this.localStream) {
					this.localStream.getVideoTracks().forEach(t => {
						t.stop();
						this.localStream.removeTrack(t);
					});
				}
			}

			this._savedCameraTrack = null;
			this._isScreenSharing = false;

			// Update local video preview
			this.attachLocalStream();

			// Send renegotiation so remote side updates its video display
			if (this.peerConnection && this.remoteUser && this.callId) {
				try {
					const offer = await this.peerConnection.createOffer();
					await this.peerConnection.setLocalDescription(offer);
					await frappe.call({
						method: 'f_icecore.f_icecore.api.signaling.send_offer',
						args: {
							to_user: this.remoteUser,
							offer_sdp: JSON.stringify(offer),
							call_id: this.callId
						}
					});
					console.log('📤 Sent renegotiation offer after stopping screen share');
				} catch (renego) {
					console.warn('⚠️ Renegotiation after stopping screen share failed:', renego);
				}
			}

			console.log('✅ Screen sharing stopped');

		} catch (error) {
			console.error('❌ Failed to stop screen share:', error);
		}
	}

	/**
	 * Toggle screen sharing on/off.
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

	// ============================================================
	// End Call
	// ============================================================

	async endCall() {
		// Stop recording if active
		if (this._isRecording) {
			await this.stopRecording();
		}

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

		// Stop local stream
		if (this.localStream) {
			this.localStream.getTracks().forEach(track => track.stop());
			this.localStream = null;
		}

		// Close peer connection
		if (this.peerConnection) {
			this.peerConnection.close();
			this.peerConnection = null;
		}

		// Notify backend
		if (this.callId) {
			await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.end_call',
				args: {
					call_id: this.callId
				}
			});
		}

		// Remove hidden remote audio element if present
		const remoteAudio = document.getElementById('remote-audio');
		if (remoteAudio) {
			remoteAudio.srcObject = null;
			remoteAudio.remove();
		}

		// Clear state
		this.remoteStream = null;
		this.remoteUser = null;
		this.callId = null;
		this.pendingIceCandidates = [];
		this.pendingOffer = null;
		this.pendingOfferData = null;

		// Trigger callback
		if (this.onCallEnded) {
			this.onCallEnded();
		}

		console.log('Call ended');
	}

	// ============================================================
	// Error Handling & Presence
	// ============================================================

	handleError(error) {
		console.error('WebRTC Error:', error);
		if (this.onError) {
			this.onError(error);
		}
	}

	startPresenceHeartbeat() {
		// Send heartbeat every 60 seconds
		setInterval(() => {
			frappe.call({
				method: 'f_icecore.f_icecore.api.presence.heartbeat',
				args: {},
				callback: (response) => {
					console.log('Presence heartbeat sent');
				}
			});
		}, 60000);

		// Send initial heartbeat
		frappe.call({
			method: 'f_icecore.f_icecore.api.presence.heartbeat'
		});
	}

	// ============================================================
	// Call Recording (MediaRecorder API)
	// ============================================================

	/**
	 * Start recording the current call.
	 * Uses MediaRecorder API to capture both local and remote audio/video
	 * into a combined MediaStream, then records it as WebM.
	 *
	 * Returns true on success, false on failure.
	 */
	async startRecording() {
		try {
			if (this._isRecording) {
				console.log('Already recording');
				return false;
			}

			if (!this.peerConnection) {
				console.error('No active peer connection to record');
				return false;
			}

			console.log('Recording: Starting call recording...');

			// Create a combined stream with both local and remote audio/video
			const combinedStream = new MediaStream();

			// Add remote tracks (this is what we hear/see from the other person)
			if (this.remoteStream) {
				this.remoteStream.getTracks().forEach(track => {
					combinedStream.addTrack(track);
				});
			}

			// Add local audio tracks (our own voice)
			if (this.localStream) {
				this.localStream.getAudioTracks().forEach(track => {
					combinedStream.addTrack(track);
				});
			}

			if (combinedStream.getTracks().length === 0) {
				console.error('No tracks available to record');
				return false;
			}

			// Determine the best supported MIME type
			let mimeType = 'audio/webm;codecs=opus';
			const hasVideo = combinedStream.getVideoTracks().length > 0;
			if (hasVideo) {
				if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
					mimeType = 'video/webm;codecs=vp9,opus';
				} else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
					mimeType = 'video/webm;codecs=vp8,opus';
				} else if (MediaRecorder.isTypeSupported('video/webm')) {
					mimeType = 'video/webm';
				}
			} else {
				if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
					if (MediaRecorder.isTypeSupported('audio/webm')) {
						mimeType = 'audio/webm';
					} else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
						mimeType = 'audio/ogg;codecs=opus';
					}
				}
			}

			console.log('Recording: Using MIME type:', mimeType);

			// Create MediaRecorder
			this._recordedChunks = [];
			this._mediaRecorder = new MediaRecorder(combinedStream, {
				mimeType: mimeType,
				audioBitsPerSecond: 128000,
				videoBitsPerSecond: hasVideo ? 2500000 : undefined
			});

			this._mediaRecorder.ondataavailable = (event) => {
				if (event.data && event.data.size > 0) {
					this._recordedChunks.push(event.data);
				}
			};

			this._mediaRecorder.onstop = () => {
				console.log('Recording: MediaRecorder stopped, chunks:', this._recordedChunks.length);
				this._saveRecording();
			};

			this._mediaRecorder.onerror = (event) => {
				console.error('Recording: MediaRecorder error:', event.error);
				this._isRecording = false;
			};

			// Start recording — collect data every 1 second
			this._mediaRecorder.start(1000);
			this._isRecording = true;

			// Create recording document in backend
			const callType = hasVideo ? 'video' : 'audio';
			try {
				const response = await frappe.call({
					method: 'f_icecore.f_icecore.api.call_recording.start_recording',
					args: {
						call_id: this.callId,
						call_type: callType
					}
				});
				if (response.message?.success) {
					this._recordingId = response.message.recording_id;
					console.log('Recording: Backend recording ID:', this._recordingId);
				}
			} catch (e) {
				console.warn('Recording: Failed to create backend record:', e);
			}

			console.log('Recording: Call recording started successfully');
			return true;

		} catch (error) {
			console.error('Recording: Failed to start recording:', error);
			this._isRecording = false;
			return false;
		}
	}

	/**
	 * Stop recording the current call.
	 */
	async stopRecording() {
		try {
			if (!this._isRecording || !this._mediaRecorder) {
				return;
			}

			console.log('Recording: Stopping call recording...');

			// Stop MediaRecorder — triggers onstop which calls _saveRecording
			if (this._mediaRecorder.state !== 'inactive') {
				this._mediaRecorder.stop();
			}

			this._isRecording = false;

			// Notify backend
			if (this._recordingId) {
				try {
					await frappe.call({
						method: 'f_icecore.f_icecore.api.call_recording.stop_recording',
						args: { recording_id: this._recordingId }
					});
				} catch (e) {
					console.warn('Recording: Failed to notify backend about stop:', e);
				}
			}

			console.log('Recording: Call recording stopped');

		} catch (error) {
			console.error('Recording: Failed to stop recording:', error);
		}
	}

	/**
	 * Save the recorded chunks as a file and upload to backend.
	 * Called automatically when MediaRecorder stops.
	 */
	async _saveRecording() {
		try {
			if (this._recordedChunks.length === 0) {
				console.warn('Recording: No recorded data to save');
				return;
			}

			const blob = new Blob(this._recordedChunks, {
				type: this._mediaRecorder?.mimeType || 'audio/webm'
			});

			console.log('Recording: Created blob, size:', blob.size, 'bytes');

			if (!this._recordingId) {
				// No backend record — just offer download
				this._downloadRecording(blob);
				return;
			}

			// Convert blob to base64 and upload
			const reader = new FileReader();
			reader.onload = async () => {
				try {
					const base64 = reader.result.split(',')[1]; // Remove data URL prefix

					const response = await frappe.call({
						method: 'f_icecore.f_icecore.api.call_recording.save_recording_blob',
						args: {
							recording_id: this._recordingId,
							blob_b64: base64
						}
					});

					if (response.message?.success) {
						console.log('Recording: File uploaded successfully:', response.message.file_url);
						frappe.show_alert({
							message: __('Call recording saved successfully'),
							indicator: 'green'
						}, 5);
					}
				} catch (e) {
					console.error('Recording: Failed to upload recording:', e);
					// Fallback: offer download
					this._downloadRecording(blob);
				}
			};
			reader.readAsDataURL(blob);

			// Cleanup
			this._recordedChunks = [];

		} catch (error) {
			console.error('Recording: Failed to save recording:', error);
		}
	}

	/**
	 * Fallback: download the recording as a file if upload fails.
	 */
	_downloadRecording(blob) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const ext = blob.type.includes('video') ? 'webm' : 'webm';
		a.download = `call_recording_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		frappe.show_alert({
			message: __('Recording downloaded to your device'),
			indicator: 'blue'
		}, 5);
	}

	/**
	 * Check if currently recording.
	 */
	isRecording() {
		return this._isRecording;
	}
}

// Initialize WebRTC engine
window.FIceCore = new FIceCoreWebRTC();
