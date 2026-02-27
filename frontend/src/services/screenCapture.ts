/**
 * Screen Capture Service using Browser APIs
 *
 * Uses getDisplayMedia() to capture screen/window/tab
 * Records using MediaRecorder API
 * Sends video chunks to backend for storage
 */

import { buildApiUrl } from './backendUrls';

export interface ScreenCaptureOptions {
    sessionId: string;
    audio?: boolean;
    videoBitsPerSecond?: number;
}

export class ScreenCaptureService {
    private mediaRecorder: MediaRecorder | null = null;
    private stream: MediaStream | null = null;
    private chunks: Blob[] = [];
    private sessionId: string = '';
    private startTime: number = 0; // Track when recording actually started
    private isStopped: boolean = false; // Prevent multiple stop calls
    private uploadRetries: number = 3; // Max retries for upload

    /**
     * Get the actual recording start time
     */
    getStartTime(): number {
        return this.startTime;
    }

    /**
     * Start screen capture
     * Shows native OS dialog for user to select screen/window
     */
    async startCapture(options: ScreenCaptureOptions): Promise<void> {
        // Prevent starting if already recording
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            console.warn('[ScreenCapture] Already recording, ignoring start request');
            return;
        }

        // Validate session ID
        if (!options.sessionId || options.sessionId.trim() === '') {
            throw new Error('Session ID is required');
        }

        try {
            this.sessionId = options.sessionId;
            this.chunks = [];
            this.isStopped = false;

            // Check if getDisplayMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                throw new Error('Screen capture is not supported in this browser. Please use a modern browser like Chrome, Edge, or Firefox.');
            }

