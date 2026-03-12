import { Page } from 'playwright';
import { EventEmitter } from 'events';
import { EventType, QAEvent, SessionContext } from '../types/index.js';
import { generateShortId, generateEventId } from '../utils/id.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { HtmlCrawler } from './htmlCrawler.js';

export class EventRecorder extends EventEmitter {
  private page: Page;
  private config: {
    recordActions: boolean;
    recordConsole: boolean;
    recordNetwork: boolean;
    crawlOnReload?: boolean;
    crawlOnScreenshot?: boolean;
  };
  private events: QAEvent[] = [];
  private sessionContext: SessionContext;
  private htmlCrawler: HtmlCrawler;

  constructor(page: Page, config: { recordActions: boolean; recordConsole: boolean; recordNetwork: boolean; crawlOnReload?: boolean; crawlOnScreenshot?: boolean }, sessionContext: SessionContext) {
    super();
    this.page = page;
    this.config = config;
    this.sessionContext = sessionContext;
    this.htmlCrawler = new HtmlCrawler();
    // Wait for page to be ready before setting up listeners
    this.setupListeners();
  }


  private getActionVerb(actionType: string): string {
    const verbs: Record<string, string> = {
      'click': 'Clicked',
      'input': 'Typed in',
      'change': 'Changed',
    };
    return verbs[actionType] || actionType;
  }

