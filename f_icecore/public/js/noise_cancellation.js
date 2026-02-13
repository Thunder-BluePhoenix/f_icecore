/**
 * F-IceCore Noise Cancellation v01
 * Advanced noise cancellation using Web Audio API
 *
 * Uses a combination of:
 * - BiquadFilter chain (highpass + lowpass + notch filters)
 * - DynamicsCompressor for noise gate effect
 * - AnalyserNode for real-time noise level monitoring
 *
 * This is a lightweight, zero-dependency approach that works
 * in all modern browsers without needing WebAssembly.
 */

class FIceCoreNoiseCancellation {
	constructor() {
		this._enabled = false;
		this._audioContext = null;
		this._sourceNode = null;
		this._destinationNode = null;
		this._processedStream = null;
		this._originalStream = null;
		this._originalAudioTrack = null;

		// Filter nodes
		this._highpassFilter = null;
		this._lowpassFilter = null;
		this._notchFilter1 = null;
		this._notchFilter2 = null;
		this._compressor = null;
		this._gainNode = null;
		this._analyser = null;

		// Noise gate state
		this._noiseGateThreshold = -50; // dB
		this._noiseGateAttack = 0.005;  // seconds
		this._noiseGateRelease = 0.05;  // seconds
		this._noiseGateInterval = null;

		// Noise level tracking
		this._currentNoiseLevel = 0;
		this._noiseFloor = -60;
		this._signalDetected = false;

		// Settings
		this._level = 'medium'; // 'low', 'medium', 'aggressive'

		console.log('🔇 F-IceCore NoiseCancellation: Initialized');
	}

	/**
	 * Process an audio stream through the noise cancellation pipeline.
	 * Returns a new MediaStream with cleaned audio.
	 *
	 * @param {MediaStream} inputStream - The original microphone stream
	 * @returns {MediaStream} - A new stream with noise-cancelled audio
	 */
	async processStream(inputStream) {
		if (!inputStream) {
			console.warn('🔇 NoiseCancellation: No input stream provided');
			return inputStream;
		}

		const audioTracks = inputStream.getAudioTracks();
		if (audioTracks.length === 0) {
			console.warn('🔇 NoiseCancellation: No audio tracks in stream');
			return inputStream;
		}

		try {
			this._originalStream = inputStream;
			this._originalAudioTrack = audioTracks[0];

			// Create AudioContext if needed
			if (!this._audioContext || this._audioContext.state === 'closed') {
				this._audioContext = new (window.AudioContext || window.webkitAudioContext)({
					sampleRate: 48000,
					latencyHint: 'interactive'
				});
			}

			// Resume context if suspended
			if (this._audioContext.state === 'suspended') {
				await this._audioContext.resume();
			}

			// Create source from the input stream
			this._sourceNode = this._audioContext.createMediaStreamSource(inputStream);

			// Create the filter chain based on level
			this._createFilterChain();

			// Create destination
			this._destinationNode = this._audioContext.createMediaStreamDestination();

			// Connect the chain: source → highpass → notch1 → notch2 → lowpass → compressor → gain → destination
			this._sourceNode.connect(this._highpassFilter);
			this._highpassFilter.connect(this._notchFilter1);
			this._notchFilter1.connect(this._notchFilter2);
			this._notchFilter2.connect(this._lowpassFilter);
			this._lowpassFilter.connect(this._compressor);
			this._compressor.connect(this._gainNode);
			this._gainNode.connect(this._destinationNode);

			// Also connect analyser for monitoring (parallel branch)
			this._analyser = this._audioContext.createAnalyser();
			this._analyser.fftSize = 2048;
			this._analyser.smoothingTimeConstant = 0.8;
			this._gainNode.connect(this._analyser);

			// Start noise gate monitoring
			this._startNoiseGate();

			// Create new stream with processed audio + original video tracks
			this._processedStream = this._destinationNode.stream;

			// Build output stream: processed audio + original video tracks
			const outputStream = new MediaStream();
			this._processedStream.getAudioTracks().forEach(track => {
				outputStream.addTrack(track);
			});
			inputStream.getVideoTracks().forEach(track => {
				outputStream.addTrack(track);
			});

			this._enabled = true;
			console.log('🔇 NoiseCancellation: Processing pipeline active (level: ' + this._level + ')');

			return outputStream;

		} catch (error) {
			console.error('🔇 NoiseCancellation: Failed to create pipeline:', error);
			return inputStream; // Fallback to original
		}
	}

