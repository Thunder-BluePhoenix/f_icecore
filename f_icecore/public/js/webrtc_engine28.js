/**
 * F-IceCore WebRTC Engine v26 - FIXED INCOMING CALL NOTIFICATIONS
 * Handles peer connections, media streams, and WebRTC logic
 * 
 * CRITICAL FIX: No longer auto-answers incoming calls
 * - Stores incoming offers in pendingOffer
 * - Waits for user to click "Accept" in dialog
 * - Only then creates peer connection and sends answer
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
		
		// 🆕 NEW: Store incoming offer until user accepts
		this.pendingOffer = null;
		this.pendingOfferData = null;

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

		// Setup realtime listeners
		this.setupRealtimeListeners();

		// Start presence heartbeat
		this.startPresenceHeartbeat();
	}

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

	setupRealtimeListeners() {
		const user = frappe.session.user;

		// 🆕 FIXED: Listen for incoming offers but DON'T auto-answer
		frappe.realtime.on(`f_icecore:webrtc_offer:${user}`, async (data) => {
			console.log('🔔 Received WebRTC offer from:', data.from_user);
			console.log('⏸️  WAITING for user to accept call before answering...');
			
			// Store the offer data - DON'T process it yet!
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

	/**
	 * 🆕 NEW METHOD: Store incoming offer without answering
	 * The offer will be answered only when user clicks "Accept"
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
			
		} catch (error) {
			console.error('❌ Failed to store pending offer:', error);
			this.handleError(error);
		}
	}

	/**
	 * 🆕 NEW METHOD: Answer the pending offer after user accepts
	 * This is called by FIceCoreCallUI.acceptCall() method
	 */
	async answerCall(remoteUser, callType, callId) {
		try {
			console.log('✅ User ACCEPTED call! Now answering...');
			console.log('   - Remote user:', remoteUser);
			console.log('   - Call type:', callType);
			console.log('   - Call ID:', callId);

			// Verify we have a pending offer
			if (!this.pendingOffer || !this.pendingOfferData) {
				throw new Error('No pending offer to answer');
			}

			// Set call metadata
			this.remoteUser = remoteUser;
			this.callType = callType;
			this.callId = callId;
			this.isCaller = false;

			// Get user media (audio/video)
			await this.getUserMedia(callType);

			// Create peer connection
			await this.createPeerConnection();

			// Add local stream tracks to peer connection
			if (this.localStream) {
				this.localStream.getTracks().forEach(track => {
					this.peerConnection.addTrack(track, this.localStream);
				});
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
			console.log('Received remote track:', event.track.kind);
			if (!this.remoteStream) {
				this.remoteStream = new MediaStream();
			}
			this.remoteStream.addTrack(event.track);

			if (this.onRemoteStream) {
				this.onRemoteStream(this.remoteStream);
			}
		};

		// Handle connection state changes
		this.peerConnection.onconnectionstatechange = () => {
			console.log('Connection state:', this.peerConnection.connectionState);
			if (this.onConnectionStateChange) {
				this.onConnectionStateChange(this.peerConnection.connectionState);
			}

			if (this.peerConnection.connectionState === 'failed') {
				this.handleError('Connection failed');
			}
		};

		// Handle ICE connection state
		this.peerConnection.oniceconnectionstatechange = () => {
			console.log('ICE connection state:', this.peerConnection.iceConnectionState);
			if (this.peerConnection.iceConnectionState === 'failed') {
				this.handleError('ICE connection failed');
			}
		};

		return this.peerConnection;
	}

	async startCall(remoteUser, callType, callId) {
		try {
			this.remoteUser = remoteUser;
			this.callType = callType;
			this.callId = callId;
			this.isCaller = true;

			// Get user media
			await this.getUserMedia(callType);

			// Create peer connection
			await this.createPeerConnection();

			// Add local stream to peer connection
			if (this.localStream) {
				this.localStream.getTracks().forEach(track => {
					this.peerConnection.addTrack(track, this.localStream);
				});
			}

			// Create and send offer
			const offer = await this.peerConnection.createOffer();
			await this.peerConnection.setLocalDescription(offer);

			// Send offer to remote user
			await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.send_offer',
				args: {
					to_user: remoteUser,
					offer_sdp: JSON.stringify(offer),
					call_id: callId
				}
			});

			console.log('Call started, offer sent to:', remoteUser);

		} catch (error) {
			console.error('Failed to start call:', error);
			this.handleError(error);
			throw error;
		}
	}

	async getUserMedia(callType) {
		try {
			if (callType === 'screen') {
				await this.getScreenShare();
			} else {
				const constraints = this.getMediaConstraints(callType);
				this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

				if (this.onLocalStream) {
					this.onLocalStream(this.localStream);
				}
			}

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
				// Screen sharing uses getDisplayMedia instead
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

	// REMOVED: handleRemoteOffer - No longer auto-answers!
	// Offers are stored in pendingOffer and answered only when user accepts

	async handleRemoteAnswer(data) {
		try {
			const answer = JSON.parse(data.answer);
			await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
			console.log('Remote answer set');

		} catch (error) {
			console.error('Failed to handle remote answer:', error);
			this.handleError(error);
		}
	}

	async handleRemoteIceCandidate(data) {
		try {
			if (data.candidate) {
				console.log('🧊 ICE candidate received:', data.candidate);
				console.log('🧊 ICE candidate type:', typeof data.candidate);

				// Parse if it's a string, otherwise use as-is
				let candidateData;
				if (typeof data.candidate === 'string') {
					console.log('🧊 Parsing ICE candidate from string');
					candidateData = JSON.parse(data.candidate);
				} else {
					candidateData = data.candidate;
				}

				console.log('🧊 Final candidate data:', candidateData);

				// Check if peer connection is ready
				if (!this.peerConnection || !this.peerConnection.remoteDescription) {
					console.log('⏳ Peer connection not ready, queuing ICE candidate');
					this.pendingIceCandidates.push(candidateData);
					return;
				}

				// Add candidate
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

		// Clear the queue
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