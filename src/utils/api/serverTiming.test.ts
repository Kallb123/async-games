import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The instance's clock lives on `globalThis` (see the module), so each test starts a fresh instance.
async function load() {
  globalThis.agServerTiming = undefined;
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
  it('says the first request on an instance is its first, and how many whole minutes the instance sat idle before each later one', async () => {
    const { ServerTiming } = await load();
    vi.advanceTimersByTime(40);
    const first = new ServerTiming();
    first.noteInstance();
    expect(first.header()).toMatch(/^instance_new;dur=40\.0, total;dur=/);

    vi.advanceTimersByTime(15 * 60_000 + 59_000);
    const later = new ServerTiming();
    later.noteInstance();
    expect(later.header()).toContain('idle;dur=900000.0');
    expect(later.header()).not.toContain('instance_new');
  });

  it('says nothing about the instance, and leaves its clock alone, until the caller is signed in', async () => {
    const { ServerTiming } = await load();
    expect(new ServerTiming().header()).not.toMatch(/idle|instance_new/);
    const first = new ServerTiming();
    first.noteInstance();
    expect(first.header()).toContain('instance_new');
  });

  it('says a warm-up ping is new only if it is the first request of any kind, and leaves the first-request flag to the signed-in request after it', async () => {
    const { ServerTiming } = await load();
    vi.advanceTimersByTime(25);
    const ping = new ServerTiming();
    ping.noteWarmUp();
    expect(ping.header()).toMatch(/^instance_new;dur=25\.0, total;dur=/);

    vi.advanceTimersByTime(1500);
    const secondPing = new ServerTiming();
    secondPing.noteWarmUp();
    expect(secondPing.header()).not.toMatch(/idle|instance_new/);

    // The real request still finds the instance new, and says how old it is.
    const entry = new ServerTiming();
    entry.noteInstance();
    expect(entry.header()).toMatch(/^instance_new;dur=1525\.0, total;dur=/);
  });

  it('does not call a ping new on an instance a signed-in request has already used, and never reports idle time', async () => {
    const { ServerTiming } = await load();
    new ServerTiming().noteInstance();
    vi.advanceTimersByTime(20 * 60_000);
    const ping = new ServerTiming();
    ping.noteWarmUp();
    expect(ping.header()).not.toMatch(/idle|instance_new/);
    // And it did not reset the clock the next signed-in request reads.
    const next = new ServerTiming();
    next.noteInstance();
    expect(next.header()).toContain('idle;dur=1200000.0');
  });

  it('clamps a long-lived instance to the beacon’s cap rather than sending a value it would drop', async () => {
    const { ServerTiming } = await load();
    vi.advanceTimersByTime(10 * 60_000);
    const timing = new ServerTiming();
    timing.noteInstance();
    expect(timing.header()).toContain('instance_new;dur=120000.0');
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

  it('shares one instance between every copy of the module, as Next loads it more than once', async () => {
    const boot = await load();
    vi.resetModules();
    const route = await import('./serverTiming');
    const timing = new route.ServerTiming();
    await timing.time('mongo_query', async () => boot.recordSpanTime('mongo_checkout', 75));
    expect(timing.header()).toContain('mongo_checkout;dur=75.0');
  });

  it('reports nothing reported outside a request to any request', async () => {
    const { ServerTiming, recordSpanTime } = await load();
    const timing = new ServerTiming();
    recordSpanTime('mongo_checkout', 120);
    expect(timing.header()).not.toContain('mongo_checkout');
  });
});
