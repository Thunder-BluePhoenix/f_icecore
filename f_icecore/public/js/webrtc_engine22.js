/**
 * F-IceCore WebRTC Engine
 * Handles peer connections, media streams, and WebRTC logic
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

		// Listen for incoming offers
		frappe.realtime.on(`f_icecore:webrtc_offer:${user}`, async (data) => {
			console.log('Received WebRTC offer from:', data.from_user);
			await this.handleRemoteOffer(data);
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

		// Listen for call ended (broadcast event, simple name like f_chat)
		frappe.realtime.on('call_ended', (data) => {
			console.log('Call ended by:', data.ended_by);
			const user = frappe.session.user;
			// Only end if this call involves us
			if (data.from_user === user || data.to_user === user) {
				this.endCall();
			}
		});
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

		// Handle remote stream
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

		// Connection state changes
		this.peerConnection.onconnectionstatechange = () => {
			console.log('Connection state:', this.peerConnection.connectionState);

			if (this.onConnectionStateChange) {
				this.onConnectionStateChange(this.peerConnection.connectionState);
			}

			if (this.peerConnection.connectionState === 'failed') {
				this.handleError('Connection failed');
			}
		};

		// ICE connection state
		this.peerConnection.oniceconnectionstatechange = () => {
			console.log('ICE connection state:', this.peerConnection.iceConnectionState);

			if (this.peerConnection.iceConnectionState === 'failed') {
				this.handleError('ICE connection failed');
			}
		};

		return this.peerConnection;
	}

	async startCall(remoteUser, callType = 'audio', callId = null) {
		try {
			this.remoteUser = remoteUser;
			this.callType = callType;
			this.callId = callId;
			this.isCaller = true;

			// Get local media stream
			await this.getLocalStream(callType);

			// Create peer connection
			await this.createPeerConnection();

			// Add local stream to peer connection
			this.localStream.getTracks().forEach(track => {
				this.peerConnection.addTrack(track, this.localStream);
			});

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
		}
	}

	async answerCall(remoteUser, callType = 'audio', callId = null) {
		try {
			this.remoteUser = remoteUser;
			this.callType = callType;
			this.callId = callId;
			this.isCaller = false;

			// Get local media stream
			await this.getLocalStream(callType);

			// Peer connection should already be created when offer was received
			// Add local stream
			this.localStream.getTracks().forEach(track => {
				this.peerConnection.addTrack(track, this.localStream);
			});

			console.log('Call answered');

		} catch (error) {
			console.error('Failed to answer call:', error);
			this.handleError(error);
		}
	}

	async getLocalStream(callType) {
		try {
			const constraints = this.getMediaConstraints(callType);
			this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

			if (this.onLocalStream) {
				this.onLocalStream(this.localStream);
			}

			return this.localStream;

		} catch (error) {
			console.error('Failed to get local stream:', error);
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

	async handleRemoteOffer(data) {
		try {
			const offer = JSON.parse(data.offer);

			// Create peer connection if not exists
			if (!this.peerConnection) {
				await this.createPeerConnection();
			}

			// Set remote description
			await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

			// Create and send answer
			const answer = await this.peerConnection.createAnswer();
			await this.peerConnection.setLocalDescription(answer);

			// Send answer back
			await frappe.call({
				method: 'f_icecore.f_icecore.api.signaling.send_answer',
				args: {
					to_user: data.from_user,
					answer_sdp: JSON.stringify(answer),
					call_id: data.call_id
				}
			});

			console.log('Answer sent to:', data.from_user);

		} catch (error) {
			console.error('Failed to handle remote offer:', error);
			this.handleError(error);
		}
	}

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
				const candidate = new RTCIceCandidate(data.candidate);
				await this.peerConnection.addIceCandidate(candidate);
				console.log('ICE candidate added');
			}

		} catch (error) {
			console.error('Failed to handle ICE candidate:', error);
		}
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

	toggleAudio(enabled) {
		if (this.localStream) {
			this.localStream.getAudioTracks().forEach(track => {
				track.enabled = enabled;
			});
		}
	}

	toggleVideo(enabled) {
		if (this.localStream) {
			this.localStream.getVideoTracks().forEach(track => {
				track.enabled = enabled;
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
				args: { call_id: this.callId }
			});
		}

		// Reset state
		this.remoteStream = null;
		this.remoteUser = null;
		this.callId = null;

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
				callback: (r) => {
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

// Global instance
window.FIceCore = new FIceCoreWebRTC();
