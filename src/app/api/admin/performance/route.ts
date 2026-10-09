import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/api/adminRequest';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { PerformanceMetricModel } from '@/utils/mongodb/PerformanceMetricData';
import { JOURNEY_METRICS, type PerformanceCache, type PerformanceRequest } from '@/utils/performance';

export interface PerformanceSummary {
  name: string; route: string;
  /** Journey metrics only: a document load (`cold`) and an in-app navigation (`warm`) are different journeys. */
  cache?: PerformanceCache;
  /** A screen's own API fetch: the `entry` fetch and later `refresh`es are different loads. */
  request?: PerformanceRequest;
  samples: number; median: number; p75: number; p95: number;
}
export interface AdminPerformanceResponse { since: string; totalSamples: number; summaries: PerformanceSummary[]; }
const percentile = (values: number[], fraction: number) => values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] ?? 0;

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
    .select({ name: 1, route: 1, value: 1, cache: 1, request: 1, _id: 0 }).sort({ createdAt: -1 }).limit(20_000).lean();
  const rows = (await Promise.all([
    read({ request: { $exists: false }, $or: [{ name: { $nin: [...JOURNEY_METRICS] } }, { cache: { $exists: true } }] }),
    read({ request: { $exists: true } }),
  ])).flat();
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const journey = JOURNEY_METRICS.has(row.name);
    const key = JSON.stringify([row.name, row.route, journey ? row.cache ?? '' : '', row.request ?? '']);
    const values = groups.get(key) ?? [];
    values.push(row.value); groups.set(key, values);
  }
  const summaries = [...groups].map(([key, values]) => {
    values.sort((a, b) => a - b); const [name, route, cache, request] = JSON.parse(key) as string[];
    return { name, route, ...(cache && { cache: cache as PerformanceCache }), ...(request && { request: request as PerformanceRequest }), samples: values.length, median: percentile(values, .5), p75: percentile(values, .75), p95: percentile(values, .95) };
  }).sort((a, b) => b.samples - a.samples || a.name.localeCompare(b.name));
  return NextResponse.json({ since: since.toISOString(), totalSamples: rows.length, summaries } satisfies AdminPerformanceResponse);
}