            // #region agent log
            fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'screenCapture.ts:51', message: '[ORCHESTRATION] MONITOR_SELECTOR_DISPLAY_START', data: { sessionId: options.sessionId }, timestamp: Date.now(), sessionId: options.sessionId, runId: 'orchestration', hypothesisId: 'ORCH' }) }).catch(() => { });
            // #endregion

            // Request screen capture with user selection dialog
            this.stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always', // Show cursor in recording
                    displaySurface: 'monitor', // Prefer monitor selection
                    frameRate: { ideal: 24, max: 24 }, // 24fps for QA efficiency
                } as any,
                audio: options.audio || false,
            });

            // #region agent log
            fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'screenCapture.ts:58', message: '[ORCHESTRATION] MONITOR_SELECTOR_COMPLETED', data: { sessionId: options.sessionId }, timestamp: Date.now(), sessionId: options.sessionId, runId: 'orchestration', hypothesisId: 'ORCH' }) }).catch(() => { });
            // #endregion

            // Validate stream
            if (!this.stream || this.stream.getVideoTracks().length === 0) {
                throw new Error('Failed to get video track from display media');
            }

            // Detect video track settings
            const videoTrack = this.stream.getVideoTracks()[0];
            const settings = videoTrack.getSettings();

            console.log('[ScreenCapture] Capturing:', {
                width: settings.width,
                height: settings.height,
                frameRate: settings.frameRate,
                displaySurface: settings.displaySurface,
            });

            // Create MediaRecorder with optimized settings
            const mimeType = this.getSupportedMimeType();
            if (!mimeType) {
                throw new Error('No supported MIME type found for MediaRecorder');
            }

            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType,
                videoBitsPerSecond: options.videoBitsPerSecond || 800000, // 800 Kbps optimal for QA
            });

            // Collect chunks
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.chunks.push(event.data);
                }
            };

            // #region agent log
            fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'screenCapture.ts:84', message: '[ORCHESTRATION] RECORDING_START', data: { sessionId: options.sessionId, mimeType }, timestamp: Date.now(), sessionId: options.sessionId, runId: 'orchestration', hypothesisId: 'ORCH' }) }).catch(() => { });
            // #endregion

            // Handle recording stop
            this.mediaRecorder.onstop = async () => {
                if (this.isStopped) return; // Prevent multiple executions
                this.isStopped = true;

                // #region agent log
                fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'screenCapture.ts:97', message: '[ORCHESTRATION] RECORDING_STOP', data: { sessionId: this.sessionId }, timestamp: Date.now(), sessionId: this.sessionId, runId: 'orchestration', hypothesisId: 'ORCH' }) }).catch(() => { });
                // #endregion

                try {
                    const videoPath = await this.saveRecording();

                    // #region agent log
                    fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'screenCapture.ts:102', message: '[ORCHESTRATION] RECORDING_SAVED', data: { sessionId: this.sessionId }, timestamp: Date.now(), sessionId: this.sessionId, runId: 'orchestration', hypothesisId: 'ORCH' }) }).catch(() => { });
                    // #endregion

                    // Post-process WebM to fix seekability issues
                    if (videoPath) {
                        try {
                            console.log('[ScreenCapture] Post-processing video for seekability...');
                            await this.postProcessWebM(videoPath);
                            console.log('[ScreenCapture] Post-processing complete');
                        } catch (postError) {
                            console.warn('[ScreenCapture] Post-processing failed, video may have seek issues:', postError);
                        }
                    }
                } catch (error) {
                    console.error('[ScreenCapture] Failed to save recording:', error);
                    // Don't throw - cleanup should still happen
                } finally {
                    this.cleanup();
                }
            };

            // Handle errors
            this.mediaRecorder.onerror = (event: any) => {
                console.error('[ScreenCapture] Recording error:', event.error);
                // Try to stop gracefully on error
                if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                    try {
                        this.mediaRecorder.stop();
                    } catch (stopError) {
                        console.error('[ScreenCapture] Error stopping after error:', stopError);
                    }
                }
            };

            // Detect when user stops sharing (closes the dialog)
            videoTrack.onended = () => {
                console.log('[ScreenCapture] User stopped sharing');
                // Only stop if not already stopped
                if (!this.isStopped && this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                    this.stopCapture();
                }
            };

            // Start recording (collect data every 1 second)
            this.mediaRecorder.start(1000);
            this.startTime = Date.now(); // Record actual start time

            console.log('[ScreenCapture] Recording started');
        } catch (error) {
            // Cleanup on error
            this.cleanup();
            console.error('[ScreenCapture] Failed to start capture:', error);

            // Provide user-friendly error messages
            if (error instanceof Error) {
                if (error.name === 'NotAllowedError' || error.name === 'NotReadableError') {
                    throw new Error('Screen capture permission denied. Please allow screen sharing and try again.');
                } else if (error.name === 'NotFoundError') {
                    throw new Error('No screen or window available for capture.');
                } else {
                    throw error;
                }
            }
            throw error;
        }
    }

    /**
     * Stop screen capture gracefully
     */
    async stopCapture(): Promise<void> {
        if (this.isStopped) {
            return; // Already stopped
        }

        try {
            // Stop MediaRecorder if active
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
                // Wait a bit for onstop to fire
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Stop all tracks
            if (this.stream) {
                this.stream.getTracks().forEach(track => {
                    track.stop();
                });
            }
        } catch (error) {
            console.error('[ScreenCapture] Error stopping capture:', error);
            // Force cleanup even on error
            this.cleanup();
        }
    }

    /**
     * Check if currently recording
     */
    isRecording(): boolean {
        return this.mediaRecorder !== null &&
            this.mediaRecorder.state === 'recording' &&
            !this.isStopped;
    }

    /**
     * Get recording start time
     */
    getStartTime(): number {
        return this.startTime;
    }

    /**
     * Get the best supported MIME type
     */
    private getSupportedMimeType(): string {
        const types = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4',
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                console.log('[ScreenCapture] Using MIME type:', type);
                return type;
            }
        }

        return ''; // Use default
    }

    /**
     * Save recording to backend with retry logic
     * Returns the video path if successful
     */
    private async saveRecording(): Promise<string | null> {
        if (this.chunks.length === 0) {
            console.warn('[ScreenCapture] No chunks to save');
            return null;
        }

        if (!this.sessionId) {
            console.error('[ScreenCapture] No session ID available for upload');
            return null;
        }

        let lastError: Error | null = null;

        // Retry logic
        for (let attempt = 1; attempt <= this.uploadRetries; attempt++) {
            try {
                const blob = new Blob(this.chunks, { type: 'video/webm' });

                // Validate blob size (should be > 0)
                if (blob.size === 0) {
                    throw new Error('Recording blob is empty');
                }

                const formData = new FormData();

                // Generate filename
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `screen-capture-${timestamp}.webm`;

                formData.append('video', blob, filename);
                formData.append('sessionId', this.sessionId);

                console.log('[ScreenCapture] Uploading recording:', {
                    size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
                    chunks: this.chunks.length,
                    attempt,
                });

                // Upload to backend
                const API_BASE_URL = buildApiUrl('/api/sessions/' + this.sessionId + '/screen-recording');
                const response = await fetch(API_BASE_URL, {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    const errorText = await response.text().catch(() => response.statusText);
                    throw new Error(`Upload failed: ${response.status} ${errorText}`);
                }

                const result = await response.json();
                console.log('[ScreenCapture] Recording saved successfully:', result);
                return result.path || filename; // Return video path
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.error(`[ScreenCapture] Upload attempt ${attempt}/${this.uploadRetries} failed:`, lastError);

                // Don't retry on certain errors
                if (error instanceof Error) {
                    if (error.message.includes('404') || error.message.includes('Session not found')) {
                        console.error('[ScreenCapture] Session not found, aborting retry');
                        throw error;
                    }
                }

                // Wait before retry (exponential backoff)
                if (attempt < this.uploadRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10s
                    console.log(`[ScreenCapture] Retrying upload in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // All retries failed
        throw lastError || new Error('Failed to upload recording after all retries');
    }

    /**
     * Post-process WebM video using FFmpeg to fix metadata and enable seeking
     * This solves the "streaming-like" behavior where seeking doesn't work
     */
    private async postProcessWebM(filename: string): Promise<void> {
        const API_BASE_URL = buildApiUrl('/api/sessions/' + this.sessionId + '/post-process-video');

        try {
            const response = await fetch(API_BASE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });

            if (!response.ok) {
                throw new Error(`Post-processing failed: ${response.status}`);
            }

            console.log('[ScreenCapture] Video post-processed successfully');
        } catch (error) {
            console.error('[ScreenCapture] Post-processing error:', error);
            throw error;
        }
    }

    /**
     * Cleanup resources
     */
    private cleanup(): void {
        // Stop all tracks
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
            });
        }

        // Clear references
        this.mediaRecorder = null;
        this.stream = null;
        this.chunks = [];
        this.isStopped = true;
    }
}