  private setupListeners() {
    // Detectar recargas de página
    this.page.on('load', async () => {
      const event: QAEvent = {
        id: generateEventId('pr'),
        type: EventType.PAGE_RELOAD,
        message: `Page reloaded: ${this.page.url()}`,
        timestamp: new Date().toISOString(),
        details: JSON.stringify({
          url: this.page.url(),
          title: '', // Se llenará después del load
        }, null, 2),
      };

      // Obtener el título de la página después de que cargue
      this.page.title().then(title => {
        const details = JSON.parse(event.details || '{}');
        details.title = title;
        event.details = JSON.stringify(details, null, 2);
      }).catch(() => {
        // Ignorar errores al obtener el título
      });

      this.events.push(event);
      this.emit('event', event);

      // Auto-crawl on reload if enabled
      if (this.config.crawlOnReload) {
        try {
          await this.captureCrawl();
        } catch (error) {
          console.error('[Recorder] Auto-crawl on reload failed:', error);
        }
      }
    });

    if (this.config.recordConsole) {
      this.page.on('console', (msg) => {
        const type = msg.type();
        const text = msg.text();

        const event: QAEvent = {
          id: generateEventId('cs'),
          type: EventType.CONSOLE,
          message: `Console ${type}: ${text}`,
          timestamp: new Date().toISOString(),
          details: text,
        };

        this.events.push(event);
        this.emit('event', event);
      });
    }

    if (this.config.recordNetwork) {
      this.page.on('request', (request) => {
        const method = request.method();
        const postData = request.postData();

        // Only capture body for methods that typically have one
        let body: any = undefined;
        if (postData && ['POST', 'PUT', 'PATCH'].includes(method)) {
          try {
            body = JSON.parse(postData);
          } catch {
            body = postData; // Keep as string if not valid JSON
          }
        }

        const event: QAEvent = {
          id: generateEventId('nt'),
          type: EventType.NETWORK,
          message: `${method} ${request.url()}`,
          timestamp: new Date().toISOString(),
          // Only include body if present - don't duplicate method/url/headers
          details: body ? JSON.stringify({ body }, null, 2) : undefined,
        };

        this.events.push(event);
        this.emit('event', event);
      });

      this.page.on('response', async (response) => {
        const method = response.request().method();
        const contentType = response.headers()['content-type'] || '';

        // Capture response body for API responses (JSON, text, etc)
        let responseBody: any = undefined;
        const isTextResponse = contentType.includes('application/json') ||
          contentType.includes('text/') ||
          contentType.includes('application/xml');

        // Only capture body for likely API responses (not images, fonts, etc)
        if (isTextResponse) {
          try {
            const bodyText = await response.text();
            // Limit body size to prevent excessive memory usage (100KB max)
            const truncatedBody = bodyText.length > 100000
              ? bodyText.substring(0, 100000) + '...[TRUNCATED]'
              : bodyText;

            // Try to parse as JSON for better readability
            try {
              responseBody = JSON.parse(truncatedBody);
            } catch {
              // Keep as string if not valid JSON
              responseBody = truncatedBody;
            }
          } catch (error) {
            // Body already consumed or binary - ignore
          }
        }

        const details: any = {
          method,
          status: response.status(),
          statusText: response.statusText(),
          url: response.url(),
        };

        // Include response body if captured
        if (responseBody !== undefined) {
          details.responseBody = responseBody;
        }

        const event: QAEvent = {
          id: generateEventId('nt'),
          type: EventType.NETWORK,
          message: `${response.status()} ${response.url()}`,
          timestamp: new Date().toISOString(),
          details: JSON.stringify(details, null, 2),
        };

        this.events.push(event);
        this.emit('event', event);
      });
    }

    if (this.config.recordActions) {
      // Expose function FIRST before using it in evaluate
      // exposeFunction is persistent across navigations
      this.page.exposeFunction('__qaEventCapture', (eventData: any) => {
        // Generate semantic message
        const actionVerb = this.getActionVerb(eventData.type);
        const semanticLabel = eventData.semanticLabel || 'elemento sin descripción';
        const message = `${actionVerb}: "${semanticLabel}"`;

        // Build details with all captured metadata
        const details: any = {
          action: eventData.type,
          element: eventData.tagName,
        };

        // Add selector info if available (for automation)
        if (eventData.id) {
          details.selector = `#${eventData.id}`;
        } else if (eventData.dataTestId) {
          details.selector = `[data-testid="${eventData.dataTestId}"]`;
        }

        // Add extended metadata for automation
        if (eventData.xpath) details.xpath = eventData.xpath;
        if (eventData.cssPath) details.cssPath = eventData.cssPath;
        if (eventData.roleSelector) details.roleSelector = eventData.roleSelector;

        if (eventData.parentElement) details.parentElement = eventData.parentElement;
        if (eventData.classes && eventData.classes.length > 0) details.classes = eventData.classes;
        if (eventData.attributes) details.attributes = eventData.attributes;

        if (eventData.disabled !== undefined) details.disabled = eventData.disabled;
        if (eventData.checked !== undefined) details.checked = eventData.checked;
        if (eventData.readonly !== undefined) details.readonly = eventData.readonly;
        if (eventData.focused !== undefined) details.focused = eventData.focused;

        // Add value info for inputs/selects
        if (eventData.value !== undefined) {
          details.value = eventData.value;
        }
        if (eventData.inputType) details.inputType = eventData.inputType;
        if (eventData.selectedText) {
          details.selectedText = eventData.selectedText;
        }

        // Validation metadata
        if (eventData.validity) details.validity = eventData.validity;
        if (eventData.validationMessage) details.validationMessage = eventData.validationMessage;
        if (eventData.required !== undefined) details.required = eventData.required;
        if (eventData.pattern) details.pattern = eventData.pattern;

        // Form metadata
        if (eventData.formId) details.formId = eventData.formId;
        if (eventData.formAction) details.formAction = eventData.formAction;
        if (eventData.formMethod) details.formMethod = eventData.formMethod;

        // Event modifiers
        if (eventData.modifierKeys) details.modifierKeys = eventData.modifierKeys;
        if (eventData.button !== undefined) details.button = eventData.button;

        // Add text content if different from semantic label (useful for automation)
        if (eventData.text && eventData.text !== semanticLabel) {
          details.text = eventData.text;
        }

        const event: QAEvent = {
          id: generateEventId('ac'),
          type: EventType.ACTION,
          message,
          timestamp: new Date().toISOString(),
          details: JSON.stringify(details, null, 2),
        };

        this.events.push(event);
        this.emit('event', event);
      }).catch((exposeError) => {
        // Function might already be exposed, which is fine
        if (!exposeError.message.includes('Function name __qaEventCapture has already been registered')) {
          console.error('Error exposing function:', exposeError);
        }
      });

      const injectScript = `
        (function() {
          // Use a flag to avoid double injection
          if (window.__qaEventCaptureInitialized) return;
          window.__qaEventCaptureInitialized = true;

          function generateSemanticLabel(target) {
            // Heuristic priority order for semantic labeling
            
            // 1. aria-label (explicit semantic label)
            if (target.getAttribute('aria-label')) {
              return target.getAttribute('aria-label').trim();
            }
            
            // 2. title attribute (tooltip/description)
            if (target.title) {
              return target.title.trim();
            }
            
            // 3. alt attribute (for images)
            if (target.tagName === 'IMG' && target.alt) {
              return target.alt.trim();
            }
            
            // 4. placeholder (for inputs)
            if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target.placeholder) {
              return target.placeholder.trim();
            }
            
            // 5. innerText (visible text content)
            const text = target.innerText || target.textContent;
            if (text && text.trim()) {
              const cleanText = text.trim().replace(/\\s+/g, ' ');
              return cleanText.substring(0, 100);
            }
            
            // 6. value attribute (for buttons/submit inputs)
            if ((target.tagName === 'INPUT' || target.tagName === 'BUTTON') && target.value) {
              return target.value.trim();
            }
            
            // 7. Associated label (for form inputs)
            if (target.id) {
              const label = document.querySelector(\`label[for="\${target.id}"]\`);
              if (label && label.textContent) {
                return label.textContent.trim();
              }
            }
            
            // 8. name attribute (humanized)
            if (target.name) {
              return target.name.replace(/[_-]/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
            }
            
            // 9. Fallback to generic element type
            const elementTypes = {
              'IMG': 'imagen',
              'BUTTON': 'botón',
              'A': 'enlace',
              'INPUT': 'campo de entrada',
              'TEXTAREA': 'área de texto',
              'SELECT': 'selector',
              'NAV': 'navegación',
              'FORM': 'formulario',
            };
            
            return elementTypes[target.tagName] || 'elemento';
          }

          function getXPath(element) {
            if (element.id) {
              return \`//*[@id="\${element.id}"]\`;
            }
            
            const parts = [];
            let current = element;
            
            while (current && current.nodeType === Node.ELEMENT_NODE) {
              let index = 0;
              let sibling = current.previousSibling;
              
              while (sibling) {
                if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
                  index++;
                }
                sibling = sibling.previousSibling;
              }
              
              const tagName = current.nodeName.toLowerCase();
              const pathIndex = index > 0 ? \`[\${index + 1}]\` : '';
              parts.unshift(tagName + pathIndex);
              
              current = current.parentNode;
            }
            
            return parts.length ? '/' + parts.join('/') : '';
          }
          
          function getCssPath(element) {
            if (element.id) {
              return \`#\${element.id}\`;
            }
            
            const path = [];
            let current = element;
            
            while (current && current.nodeType === Node.ELEMENT_NODE) {
              let selector = current.nodeName.toLowerCase();
              
              if (current.className && typeof current.className === 'string') {
                const classes = current.className.trim().split(/\\s+/).filter(c => c);
                if (classes.length > 0) {
                  selector += '.' + classes.join('.');
                }
              }
              
              // Add nth-child if needed for uniqueness
              let sibling = current;
              let nth = 1;
              while (sibling.previousElementSibling) {
                sibling = sibling.previousElementSibling;
                if (sibling.nodeName === current.nodeName) nth++;
              }
              
              if (nth > 1 || current.nextElementSibling) {
                selector += \`:nth-child(\${nth})\`;
              }
              
              path.unshift(selector);
              current = current.parentElement;
              
              // Stop at body or if we have enough specificity
              if (!current || current.nodeName === 'BODY' || path.length > 5) {
                break;
              }
            }
            
            return path.join(' > ');
          }

          function captureEvent(type, target, event) {
            if (!target) return;
            
            const semanticLabel = generateSemanticLabel(target);
            
            const eventData = {
              type: type,
              tagName: target.tagName,
              semanticLabel: semanticLabel,
              id: target.id || undefined,
              dataTestId: target.getAttribute('data-testid') || target.getAttribute('data-qa') || undefined,
              text: target.textContent ? target.textContent.substring(0, 100).trim() : undefined,
            };
            
            // === SELECTORES ROBUSTOS ===
            eventData.xpath = getXPath(target);
            eventData.cssPath = getCssPath(target);
            
            const role = target.getAttribute('role') || target.getAttribute('aria-role');
            if (role) {
              eventData.roleSelector = \`[role="\${role}"]\`;
            }
            
            // === CONTEXTO DEL DOM ===
            if (target.parentElement) {
              eventData.parentElement = {
                tagName: target.parentElement.tagName,
                id: target.parentElement.id || undefined,
                classes: target.parentElement.className ? 
                  target.parentElement.className.trim().split(/\\s+/).filter(c => c) : []
              };
            }
            
            // Classes del elemento
            if (target.className && typeof target.className === 'string') {
              eventData.classes = target.className.trim().split(/\\s+/).filter(c => c);
            }
            
            // Atributos relevantes
            const relevantAttrs = ['role', 'name', 'type', 'href', 'src', 'alt', 'title', 
                                   'placeholder', 'aria-label', 'aria-describedby', 'aria-required'];
            const attributes = {};
            relevantAttrs.forEach(attr => {
              const value = target.getAttribute(attr);
              if (value) attributes[attr] = value;
            });
            if (Object.keys(attributes).length > 0) {
              eventData.attributes = attributes;
            }
            
            // === ESTADO DEL ELEMENTO ===
            if (target.disabled !== undefined) {
              eventData.disabled = target.disabled;
            }
            if (target.type === 'checkbox' || target.type === 'radio') {
              eventData.checked = target.checked;
            }
            if (target.readOnly !== undefined) {
              eventData.readonly = target.readOnly;
            }
            eventData.focused = document.activeElement === target;
            
            // === VALORES DE INPUT ===
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
              eventData.value = target.value;
              eventData.inputType = target.type || 'text';
              
              // Validación de formularios
              if (target.validity) {
                eventData.validity = {
                  valid: target.validity.valid,
                  valueMissing: target.validity.valueMissing,
                  typeMismatch: target.validity.typeMismatch,
                  patternMismatch: target.validity.patternMismatch,
                  tooLong: target.validity.tooLong,
                  tooShort: target.validity.tooShort,
                  rangeUnderflow: target.validity.rangeUnderflow,
                  rangeOverflow: target.validity.rangeOverflow,
                  stepMismatch: target.validity.stepMismatch,
                  badInput: target.validity.badInput,
                  customError: target.validity.customError
                };
              }
              if (target.validationMessage) {
                eventData.validationMessage = target.validationMessage;
              }
              if (target.required !== undefined) {
                eventData.required = target.required;
              }
              if (target.pattern) {
                eventData.pattern = target.pattern;
              }
            }
            
            // Para selects, capturar la opción seleccionada
            if (target.tagName === 'SELECT') {
              eventData.value = target.value;
              eventData.selectedText = target.options[target.selectedIndex]?.text;
            }
            
            // === INFORMACIÓN DE FORMULARIO ===
            const form = target.closest('form');
            if (form) {
              eventData.formId = form.id || undefined;
              eventData.formAction = form.action || undefined;
              eventData.formMethod = form.method || undefined;
            }
            
            // === MODIFICADORES DE EVENTO ===
            if (event) {
              eventData.modifierKeys = {
                ctrl: event.ctrlKey || false,
                shift: event.shiftKey || false,
                alt: event.altKey || false,
                meta: event.metaKey || false
              };
              
              // Para clicks, capturar botón del mouse
              if (type === 'click' && event.button !== undefined) {
                eventData.button = event.button; // 0=left, 1=middle, 2=right
              }
            }
            
            if (typeof window.__qaEventCapture === 'function') {
              window.__qaEventCapture(eventData);
            }
          }

          document.addEventListener('click', function(e) {
            captureEvent('click', e.target, e);
          }, true);

          document.addEventListener('input', function(e) {
            captureEvent('input', e.target, e);
          }, true);

          document.addEventListener('change', function(e) {
            captureEvent('change', e.target, e);
          }, true);
        })();
      `;

      // addInitScript ensures the script is injected into every new document (reloads, navigations)
      this.page.addInitScript(injectScript).catch((error) => {
        console.error('Error adding init script:', error);
      });

      // Also evaluate immediately for the current document
      this.page.evaluate(injectScript).catch((error) => {
        // Silently fail if page is navigating
      });
    }
  }

