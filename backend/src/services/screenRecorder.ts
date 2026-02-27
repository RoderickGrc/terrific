import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { promises as fs } from 'fs';
import { ScreenSelection, SessionContext } from '../types/index.js';

export class ScreenRecorder {
    private ffmpegProcess: ChildProcess | null = null;
    private videoPath: string = '';
    private isRecording: boolean = false;

    /**
     * Start screen recording using FFmpeg with Windows GDI capture
     * @param sessionContext - The session context containing directory information
     * @param screenToRecord - Which screen(s) to record: 'primary', 'secondary', or 'all'
     */
    async startRecording(
        sessionContext: SessionContext,
        screenToRecord: ScreenSelection = 'primary'
    ): Promise<void> {
        if (this.isRecording) {
            throw new Error('Screen recording is already in progress');
        }

        // Use session context for directory path
        const sessionDir = sessionContext.sessionDir;

        // Ensure session directory exists
        await fs.mkdir(sessionDir, { recursive: true });

        // Generate video filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const videoFilename = `screen-recording-${timestamp}.mp4`;
        this.videoPath = join(sessionDir, videoFilename);

        // Build FFmpeg command based on screen selection (with auto-detection)
        const ffmpegArgs = await this.buildFFmpegArgs(screenToRecord, this.videoPath);

        console.log('[ScreenRecorder] Starting FFmpeg with args:', ffmpegArgs);

        // Spawn FFmpeg process
        this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Handle FFmpeg output
        this.ffmpegProcess.stdout?.on('data', (data) => {
            console.log(`[FFmpeg stdout]: ${data}`);
        });

        this.ffmpegProcess.stderr?.on('data', (data) => {
            // FFmpeg writes progress to stderr (not an error)
            const message = data.toString();
            if (message.includes('frame=') || message.includes('time=')) {
                // This is normal progress output
                console.log(`[FFmpeg progress]: ${message.trim()}`);
            } else if (message.includes('error') || message.includes('Error')) {
                console.error(`[FFmpeg error]: ${message}`);
            }
        });

        this.ffmpegProcess.on('close', (code) => {
            console.log(`[ScreenRecorder] FFmpeg process exited with code ${code}`);
            this.isRecording = false;
            this.ffmpegProcess = null;
        });

        this.ffmpegProcess.on('error', (error) => {
            console.error('[ScreenRecorder] FFmpeg process error:', error);
            this.isRecording = false;
            this.ffmpegProcess = null;
            throw new Error(`Failed to start screen recording: ${error.message}`);
        });

        this.isRecording = true;
        console.log(`[ScreenRecorder] Recording started: ${this.videoPath}`);
    }

    /**
     * Stop the screen recording gracefully
     */
    async stopRecording(): Promise<string> {
        if (!this.isRecording || !this.ffmpegProcess) {
            throw new Error('No active screen recording to stop');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.warn('[ScreenRecorder] FFmpeg did not exit gracefully, forcing kill');
                this.ffmpegProcess?.kill('SIGKILL');
                reject(new Error('FFmpeg process timeout'));
            }, 5000);

            this.ffmpegProcess!.on('close', () => {
                clearTimeout(timeout);
                this.isRecording = false;
                console.log(`[ScreenRecorder] Recording stopped: ${this.videoPath}`);
                resolve(this.videoPath);
            });

