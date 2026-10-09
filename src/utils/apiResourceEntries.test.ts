import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiEntryMatcher } from './apiResourceEntries';

const entry = (name: string, startTime: number) => ({ name, startTime });

afterEach(() => {
  vi.useRealTimers();
});

describe('apiEntryMatcher', () => {
  it('pairs a fetch with a record that arrived before it asked', async () => {
    const matcher = apiEntryMatcher();
    const record = entry('/api/game/1', 120);
    matcher.arrived(record);
    expect(await matcher.find('/api/game/1', 100)).toBe(record);
  });

  it('pairs a fetch with a record that arrives after it asked', async () => {
    const matcher = apiEntryMatcher();
    const found = matcher.find('/api/game/1', 100);
    const record = entry('/api/game/1', 120);
    matcher.arrived(record);
    expect(await found).toBe(record);
  });

  it('skips a record begun before the fetch — the refused attempt of a session retry, or an earlier poll', async () => {
    const matcher = apiEntryMatcher();
    const retried = entry('/api/game/1', 1200);
    matcher.arrived(entry('/api/game/1', 120));
    matcher.arrived(entry('/api/game/2', 1300));
    matcher.arrived(retried);
    expect(await matcher.find('/api/game/1', 1100)).toBe(retried);
  });

  it('hands each record to one fetch only', async () => {
    vi.useFakeTimers();
    const matcher = apiEntryMatcher({ waitMs: 50 });
    matcher.arrived(entry('/api/dashboard', 120));
    expect(await matcher.find('/api/dashboard', 100)).toBeDefined();
    const second = matcher.find('/api/dashboard', 100);
    await vi.advanceTimersByTimeAsync(50);
    expect(await second).toBeUndefined();
  });

  it('gives up on a record that never arrives', async () => {
    vi.useFakeTimers();
    const matcher = apiEntryMatcher({ waitMs: 3000 });
    const found = matcher.find('/api/game/1', 100);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await found).toBeUndefined();
    // And a late record is kept for whoever asks next, not handed to the fetch that gave up.
    matcher.arrived(entry('/api/game/1', 120));
    expect(await matcher.find('/api/game/1', 100)).toEqual(entry('/api/game/1', 120));
  });

  it('keeps only the newest records nobody has asked for', async () => {
    vi.useFakeTimers();
    const matcher = apiEntryMatcher({ keep: 2, waitMs: 10 });
    for (const start of [1, 2, 3]) matcher.arrived(entry('/api/x', start));
    const oldest = matcher.find('/api/x', 1);
    expect(await oldest).toEqual(entry('/api/x', 3));
    expect(await matcher.find('/api/x', 1)).toEqual(entry('/api/x', 2));
    const none = matcher.find('/api/x', 1);
    await vi.advanceTimersByTimeAsync(10);
    expect(await none).toBeUndefined();
  });
});