  addNote(message: string): QAEvent {
    const event: QAEvent = {
      id: generateEventId('no'),
      type: EventType.NOTE,
      message,
      timestamp: new Date().toISOString(),
    };

    this.events.push(event);
    this.emit('event', event);
    return event;
  }

  addFlag(message: string): QAEvent {
    const event: QAEvent = {
      id: generateEventId('fl'),
      type: EventType.FLAG,
      message,
      timestamp: new Date().toISOString(),
    };

    this.events.push(event);
    this.emit('event', event);
    return event;
  }

  addBug(message: string): QAEvent {
    const event: QAEvent = {
      id: generateEventId('bg'),
      type: EventType.BUG,
      message,
      timestamp: new Date().toISOString(),
    };

    this.events.push(event);
    this.emit('event', event);
    return event;
  }

  async captureScreenshot(): Promise<QAEvent> {
    try {
      // Capture screenshot as buffer
      const screenshot = await this.page.screenshot({
        type: 'png',
        fullPage: false // Only capture viewport to reduce size
      });

      // Save screenshot to file with timestamp for ordering
      // Use session context for directory path
      const sessionDir = this.sessionContext.sessionDir;
      // Ensure directory exists (should already exist from playwright, but ensure it)
      await fs.mkdir(sessionDir, { recursive: true });

      const timestamp = Date.now();
      const screenshotId = generateEventId('ss');
      // Format: screenshot-{timestamp}-{uuid}.png for chronological ordering
      // Timestamp ensures files are always sorted by time
      const screenshotFilename = `screenshot-${timestamp}-${screenshotId.substring(0, 8)}.png`;
      const screenshotPath = join(sessionDir, screenshotFilename);

      await fs.writeFile(screenshotPath, screenshot);

      // Create event with file reference (keep small base64 for preview in frontend)
      const base64Preview = screenshot.toString('base64').substring(0, 1000); // Small preview
      const event: QAEvent = {
        id: screenshotId,
        type: EventType.SCREENSHOT,
        message: 'Screenshot captured',
        timestamp: new Date().toISOString(),
        details: JSON.stringify({
          filename: screenshotFilename,
          path: screenshotPath,
          size: screenshot.length,
          preview: base64Preview, // Small preview for UI
        }),
      };

      this.events.push(event);
      this.emit('event', event);

      // Auto-crawl on screenshot if enabled
      if (this.config.crawlOnScreenshot) {
        try {
          await this.captureCrawl();
        } catch (error) {
          console.error('[Recorder] Auto-crawl on screenshot failed:', error);
        }
      }

      return event;
    } catch (error) {
      const event: QAEvent = {
        id: generateEventId('ss'),
        type: EventType.SCREENSHOT,
        message: 'Screenshot failed',
        timestamp: new Date().toISOString(),
        details: String(error),
      };
      this.events.push(event);
      this.emit('event', event);
      return event;
    }
  }