            // Send 'q' to FFmpeg to gracefully stop recording
            // This is the cleanest way to stop FFmpeg and ensure proper file finalization
            this.ffmpegProcess!.stdin?.write('q');
            this.ffmpegProcess!.stdin?.end();
        });
    }

    /**
     * Check if currently recording
     */
    isActivelyRecording(): boolean {
        return this.isRecording;
    }

    /**
     * Get the path to the current/last recording
     */
    getVideoPath(): string {
        return this.videoPath;
    }

    /**
     * Detect monitor dimensions using Windows API
     */
    private async detectMonitorDimensions(): Promise<{ primary: { width: number; height: number }, secondary?: { width: number; height: number } }> {
        return new Promise((resolve, reject) => {
            // Use PowerShell to get actual display dimensions
            const psCommand = `
                Add-Type -TypeDefinition @"
                    using System;
                    using System.Runtime.InteropServices;
                    public class DisplayInfo {
                        [DllImport("user32.dll")]
                        public static extern int GetSystemMetrics(int nIndex);
                        public static int GetPrimaryWidth() { return GetSystemMetrics(0); }
                        public static int GetPrimaryHeight() { return GetSystemMetrics(1); }
                        public static int GetVirtualWidth() { return GetSystemMetrics(78); }
                        public static int GetVirtualHeight() { return GetSystemMetrics(79); }
                    }
"@
                $primaryWidth = [DisplayInfo]::GetPrimaryWidth()
                $primaryHeight = [DisplayInfo]::GetPrimaryHeight()
                $virtualWidth = [DisplayInfo]::GetVirtualWidth()
                $virtualHeight = [DisplayInfo]::GetVirtualHeight()
                $secondaryWidth = $virtualWidth - $primaryWidth
                $secondaryHeight = $virtualHeight
                Write-Output "{\`"primary\`": {\`"width\`":$primaryWidth,\`"height\`":$primaryHeight},\`"secondary\`": {\`"width\`":$secondaryWidth,\`"height\`":$secondaryHeight}}"
            `;

                    const process = spawn('powershell', ['-Command', psCommand]);
                    let output = '';
                    let errorOutput = '';

                    process.stdout?.on('data', (data) => {
                        output += data.toString();
                    });

                    process.stderr?.on('data', (data) => {
                        errorOutput += data.toString();
                    });

                    process.on('close', (code) => {
                        if (code === 0 && output.trim()) {
                            try {
                                const parsed = JSON.parse(output.trim());
                                resolve(parsed);
                            } catch (parseError) {
                                // Fallback to default dimensions if parsing fails
                                console.warn('[ScreenRecorder] Failed to parse monitor dimensions, using defaults');
                                resolve({
                                    primary: { width: 1920, height: 1080 },
                                    secondary: { width: 1920, height: 1080 }
                                });
                            }
                        } else {
                            // Fallback to default dimensions if detection fails
                            console.warn('[ScreenRecorder] Failed to detect monitor dimensions, using defaults');
                            resolve({
                                primary: { width: 1920, height: 1080 },
                                secondary: { width: 1920, height: 1080 }
                            });
                        }
                    });
                });
    }

    /**
     * Build FFmpeg arguments for Windows screen capture
     * Uses gdigrab for Windows desktop capture
     */
    private async buildFFmpegArgs(screenToRecord: ScreenSelection, outputPath: string): Promise<string[]> {
        const baseArgs: string[] = [];

        // Optimized settings for QA recordings
        const fps = '24';  // 24 FPS optimal for QA (saves ~20% resources)
        const drawMouse = '1';

        // Auto-detect monitor dimensions
        const dimensions = await this.detectMonitorDimensions();
        const monitor1Width = dimensions.primary.width;
        const monitor1Height = dimensions.primary.height;
        const monitor2Width = dimensions.secondary?.width || monitor1Width;
        const monitor2Height = dimensions.secondary?.height || monitor1Height;

        // Input configuration based on screen selection
        switch (screenToRecord) {
            case 'primary':
                // Capture ONLY the primary (left) monitor
                // IMPORTANT: Must specify video_size to avoid capturing entire virtual screen
                baseArgs.push(
                    '-f', 'gdigrab',
                    '-framerate', fps,
                    '-draw_mouse', drawMouse,
                    '-offset_x', '0',          // Start at left edge
                    '-offset_y', '0',          // Start at top edge
                    '-video_size', `${monitor1Width}x${monitor1Height}`, // ONLY monitor 1
                    '-i', 'desktop',
                );
                break;

            case 'secondary':
                // Capture ONLY the secondary (right) monitor
                baseArgs.push(
                    '-f', 'gdigrab',
                    '-framerate', fps,
                    '-draw_mouse', drawMouse,
                    '-offset_x', `${monitor1Width}`,  // Start after first monitor
                    '-offset_y', '0',
                    '-video_size', `${monitor2Width}x${monitor2Height}`, // ONLY monitor 2
                    '-i', 'desktop',
                );
                break;

            case 'all':
                // Capture BOTH monitors as extended desktop
                const totalWidth = monitor1Width + monitor2Width;
                const totalHeight = Math.max(monitor1Height, monitor2Height);

                baseArgs.push(
                    '-f', 'gdigrab',
                    '-framerate', fps,
                    '-draw_mouse', drawMouse,
                    '-offset_x', '0',
                    '-offset_y', '0',
                    '-video_size', `${totalWidth}x${totalHeight}`, // Full virtual screen
                    '-i', 'desktop',
                );
                break;
        }

        // Output configuration
        const outputArgs = [
            '-c:v', 'libx264',           // H.264 codec
            '-preset', 'ultrafast',      // Fastest encoding (important for real-time)
            '-crf', '23',                // Quality (18-28, lower = better quality)
            '-pix_fmt', 'yuv420p',       // Pixel format for compatibility
            '-movflags', '+faststart',   // Enable fast start for web playback
            '-y',                        // Overwrite output file if exists
            outputPath
        ];

        return [...baseArgs, ...outputArgs];
    }

    /**
     * Check if FFmpeg is available on the system
     */
    static async checkFFmpegAvailability(): Promise<boolean> {
        return new Promise((resolve) => {
            const process = spawn('ffmpeg', ['-version']);
            process.on('error', () => resolve(false));
            process.on('close', (code) => resolve(code === 0));
        });
    }

    /**
     * Get display information (for debugging/configuration)
     */
    static async getDisplayInfo(): Promise<string> {
        return new Promise((resolve, reject) => {
            // Use PowerShell to get display information
            const psCommand = 'Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorBasicDisplayParams | Select-Object InstanceName, MaxHorizontalImageSize, MaxVerticalImageSize';
            const process = spawn('powershell', ['-Command', psCommand]);

            let output = '';
            process.stdout?.on('data', (data) => {
                output += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error('Failed to get display information'));
                }
            });
        });
    }
}
