import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { config } from '../config.js';
import { EventType, QAEvent } from '../types/index.js';

type FilterSource = 'local' | 'global' | 'none';

export interface NetworkFilterPolicy {
  preserveStatusGte: number;
  preserveMethods: Set<string>;
  ignoreStatusLt: number;
  ignoreUrlPatterns: RegExp[];
  collapseEnabled: boolean;
  collapseWindowMs: number;
  collapseMinDuplicates: number;
  collapseNetworkRuleEnabled: boolean;
}

export interface ResolvedFilterPolicy {
  source: FilterSource;
  sourceLabel: 'Local' | 'Global' | 'None';
  filePath?: string;
  policy: NetworkFilterPolicy;
}

export interface ApplyPolicyResult {
  events: QAEvent[];
  ignoredCount: number;
  collapsedCount: number;
}

const DEFAULT_POLICY: NetworkFilterPolicy = {
  preserveStatusGte: 400,
  preserveMethods: new Set(['POST', 'PUT', 'PATCH', 'DELETE']),
  ignoreStatusLt: 400,
  ignoreUrlPatterns: [],
  collapseEnabled: false,
  collapseWindowMs: 3000,
  collapseMinDuplicates: 5,
  collapseNetworkRuleEnabled: false,
};

const REQUEST_LINE_REGEX = /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)/i;
const RESPONSE_LINE_REGEX = /^(\d{3})\s+(\S+)/;
const VOLATILE_MATCH_QUERY_PARAMS = new Set(['t', 'v']);

interface ParsedNetworkMeta {
  method?: string;
  status?: number;
  url?: string;
}

function cloneDefaultPolicy(): NetworkFilterPolicy {
  return {
    ...DEFAULT_POLICY,
    preserveMethods: new Set(DEFAULT_POLICY.preserveMethods),
    ignoreUrlPatterns: [],
  };
}

function toSourceLabel(source: FilterSource): ResolvedFilterPolicy['sourceLabel'] {
  if (source === 'local') return 'Local';
  if (source === 'global') return 'Global';
  return 'None';
}

function sanitizePattern(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseMethodsInline(value: string): Set<string> {
  const methods = new Set<string>();
  const match = value.match(/\[(.*)\]/);
  if (!match) return methods;

  const values = match[1].split(',').map((item) => sanitizePattern(item).toUpperCase()).filter(Boolean);
  for (const method of values) {
    methods.add(method);
  }
  return methods;
}

function parseYamlNetworkPolicy(filePath: string): NetworkFilterPolicy {
  const policy = cloneDefaultPolicy();
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);

  let section: '' | 'preserve' | 'ignore' | 'collapse' = '';
  let inPreserveNetwork = false;
  let inIgnoreNetwork = false;
  let inIgnoreNetworkUrlPatterns = false;
  let inCollapseRules = false;

  for (const originalLine of lines) {
    if (!originalLine.trim() || originalLine.trim().startsWith('#')) {
      continue;
    }

    const indent = originalLine.match(/^\s*/)?.[0].length || 0;
    const line = originalLine.trim();

    if (indent === 0 && line.endsWith(':')) {
      const key = line.slice(0, -1);
      section = key === 'preserve' || key === 'ignore' || key === 'collapse' ? key : '';
      inPreserveNetwork = false;
      inIgnoreNetwork = false;
      inIgnoreNetworkUrlPatterns = false;
      inCollapseRules = false;
      continue;
    }

    if (section === 'preserve') {
      if (indent === 2 && line === 'network:') {
        inPreserveNetwork = true;
        continue;
      }
      if (indent === 2 && line.endsWith(':') && line !== 'network:') {
        inPreserveNetwork = false;
      }

      if (inPreserveNetwork) {
        const statusMatch = line.match(/^statusGte:\s*(\d+)/);
        if (statusMatch) {
          policy.preserveStatusGte = Number(statusMatch[1]);
          continue;
        }

        if (line.startsWith('methods:')) {
          const parsedMethods = parseMethodsInline(line);
          if (parsedMethods.size > 0) {
            policy.preserveMethods = parsedMethods;
          }
          continue;
        }
      }
    }

    if (section === 'ignore') {
      if (indent === 2 && line === 'network:') {
        inIgnoreNetwork = true;
        inIgnoreNetworkUrlPatterns = false;
        continue;
      }
      if (indent === 2 && line.endsWith(':') && line !== 'network:') {
        inIgnoreNetwork = false;
        inIgnoreNetworkUrlPatterns = false;
      }

      if (inIgnoreNetwork) {
        const statusMatch = line.match(/^-\s*statusLt:\s*(\d+)/);
        if (statusMatch) {
          policy.ignoreStatusLt = Number(statusMatch[1]);
          continue;
        }

        if (line === 'urlMatchesAny:') {
          inIgnoreNetworkUrlPatterns = true;
          continue;
        }

        if (inIgnoreNetworkUrlPatterns) {
          if (indent >= 8 && line.startsWith('- ')) {
            const patternText = sanitizePattern(line.slice(2));
            try {
              policy.ignoreUrlPatterns.push(new RegExp(patternText, 'i'));
            } catch {
              // Ignore invalid regex entries
            }
            continue;
          }

          if (indent <= 6) {
            inIgnoreNetworkUrlPatterns = false;
          }
        }
      }
    }

    if (section === 'collapse') {
      const enabledMatch = line.match(/^enabled:\s*(true|false)$/i);
      if (enabledMatch) {
        policy.collapseEnabled = enabledMatch[1].toLowerCase() === 'true';
        continue;
      }

      const windowMatch = line.match(/^windowMs:\s*(\d+)/);
      if (windowMatch) {
        policy.collapseWindowMs = Number(windowMatch[1]);
        continue;
      }

      const minMatch = line.match(/^minDuplicates:\s*(\d+)/);
      if (minMatch) {
        policy.collapseMinDuplicates = Number(minMatch[1]);
        continue;
      }

      if (indent === 2 && line === 'rules:') {
        inCollapseRules = true;
        continue;
      }

      if (inCollapseRules && indent >= 4) {
        if (line === '- eventType: NETWORK' || line === 'eventType: NETWORK') {
          policy.collapseNetworkRuleEnabled = true;
        }
      }
    }
  }

  return policy;
}

