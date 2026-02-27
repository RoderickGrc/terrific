import { describe, expect, it } from 'vitest';
import { applyFilterPolicyToEvents, NetworkFilterPolicy } from './filtersPolicy.js';
import { EventType, QAEvent } from '../types/index.js';

const basePolicy: NetworkFilterPolicy = {
  preserveStatusGte: 400,
  preserveMethods: new Set(['POST', 'PUT', 'PATCH', 'DELETE']),
  ignoreStatusLt: 400,
  ignoreUrlPatterns: [
    /fonts\.gstatic\.com/i,
    /google-analytics\.com/i,
  ],
  collapseEnabled: false,
  collapseWindowMs: 3000,
  collapseMinDuplicates: 5,
  collapseNetworkRuleEnabled: false,
};

function evt(partial: Partial<QAEvent>): QAEvent {
  return {
    id: partial.id || 'e1',
    type: partial.type || EventType.NETWORK,
    message: partial.message || 'GET http://localhost/test',
    timestamp: partial.timestamp || '2026-01-01T00:00:00.000Z',
    details: partial.details,
  };
}

describe('filtersPolicy network precedence', () => {
  it('ignores matching static request even without status', () => {
    const events = [
      evt({
        id: 'font-1',
        message: 'GET https://fonts.gstatic.com/s/inter/v20/font.woff2',
        details: JSON.stringify({ method: 'GET', url: 'https://fonts.gstatic.com/s/inter/v20/font.woff2' }),
      }),
    ];

    const result = applyFilterPolicyToEvents(events, basePolicy);
    expect(result.events).toHaveLength(0);
    expect(result.ignoredCount).toBe(1);
  });

  it('ignores analytics even if method is POST when status is successful', () => {
    const events = [
      evt({
        id: 'ga-1',
        message: 'POST https://www.google-analytics.com/g/collect',
        details: JSON.stringify({ method: 'POST', status: 204, url: 'https://www.google-analytics.com/g/collect' }),
      }),
    ];

    const result = applyFilterPolicyToEvents(events, basePolicy);
    expect(result.events).toHaveLength(0);
    expect(result.ignoredCount).toBe(1);
  });

  it('preserves errors even when URL matches ignore pattern', () => {
    const events = [
      evt({
        id: 'ga-err',
        message: '500 https://www.google-analytics.com/g/collect',
        details: JSON.stringify({ status: 500, url: 'https://www.google-analytics.com/g/collect' }),
      }),
    ];

    const result = applyFilterPolicyToEvents(events, basePolicy);
    expect(result.events).toHaveLength(1);
    expect(result.ignoredCount).toBe(0);
  });
});