	/**
	 * Create the audio filter chain based on the current level.
	 */
	_createFilterChain() {
		const ctx = this._audioContext;
		const presets = this._getPreset(this._level);

		// Highpass filter — removes low-frequency rumble (AC hum, traffic, etc.)
		this._highpassFilter = ctx.createBiquadFilter();
		this._highpassFilter.type = 'highpass';
		this._highpassFilter.frequency.value = presets.highpassFreq;
		this._highpassFilter.Q.value = 0.7;

		// Lowpass filter — removes high-frequency hiss
		this._lowpassFilter = ctx.createBiquadFilter();
		this._lowpassFilter.type = 'lowpass';
		this._lowpassFilter.frequency.value = presets.lowpassFreq;
		this._lowpassFilter.Q.value = 0.7;

		// Notch filter 1 — targets common noise frequencies (e.g., 50Hz electrical hum)
		this._notchFilter1 = ctx.createBiquadFilter();
		this._notchFilter1.type = 'notch';
		this._notchFilter1.frequency.value = presets.notch1Freq;
		this._notchFilter1.Q.value = presets.notchQ;

		// Notch filter 2 — targets another common noise frequency (60Hz US electrical)
		this._notchFilter2 = ctx.createBiquadFilter();
		this._notchFilter2.type = 'notch';
		this._notchFilter2.frequency.value = presets.notch2Freq;
		this._notchFilter2.Q.value = presets.notchQ;

		// Compressor — acts as a noise gate by aggressively compressing quiet signals
		this._compressor = ctx.createDynamicsCompressor();
		this._compressor.threshold.value = presets.compressorThreshold;
		this._compressor.knee.value = presets.compressorKnee;
		this._compressor.ratio.value = presets.compressorRatio;
		this._compressor.attack.value = presets.compressorAttack;
		this._compressor.release.value = presets.compressorRelease;

		// Gain node — compensates for volume loss from filtering
		this._gainNode = ctx.createGain();
		this._gainNode.gain.value = presets.outputGain;
	}

	/**
	 * Get filter presets for the given noise cancellation level.
	 */
	_getPreset(level) {
		switch (level) {
			case 'low':
				return {
					highpassFreq: 80,      // Gentle: only removes deep rumble
					lowpassFreq: 14000,     // Preserves most high frequencies
					notch1Freq: 50,         // Light electrical hum removal
					notch2Freq: 60,
					notchQ: 10,             // Narrow notch
					compressorThreshold: -50,
					compressorKnee: 40,
					compressorRatio: 2,
					compressorAttack: 0.003,
					compressorRelease: 0.1,
					outputGain: 1.1,
					noiseGateThreshold: -55
				};

			case 'aggressive':
				return {
					highpassFreq: 200,      // Aggressive: cuts more low frequencies
					lowpassFreq: 8000,      // Cuts high-frequency noise aggressively
					notch1Freq: 50,
					notch2Freq: 60,
					notchQ: 5,              // Wider notch
					compressorThreshold: -35,
					compressorKnee: 10,
					compressorRatio: 12,
					compressorAttack: 0.001,
					compressorRelease: 0.05,
					outputGain: 1.4,
					noiseGateThreshold: -40
				};

			case 'medium':
			default:
				return {
					highpassFreq: 120,      // Balanced: removes most rumble
					lowpassFreq: 10000,     // Balanced high-cut
					notch1Freq: 50,
					notch2Freq: 60,
					notchQ: 8,
					compressorThreshold: -42,
					compressorKnee: 20,
					compressorRatio: 6,
					compressorAttack: 0.002,
					compressorRelease: 0.08,
					outputGain: 1.2,
					noiseGateThreshold: -48
				};
		}
	}

	/**
	 * Start the noise gate monitoring loop.
	 * Reduces gain when signal level is below threshold (silence/noise only).
	 */
	_startNoiseGate() {
		if (this._noiseGateInterval) return;

		const bufferLength = this._analyser.frequencyBinCount;
		const dataArray = new Float32Array(bufferLength);
		const preset = this._getPreset(this._level);

		this._noiseGateInterval = setInterval(() => {
			if (!this._analyser || !this._enabled) return;

			this._analyser.getFloatTimeDomainData(dataArray);

			// Calculate RMS level
			let sumSquares = 0;
			for (let i = 0; i < bufferLength; i++) {
				sumSquares += dataArray[i] * dataArray[i];
			}
			const rms = Math.sqrt(sumSquares / bufferLength);
			const dB = 20 * Math.log10(Math.max(rms, 1e-10));

			this._currentNoiseLevel = dB;

			// Noise gate: reduce gain when signal is below threshold
			if (dB < preset.noiseGateThreshold) {
				// Below threshold — attenuate (noise gate closed)
				if (this._signalDetected) {
					this._signalDetected = false;
					this._gainNode.gain.linearRampToValueAtTime(
						0.05, // Nearly silent
						this._audioContext.currentTime + this._noiseGateRelease
					);
				}
			} else {
				// Above threshold — full volume (noise gate open)
				if (!this._signalDetected) {
					this._signalDetected = true;
					this._gainNode.gain.linearRampToValueAtTime(
						preset.outputGain,
						this._audioContext.currentTime + this._noiseGateAttack
					);
				}
			}
		}, 20); // Check every 20ms for responsive gating
	}

	/**
	 * Stop the noise gate monitoring.
	 */
	_stopNoiseGate() {
		if (this._noiseGateInterval) {
			clearInterval(this._noiseGateInterval);
			this._noiseGateInterval = null;
		}
	}

