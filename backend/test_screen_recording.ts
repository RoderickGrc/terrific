/**
 * Test script for ScreenRecorder service
 * 
 * This script tests the screen recording functionality:
 * 1. Starts a 5-second screen recording
 * 2. Stops the recording gracefully
 * 3. Verifies the output file exists
 * 
 * Run with: npm run test:screen-record
 */

import { ScreenRecorder } from './src/services/screenRecorder.js';
import { generateShortId } from './src/utils/id.js';
import { promises as fs } from 'fs';

async function testScreenRecording() {
    console.log('🎬 Starting Screen Recording Test...\n');

    // Check FFmpeg availability
    const ffmpegAvailable = await ScreenRecorder.checkFFmpegAvailability();
    if (!ffmpegAvailable) {
        console.error('❌ FFmpeg is not available. Please install FFmpeg first.');
        console.log('   See: docs/SCREEN_RECORDING.md for installation instructions');
        process.exit(1);
    }
    console.log('✅ FFmpeg is available\n');

    // Create a test session ID
    const sessionId = generateShortId(10);
    const createdAt = new Date().toISOString();

    console.log(`📝 Test Session ID: ${sessionId}`);
    console.log(`📅 Created At: ${createdAt}\n`);

    // Test different screen modes
    const modes = ['primary', 'secondary', 'all'] as const;
    const testMode = 'primary'; // Change this to test different modes

    console.log(`🖥️  Testing screen mode: ${testMode.toUpperCase()}\n`);

    const recorder = new ScreenRecorder();

    try {
        // Start recording
        console.log('▶️  Starting recording...');
        await recorder.startRecording(sessionId, testMode, createdAt);
        console.log('✅ Recording started successfully\n');

        // Record for 5 seconds
        console.log('⏱️  Recording for 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Stop recording
        console.log('\n⏹️  Stopping recording...');
        const videoPath = await recorder.stopRecording();
        console.log(`✅ Recording stopped: ${videoPath}\n`);

        // Verify file exists
        const stats = await fs.stat(videoPath);
        console.log(`📊 File Stats:`);
        console.log(`   - Path: ${videoPath}`);
        console.log(`   - Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   - Created: ${stats.birthtime.toISOString()}`);
        console.log('\n✅ Screen recording test completed successfully!');
        console.log(`\n💡 You can play the video with: ffplay "${videoPath}"`);

    } catch (error) {
        console.error('\n❌ Screen recording test failed:');
        console.error(error);
        process.exit(1);
    }
}

// Run the test
testScreenRecording().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
