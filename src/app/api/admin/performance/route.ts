import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/api/adminRequest';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { PerformanceMetricModel } from '@/utils/mongodb/PerformanceMetricData';
import { JOURNEY_METRICS, summarisePerformance, type PerformanceCache, type PerformanceRequest, type PerformanceStats } from '@/utils/performance';

export interface PerformanceSummary extends PerformanceStats {
  name: string; route: string;
  /** Journey metrics only: a document load (`cold`) and an in-app navigation (`warm`) are different journeys. */
  cache?: PerformanceCache;
  /** A screen's own API fetch: the `entry` fetch and later `refresh`es are different loads. */
  request?: PerformanceRequest;
  /** A vital's attribution: the part of the page it names (see `PERFORMANCE_REGIONS`). */
  region?: string;
}
export interface AdminPerformanceResponse { since: string; totalSamples: number; summaries: PerformanceSummary[]; }

export async function GET(_request: NextRequest) {
  const caller = await requireAdmin();
  if ('error' in caller) return caller.error;
  await dbConnect();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  // A journey sample without `cache` predates journey timing: it counted from
  // when the tab opened, not from the tap, so it isn't a load time at all.
  // Newest first, so the cap drops the oldest samples rather than this week's.
  //
  // A screen's API fetches (tagged `request`) are read under a cap of their
  // own: a watched board polls every few seconds, and its samples would
  // otherwise crowd the page loads and journeys out of the window.
  const read = (filter: object) => PerformanceMetricModel.find({ createdAt: { $gte: since }, ...filter })
    .select({ name: 1, route: 1, value: 1, cache: 1, request: 1, region: 1, _id: 0 }).sort({ createdAt: -1 }).limit(20_000).lean();
  const rows = (await Promise.all([
    read({ request: { $exists: false }, $or: [{ name: { $nin: [...JOURNEY_METRICS] } }, { cache: { $exists: true } }] }),
    read({ request: { $exists: true } }),
  ])).flat();
  const loadOf = (row: { name: string; cache?: string }) => JOURNEY_METRICS.has(row.name) ? row.cache : undefined;
  const summaries = summarisePerformance(rows, row => [row.name, row.route, loadOf(row), row.request, row.region])
    .map(({ sample, stats }): PerformanceSummary => {
      const cache = loadOf(sample);
      return { name: sample.name, route: sample.route, ...(cache && { cache: cache as PerformanceCache }),
        ...(sample.request && { request: sample.request as PerformanceRequest }), ...(sample.region && { region: sample.region }), ...stats };
    })
    .sort((a, b) => b.samples - a.samples || a.name.localeCompare(b.name));
  return NextResponse.json({ since: since.toISOString(), totalSamples: rows.length, summaries } satisfies AdminPerformanceResponse);
}
