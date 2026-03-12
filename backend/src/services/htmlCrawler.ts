import { Page } from 'playwright';
import TurndownService from 'turndown';
import { truncateLongLine, cleanTextContent, isEffectivelyEmpty } from '../utils/textUtils.js';

// 🔧 FILTRO DE CONTENIDO VISIBLE
// Set to true to capture ONLY visible content (reduces crawl size by 40-60%)
// DISABLED: Was filtering too much content, including important page elements
const FILTER_VISIBLE_ONLY = false;

/**
 * Service to crawl HTML content from a page and convert it to clean Markdown
 */
export class HtmlCrawler {
    private turndownService: TurndownService;

    constructor() {
        this.turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            emDelimiter: '_',
            bulletListMarker: '-',
        });

        // Configure turndown to skip irrelevant elements
        this.configureTurndown();
    }

    private configureTurndown() {
        // Remove scripts, styles, and other non-content elements
        this.turndownService.remove(['script', 'style', 'noscript', 'iframe', 'svg']);

        // Simplify image URLs - keep alt text but remove the actual URL
        this.turndownService.addRule('simplifyImages', {
            filter: 'img',
            replacement: (content, node: any) => {
                const alt = node.alt || 'Image';
                return `![${alt}]()`;
            },
        });

        // Simplify links - keep text but remove href for context only
        this.turndownService.addRule('simplifyLinks', {
            filter: (node: any) => {
                return node.nodeName === 'A' && node.getAttribute('href') !== null;
            },
            replacement: (content) => {
                const text = cleanTextContent(content);
                return isEffectivelyEmpty(text) ? '' : text;
            },
        });

        // Capture Buttons (with intelligent content flattening)
        this.turndownService.addRule('buttons', {
            filter: 'button',
            replacement: (content, node: any) => {
                // Clean the content by removing extra whitespace and newlines
                let text = cleanTextContent(content);

                // Fallback to aria-label or title if content is empty
                if (isEffectivelyEmpty(text)) {
                    text = node.getAttribute('aria-label') || node.getAttribute('title') || 'Button';
                }

                return ` [BUTTON: ${text}] `;
            },
        });

        // Capture Inputs (excluding hidden/submit/button/image which might be handled differently)
        this.turndownService.addRule('inputs', {
            filter: (node: any) => {
                return node.nodeName === 'INPUT' &&
                    !['hidden', 'submit', 'button', 'image', 'reset'].includes(node.type);
            },
            replacement: (content, node: any) => {
                const placeholder = node.getAttribute('placeholder') || '';
                const type = node.getAttribute('type') || 'text';
                const label = placeholder ? `${type} - ${placeholder}` : type;
                return ` [INPUT: ${label}] `;
            },
        });

        // Capture Textareas
        this.turndownService.addRule('textareas', {
            filter: 'textarea',
            replacement: (content, node: any) => {
                const placeholder = node.getAttribute('placeholder') || 'text area';
                return ` [TEXTAREA: ${placeholder}] `;
            },
        });

        // Capture Selects
        this.turndownService.addRule('selects', {
            filter: 'select',
            replacement: (content, node: any) => {
                const ariaLabel = node.getAttribute('aria-label');
                const name = node.getAttribute('name');
                const label = ariaLabel || name || 'Select';
                return ` [SELECT: ${label}] `;
            },
        });
    }

    /**
     * Crawl the current page and convert to clean Markdown
     */
    async crawlPage(page: Page): Promise<string> {
        try {
            // Get the HTML content from the page (visible only if flag is enabled)
            const htmlContent = await page.evaluate((filterVisible: boolean) => {
                // @ts-expect-error - Code runs in browser context
                const clone = document.body.cloneNode(true) as HTMLElement;

                // Common selectors to remove
                const selectorsToRemove = [
                    'script', 'style', 'noscript', 'iframe', 'svg',
                    '[role="presentation"]',
                    '.ad', '.advertisement',
                    '[class*="cookie"]', '[id*="cookie"]',
                ];

                selectorsToRemove.forEach(selector => {
                    // @ts-expect-error - Code runs in browser context
                    clone.querySelectorAll(selector).forEach((el) => el.remove());
                });

                // 🔍 FILTER VISIBLE CONTENT ONLY
                if (filterVisible) {
                    // @ts-expect-error - Code runs in browser context
                    const allElements = document.body.querySelectorAll('*');
                    const hiddenClasses = new Set<string>();

                    // @ts-expect-error - Code runs in browser context
                    allElements.forEach((el) => {
                        // @ts-expect-error - Code runs in browser context
                        const style = window.getComputedStyle(el);
                        const isHidden =
                            style.display === 'none' ||
                            style.visibility === 'hidden' ||
                            parseFloat(style.opacity) === 0;


                        if (isHidden && el.className && typeof el.className === 'string') {
                            el.className.split(' ').forEach((cls: string) => {
                                if (cls) hiddenClasses.add(cls);
                            });
                        }
                    });

                    // Remove elements with hidden classes from clone
                    hiddenClasses.forEach(cls => {
                        try {
                            clone.querySelectorAll('.' + cls).forEach((el: any) => el.remove());
                        } catch (e) {
                            // Ignore invalid selectors
                        }
                    });
                }

                return clone.innerHTML;
            }, FILTER_VISIBLE_ONLY);

            // Convert to Markdown
            let markdown = this.turndownService.turndown(htmlContent);
            // Post-processing cleanup
            markdown = this.cleanMarkdown(markdown);
            return markdown;
        } catch (error) {
            console.error('[HtmlCrawler] Error crawling page:', error);
            throw error;
        }
    }

    /**
     * Clean up the generated Markdown
     */
    private cleanMarkdown(markdown: string): string {
        // Remove excessive blank lines (more than 2 consecutive)
        markdown = markdown.replace(/\n{3,}/g, '\n\n');

        // Truncate long lines and remove trailing whitespace
        markdown = markdown.split('\n')
            .map(line => truncateLongLine(line.trimEnd(), 400))
            .join('\n');

        // Remove common tracking/analytics text patterns
        markdown = markdown.replace(/\[object Object\]/g, '');
        markdown = markdown.replace(/undefined/g, '');

        // Remove empty links and images
        markdown = markdown.replace(/!\[\]\(\)/g, '');
        markdown = markdown.replace(/\[\]\(\)/g, '');

        // Trim the final result
        return markdown.trim();
    }

    /**
     * Get page metadata along with content
     */
    async crawlPageWithMetadata(page: Page): Promise<{
        url: string;
        title: string;
        markdown: string;
        wordCount: number;
        characterCount: number;
    }> {
        const markdown = await this.crawlPage(page);
        const url = page.url();
        const title = await page.title();

        // Calculate stats
        const wordCount = markdown.split(/\s+/).filter(word => word.length > 0).length;
        const characterCount = markdown.length;

        return {
            url,
            title,
            markdown,
            wordCount,
            characterCount,
        };
    }
}
