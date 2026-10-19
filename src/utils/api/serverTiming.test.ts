import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module keeps when this instance last began a request, so each test loads it fresh.
async function load() {
  vi.resetModules();
  return import('./serverTiming');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ServerTiming', () => {
  it('says the first request on an instance is its first, and how long the instance sat idle before each later one', async () => {
    const { ServerTiming } = await load();
    vi.advanceTimersByTime(40);
    expect(new ServerTiming().header()).toMatch(/^instance_new;dur=40\.0, total;dur=/);

    vi.advanceTimersByTime(15 * 60_000);
    const later = new ServerTiming().header();
    expect(later).toContain('idle;dur=900000.0');
    expect(later).not.toContain('instance_new');
  });

  it('sums the time reported from below the request into one span per name', async () => {
    const { ServerTiming, recordSpanTime } = await load();
    const timing = new ServerTiming();
    await timing.time('mongo_query', async () => {
      recordSpanTime('mongo_checkout', 120);
      recordSpanTime('mongo_checkout', 30.5);
      recordSpanTime('mongo_handshake', 90);
    });
    const header = timing.header();
    expect(header).toContain('mongo_checkout;dur=150.5');
    expect(header).toContain('mongo_handshake;dur=90.0');
  });

  it('reports nothing reported outside a request to any request', async () => {
    const { ServerTiming, recordSpanTime } = await load();
    const timing = new ServerTiming();
    recordSpanTime('mongo_checkout', 120);
    expect(timing.header()).not.toContain('mongo_checkout');
  });
});