export function resolveFilterPolicy(sessionsDir?: string): ResolvedFilterPolicy {
  const localFilterFile = sessionsDir ? join(dirname(sessionsDir), 'filters.yaml') : undefined;
  const globalFilterFile = config.globalFiltersFile;

  let source: FilterSource = 'none';
  let selectedPath: string | undefined;

  if (localFilterFile && existsSync(localFilterFile)) {
    source = 'local';
    selectedPath = localFilterFile;
  } else if (existsSync(globalFilterFile)) {
    source = 'global';
    selectedPath = globalFilterFile;
  }

  if (!selectedPath) {
    return {
      source,
      sourceLabel: toSourceLabel(source),
      policy: cloneDefaultPolicy(),
    };
  }

  try {
    const policy = parseYamlNetworkPolicy(selectedPath);
    return {
      source,
      sourceLabel: toSourceLabel(source),
      filePath: selectedPath,
      policy,
    };
  } catch {
    return {
      source: 'none',
      sourceLabel: 'None',
      policy: cloneDefaultPolicy(),
    };
  }
}

function parseNetworkEventMetadata(event: QAEvent): ParsedNetworkMeta {
  if (event.type !== EventType.NETWORK) return {};

  const requestMatch = event.message.match(REQUEST_LINE_REGEX);
  const responseMatch = event.message.match(RESPONSE_LINE_REGEX);

  let detailsObj: any;
  if (event.details) {
    try {
      detailsObj = JSON.parse(event.details);
    } catch {
      detailsObj = undefined;
    }
  }

  const methodFromMessage = requestMatch?.[1]?.toUpperCase();
  const methodFromDetails = typeof detailsObj?.method === 'string' ? detailsObj.method.toUpperCase() : undefined;
  const method = methodFromMessage || methodFromDetails;

  const statusFromMessage = responseMatch?.[1] ? Number(responseMatch[1]) : undefined;
  const statusFromDetails = typeof detailsObj?.status === 'number' ? detailsObj.status : undefined;
  const status = statusFromMessage ?? statusFromDetails;

  const urlFromMessage = requestMatch?.[2] || responseMatch?.[2];
  const urlFromDetails = typeof detailsObj?.url === 'string' ? detailsObj.url : undefined;
  const url = urlFromMessage || urlFromDetails;

  return { method, status, url };
}

