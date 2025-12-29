import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { EventRecorder } from '../src/services/recorder.js';

describe('EventRecorder - Semantic Actions', () => {
    let browser: Browser;
    let page: Page;
    let recorder: EventRecorder;

    beforeAll(async () => {
        browser = await chromium.launch();
        page = await browser.newPage();
    });

    afterAll(async () => {
        await browser.close();
    });

    it('should generate semantic labels for clicks with aria-label', async () => {
        const recorder = new EventRecorder(
            page,
            { recordActions: true, recordConsole: false, recordNetwork: false },
            'test-session',
            new Date().toISOString()
        );

        // Create a simple HTML page with semantic elements
        await page.setContent(`
      <html>
        <body>
          <button aria-label="Close modal">X</button>
          <a href="#" title="Go to settings">Settings</a>
          <img src="logo.png" alt="Company logo" />
          <input type="text" placeholder="Enter email" />
          <button>Save Changes</button>
        </body>
      </html>
    `);

        // Wait for recorder to initialize
        await page.waitForTimeout(500);

        const events: any[] = [];
        recorder.on('event', (event) => {
            events.push(event);
        });

        // Test 1: Click button with aria-label
        await page.click('button[aria-label="Close modal"]');
        await page.waitForTimeout(100);

        const ariaLabelEvent = events.find(e => e.message.includes('Close modal'));
        expect(ariaLabelEvent).toBeDefined();
        expect(ariaLabelEvent.message).toBe('Clicked: "Close modal"');
        const ariaDetails = JSON.parse(ariaLabelEvent.details);
        expect(ariaDetails.element).toBe('BUTTON');
        expect(ariaDetails.action).toBe('click');

        // Test 2: Click link with title
        await page.click('a[title="Go to settings"]');
        await page.waitForTimeout(100);

        const titleEvent = events.find(e => e.message.includes('Go to settings'));
        expect(titleEvent).toBeDefined();
        expect(titleEvent.message).toBe('Clicked: "Go to settings"');

        // Test 3: Click image with alt
        await page.click('img[alt="Company logo"]');
        await page.waitForTimeout(100);

        const altEvent = events.find(e => e.message.includes('Company logo'));
        expect(altEvent).toBeDefined();
        expect(altEvent.message).toBe('Clicked: "Company logo"');

        // Test 4: Click button with text content
        await page.click('button:has-text("Save Changes")');
        await page.waitForTimeout(100);

        const textEvent = events.find(e => e.message.includes('Save Changes'));
        expect(textEvent).toBeDefined();
        expect(textEvent.message).toBe('Clicked: "Save Changes"');

        // Test 5: Input with placeholder
        await page.fill('input[placeholder="Enter email"]', 'test@example.com');
        await page.waitForTimeout(100);

        const inputEvent = events.find(e => e.message.includes('Enter email'));
        expect(inputEvent).toBeDefined();
        expect(inputEvent.message).toBe('Typed in: "Enter email"');
        const inputDetails = JSON.parse(inputEvent.details);
        expect(inputDetails.value).toBe('test@example.com');
    });

    it('should not include redundant information in details', async () => {
        const recorder = new EventRecorder(
            page,
            { recordActions: true, recordConsole: false, recordNetwork: false },
            'test-session-2',
            new Date().toISOString()
        );

        await page.setContent(`
      <html>
        <body>
          <button id="submit-btn" data-testid="submit-button">Submit Form</button>
        </body>
      </html>
    `);

        await page.waitForTimeout(500);

        const events: any[] = [];
        recorder.on('event', (event) => {
            events.push(event);
        });

        await page.click('#submit-btn');
        await page.waitForTimeout(100);

        const event = events.find(e => e.message.includes('Submit Form'));
        expect(event).toBeDefined();

        const details = JSON.parse(event.details);

        // Should have selector for automation
        expect(details.selector).toBe('#submit-btn');

        // Should have element type
        expect(details.element).toBe('BUTTON');

        // Should NOT have className
        expect(details.className).toBeUndefined();

        // Should NOT duplicate the semantic label in details.text if they're the same
        // (text is only included if different from semantic label)
        expect(details.text).toBeUndefined();
    });

    it('should fallback to generic element type when no semantic info available', async () => {
        const recorder = new EventRecorder(
            page,
            { recordActions: true, recordConsole: false, recordNetwork: false },
            'test-session-3',
            new Date().toISOString()
        );

        await page.setContent(`
      <html>
        <body>
          <img src="icon.png" />
          <div></div>
        </body>
      </html>
    `);

        await page.waitForTimeout(500);

        const events: any[] = [];
        recorder.on('event', (event) => {
            events.push(event);
        });

        // Click image without alt
        await page.click('img');
        await page.waitForTimeout(100);

        const imgEvent = events.find(e => e.type === 'ACTION' && e.message.includes('imagen'));
        expect(imgEvent).toBeDefined();
        expect(imgEvent.message).toBe('Clicked: "imagen"');

        // Click div without any semantic info
        await page.click('div');
        await page.waitForTimeout(100);

        const divEvent = events.filter(e => e.type === 'ACTION').pop();
        expect(divEvent.message).toBe('Clicked: "elemento"');
    });
});