  async captureCrawl(): Promise<QAEvent> {
    try {
      // #region agent log
      const _dbg_t0_cap = Date.now();
      // #endregion
      const crawlData = await this.htmlCrawler.crawlPageWithMetadata(this.page);
      // #region agent log
      const _dbg_elapsed_cap = Date.now() - _dbg_t0_cap;
      // #endregion

      const crawlId = generateEventId('cr');

      // Create event with markdown content directly in details
      const event: QAEvent = {
        id: crawlId,
        type: EventType.CRAWL,
        message: `Page crawled: ${crawlData.title} (${crawlData.wordCount} words)`,
        timestamp: new Date().toISOString(),
        details: JSON.stringify({
          url: crawlData.url,
          title: crawlData.title,
          wordCount: crawlData.wordCount,
          characterCount: crawlData.characterCount,
          markdown: crawlData.markdown,
        }, null, 2),
      };
      // #region agent log
      const _dbg_stored_len = (event.details as string).length;
      fetch('http://127.0.0.1:7805/ingest/7f52cca2-b399-477a-973a-eb3a1ff61c89',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'62d663'},body:JSON.stringify({sessionId:'62d663',location:'recorder.ts:captureCrawl',message:'crawl event stored',data:{totalCrawlMs:_dbg_elapsed_cap,markdownChars:crawlData.markdown.length,storedJsonChars:_dbg_stored_len,jsonOverheadPct:Math.round((_dbg_stored_len-crawlData.markdown.length)/crawlData.markdown.length*100),wordCount:crawlData.wordCount},timestamp:Date.now(),hypothesisId:'A-D'})}).catch(()=>{});
      // #endregion

      this.events.push(event);
      this.emit('event', event);
      return event;
    } catch (error) {
      const event: QAEvent = {
        id: generateEventId('cr'),
        type: EventType.CRAWL,
        message: 'Crawl failed',
        timestamp: new Date().toISOString(),
        details: String(error),
      };
      this.events.push(event);
      this.emit('event', event);
      return event;
    }
  }

  getEvents(): QAEvent[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events = [];
  }
}