	/**
	 * Set the noise cancellation level.
	 * @param {'low'|'medium'|'aggressive'} level
	 */
	setLevel(level) {
		if (!['low', 'medium', 'aggressive'].includes(level)) {
			console.warn('🔇 NoiseCancellation: Invalid level:', level);
			return;
		}

		this._level = level;
		console.log('🔇 NoiseCancellation: Level set to', level);

		// If already processing, rebuild the filter chain
		if (this._enabled && this._sourceNode && this._audioContext) {
			this._rebuildFilterChain();
		}
	}

	/**
	 * Rebuild the filter chain with current settings (e.g., after level change).
	 */
	_rebuildFilterChain() {
		try {
			// Disconnect old chain
			this._sourceNode.disconnect();
			this._highpassFilter.disconnect();
			this._notchFilter1.disconnect();
			this._notchFilter2.disconnect();
			this._lowpassFilter.disconnect();
			this._compressor.disconnect();
			this._gainNode.disconnect();
			if (this._analyser) this._analyser.disconnect();

			// Stop old noise gate
			this._stopNoiseGate();

			// Create new filters
			this._createFilterChain();

			// Re-create analyser
			this._analyser = this._audioContext.createAnalyser();
			this._analyser.fftSize = 2048;
			this._analyser.smoothingTimeConstant = 0.8;

			// Reconnect
			this._sourceNode.connect(this._highpassFilter);
			this._highpassFilter.connect(this._notchFilter1);
			this._notchFilter1.connect(this._notchFilter2);
			this._notchFilter2.connect(this._lowpassFilter);
			this._lowpassFilter.connect(this._compressor);
			this._compressor.connect(this._gainNode);
			this._gainNode.connect(this._destinationNode);
			this._gainNode.connect(this._analyser);

			// Restart noise gate
			this._startNoiseGate();

			console.log('🔇 NoiseCancellation: Filter chain rebuilt with level:', this._level);
		} catch (error) {
			console.error('🔇 NoiseCancellation: Failed to rebuild filter chain:', error);
		}
	}

	/**
	 * Enable noise cancellation (if previously disabled).
	 */
	enable() {
		if (this._enabled) return;

		if (this._sourceNode && this._highpassFilter) {
			try {
				this._sourceNode.connect(this._highpassFilter);
				this._startNoiseGate();
				this._enabled = true;
				console.log('🔇 NoiseCancellation: Enabled');
			} catch (e) {
				console.warn('🔇 NoiseCancellation: Could not re-enable:', e.message);
			}
		}
	}

	/**
	 * Disable noise cancellation (bypass — pass audio through directly).
	 */
	disable() {
		if (!this._enabled) return;

		try {
			this._stopNoiseGate();

			// Disconnect filter chain
			if (this._sourceNode) {
				this._sourceNode.disconnect();
				// Connect source directly to destination (bypass)
				if (this._destinationNode) {
					this._sourceNode.connect(this._destinationNode);
				}
			}

			this._enabled = false;
			console.log('🔇 NoiseCancellation: Disabled (bypass mode)');
		} catch (e) {
			console.warn('🔇 NoiseCancellation: Error disabling:', e.message);
		}
	}

	/**
	 * Get the current noise reduction level in dB (approximate).
	 * @returns {number}
	 */
	getNoiseLevel() {
		return this._currentNoiseLevel;
	}

	/**
	 * Check if noise cancellation is currently enabled.
	 * @returns {boolean}
	 */
	isEnabled() {
		return this._enabled;
	}

	/**
	 * Get the current level setting.
	 * @returns {string}
	 */
	getLevel() {
		return this._level;
	}

	/**
	 * Completely destroy the noise cancellation pipeline and release resources.
	 */
	destroy() {
		console.log('🔇 NoiseCancellation: Destroying pipeline');

		this._stopNoiseGate();
		this._enabled = false;

		try {
			if (this._sourceNode) {
				this._sourceNode.disconnect();
				this._sourceNode = null;
			}
			if (this._highpassFilter) {
				this._highpassFilter.disconnect();
				this._highpassFilter = null;
			}
			if (this._lowpassFilter) {
				this._lowpassFilter.disconnect();
				this._lowpassFilter = null;
			}
			if (this._notchFilter1) {
				this._notchFilter1.disconnect();
				this._notchFilter1 = null;
			}
			if (this._notchFilter2) {
				this._notchFilter2.disconnect();
				this._notchFilter2 = null;
			}
			if (this._compressor) {
				this._compressor.disconnect();
				this._compressor = null;
			}
			if (this._gainNode) {
				this._gainNode.disconnect();
				this._gainNode = null;
			}
			if (this._analyser) {
				this._analyser.disconnect();
				this._analyser = null;
			}
			if (this._audioContext && this._audioContext.state !== 'closed') {
				this._audioContext.close();
				this._audioContext = null;
			}
		} catch (e) {
			console.warn('🔇 NoiseCancellation: Cleanup error:', e.message);
		}

		this._processedStream = null;
		this._originalStream = null;
		this._originalAudioTrack = null;
		this._destinationNode = null;
	}
}

// Create global instance
if (typeof window !== 'undefined') {
	window.FIceCoreNoiseCancel = new FIceCoreNoiseCancellation();
	console.log('✅ F-IceCore NoiseCancellation: Global instance created (window.FIceCoreNoiseCancel)');
}
