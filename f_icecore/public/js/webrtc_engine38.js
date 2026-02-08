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
					'call_accepted': 1,
					'f_icecore:webrtc_offer': 2,
					'f_icecore:webrtc_answer': 3,
					'f_icecore:ice_candidate': 4,
					'call_rejected': 5,
					'call_ended': 6,
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
	}

	// ============================================================
	// Offer handling (store, wait, answer)
	// ============================================================

	/**
	 * Store incoming offer without answering.
	 * The offer will be answered only when user clicks "Accept".
	 * Also resolves any pending waitForOffer promise.
	 */
	storePendingOffer(data) {
		try {
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
	// End Call
	// ============================================================

	async endCall() {
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
}

// Initialize WebRTC engine
window.FIceCore = new FIceCoreWebRTC();
