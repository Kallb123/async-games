import { describe, expect, it } from 'vitest';
import { CANONICAL_BUILD, DEFAULT_PERFORMANCE_WINDOW_MS, PERFORMANCE_RETENTION_MS, parsePerformanceWindow, performanceWindowQuery } from './performanceWindow';

const now = new Date('2026-10-10T12:00:00.000Z');
const parse = (query: string) => parsePerformanceWindow(new URLSearchParams(query), now);

describe('parsePerformanceWindow', () => {
    it('defaults to the last seven days and no build', () => {
        expect(parse('')).toEqual({ ok: true, since: new Date(now.getTime() - DEFAULT_PERFORMANCE_WINDOW_MS), build: null });
    });

    it('reads since as an instant, with a zone or as a date', () => {
        expect(parse('since=2026-10-09T08:30:00.000Z')).toMatchObject({ ok: true, since: new Date('2026-10-09T08:30:00.000Z') });
        expect(parse('since=2026-10-09T08:30:00%2B02:00')).toMatchObject({ ok: true, since: new Date('2026-10-09T06:30:00.000Z') });
        expect(parse('since=2026-10-09T08:30Z')).toMatchObject({ ok: true, since: new Date('2026-10-09T08:30:00.000Z') });
        expect(parse('since=2026-10-09')).toMatchObject({ ok: true, since: new Date('2026-10-09T00:00:00.000Z') });
    });

    it('clamps a since older than the retention to the retention', () => {
        expect(parse('since=2020-01-01T00:00:00.000Z')).toMatchObject({ ok: true, since: new Date(now.getTime() - PERFORMANCE_RETENTION_MS) });
    });

    it('keeps a since in the future, which simply matches nothing', () => {
        expect(parse('since=2027-01-01T00:00:00.000Z')).toMatchObject({ ok: true, since: new Date('2027-01-01T00:00:00.000Z') });
    });

    it.each(['', 'yesterday', '1696000000000', '2026-13-45', '2026-10-10T25:00:00Z', '2026-10-10T08:30', '2026-10-10T08:30:00', '{"$gt":""}', '2026-10-10T08:30:00Z; drop'])(
        'refuses a since of %j', since => {
            expect(parse(`since=${encodeURIComponent(since)}`)).toMatchObject({ ok: false });
        });

    it('accepts a build in the exact form the build stamp writes', () => {
        const build = new Date('2026-10-10T08:30:12.345Z').toISOString();
        expect(CANONICAL_BUILD.test(build)).toBe(true);
        expect(parse(`build=${build}`)).toMatchObject({ ok: true, build });
    });

    it.each(['', '2026-10-10', '2026-10-10T08:30:00Z', '2026-10-10T08:30:00.000+00:00', '2026-13-10T08:30:00.000Z', '9999', 'z'.repeat(100), '[object Object]'])(
        'refuses a build of %j, because only a fixed-width timestamp compares as a string', build => {
            expect(parse(`build=${encodeURIComponent(build)}`)).toMatchObject({ ok: false });
        });

    it('refuses a bad build even beside a good since', () => {
        expect(parse('since=2026-10-09&build=nope')).toMatchObject({ ok: false });
    });

    it('takes the first of a repeated parameter, as one string and never an operator object', () => {
        expect(parse('build=2026-10-10T08:30:00.000Z&build=other')).toMatchObject({ ok: true, build: '2026-10-10T08:30:00.000Z' });
        expect(parse('build[$gt]=')).toMatchObject({ ok: true, build: null });
    });
});

describe('performanceWindowQuery', () => {
    it('writes what parsePerformanceWindow reads back', () => {
        const since = new Date('2026-10-09T08:30:00.000Z');
        const build = '2026-10-10T08:30:00.000Z';
        expect(parse(performanceWindowQuery(since, build))).toEqual({ ok: true, since, build });
    });

    it('leaves out what is not set', () => {
        expect(performanceWindowQuery(null, null)).toBe('');
        expect(performanceWindowQuery(null, '2026-10-10T08:30:00.000Z')).toBe('build=2026-10-10T08%3A30%3A00.000Z');
    });
});