function normalizeUrlForSignature(url?: string): string {
  if (!url) return '';

  try {
    const parsed = new URL(url, 'http://localhost');
    const params: Array<[string, string]> = [];
    for (const [key, value] of parsed.searchParams.entries()) {
      if (VOLATILE_MATCH_QUERY_PARAMS.has(key.toLowerCase())) continue;
      params.push([key, value]);
    }
    params.sort(([a], [b]) => a.localeCompare(b));
    const query = params.length > 0
      ? `?${params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`
      : '';
    return `${parsed.pathname}${query}`;
  } catch {
    return url;
  }
}

function shouldPreserveNetwork(meta: ParsedNetworkMeta, policy: NetworkFilterPolicy): boolean {
  if (typeof meta.status === 'number' && meta.status >= policy.preserveStatusGte) {
    return true;
  }
  return false;
}

function shouldIgnoreNetwork(meta: ParsedNetworkMeta, policy: NetworkFilterPolicy): boolean {
  if (!meta.url) {
    return false;
  }

  if (typeof meta.status === 'number' && meta.status >= policy.ignoreStatusLt) {
    return false;
  }

  return policy.ignoreUrlPatterns.some((pattern) => pattern.test(meta.url || ''));
}

function collapseNetworkEvents(events: QAEvent[], policy: NetworkFilterPolicy): { events: QAEvent[]; collapsedCount: number } {
  if (!policy.collapseEnabled || !policy.collapseNetworkRuleEnabled) {
    return { events, collapsedCount: 0 };
  }

  const result: QAEvent[] = [];
  let collapsedCount = 0;

  let activeSignature: string | null = null;
  let activeGroup: Array<{ event: QAEvent; timestampMs: number; meta: ParsedNetworkMeta }> = [];

  const flushGroup = () => {
    if (activeGroup.length === 0) return;

    if (activeGroup.length >= policy.collapseMinDuplicates) {
      const first = activeGroup[0].event;
      const meta = activeGroup[0].meta;
      const collapsedEvent: QAEvent = {
        ...first,
        message: `${first.message} (collapsed x${activeGroup.length})`,
        details: JSON.stringify({
          summaryType: 'network_collapse',
          collapsedCount: activeGroup.length,
          method: meta.method,
          status: meta.status,
          url: meta.url,
        }),
      };
      result.push(collapsedEvent);
      collapsedCount += activeGroup.length - 1;
    } else {
      for (const item of activeGroup) {
        result.push(item.event);
      }
    }

    activeSignature = null;
    activeGroup = [];
  };

  for (const event of events) {
    if (event.type !== EventType.NETWORK) {
      flushGroup();
      result.push(event);
      continue;
    }

    const meta = parseNetworkEventMetadata(event);
    if (typeof meta.status === 'number' && meta.status >= policy.preserveStatusGte) {
      flushGroup();
      result.push(event);
      continue;
    }

    const timestampMs = new Date(event.timestamp).getTime();
    const signature = [
      meta.method || 'UNK',
      normalizeUrlForSignature(meta.url),
      String(meta.status ?? 'NA'),
    ].join('|');

    if (activeGroup.length === 0) {
      activeSignature = signature;
      activeGroup.push({ event, timestampMs, meta });
      continue;
    }

    const previous = activeGroup[activeGroup.length - 1];
    const withinWindow = timestampMs - previous.timestampMs <= policy.collapseWindowMs;
    if (signature === activeSignature && withinWindow) {
      activeGroup.push({ event, timestampMs, meta });
      continue;
    }

    flushGroup();
    activeSignature = signature;
    activeGroup.push({ event, timestampMs, meta });
  }

  flushGroup();

  return { events: result, collapsedCount };
}

export function applyFilterPolicyToEvents(events: QAEvent[], policy: NetworkFilterPolicy): ApplyPolicyResult {
  let ignoredCount = 0;
  const filtered: QAEvent[] = [];

  for (const event of events) {
    if (event.type !== EventType.NETWORK) {
      filtered.push(event);
      continue;
    }

    const meta = parseNetworkEventMetadata(event);
    if (shouldPreserveNetwork(meta, policy)) {
      filtered.push(event);
      continue;
    }

    if (shouldIgnoreNetwork(meta, policy)) {
      ignoredCount += 1;
      continue;
    }

    if (meta.method && policy.preserveMethods.has(meta.method)) {
      filtered.push(event);
      continue;
    }

    filtered.push(event);
  }

  const collapsed = collapseNetworkEvents(filtered, policy);
  return {
    events: collapsed.events,
    ignoredCount,
    collapsedCount: collapsed.collapsedCount,
  };
}
