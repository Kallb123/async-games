import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/api/adminRequest';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { PerformanceMetricModel } from '@/utils/mongodb/PerformanceMetricData';
import { JOURNEY_METRICS, type PerformanceCache } from '@/utils/performance';

export interface PerformanceSummary {
  name: string; route: string;
  /** Journey metrics only: a document load (`cold`) and an in-app navigation (`warm`) are different journeys. */
  cache?: PerformanceCache;
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
  const rows = await PerformanceMetricModel.find({
    createdAt: { $gte: since },
    $or: [{ name: { $nin: [...JOURNEY_METRICS] } }, { cache: { $exists: true } }],
  }).select({ name: 1, route: 1, value: 1, cache: 1, _id: 0 }).sort({ createdAt: -1 }).limit(20_000).lean();
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const journey = JOURNEY_METRICS.has(row.name);
    const key = `${row.name}\n${row.route}\n${journey ? row.cache : ''}`;
    const values = groups.get(key) ?? [];
    values.push(row.value); groups.set(key, values);
  }
  const summaries = [...groups].map(([key, values]) => {
    values.sort((a, b) => a - b); const [name, route, cache] = key.split('\n');
    return { name, route, ...(cache && { cache: cache as PerformanceCache }), samples: values.length, median: percentile(values, .5), p75: percentile(values, .75), p95: percentile(values, .95) };
  }).sort((a, b) => b.samples - a.samples || a.name.localeCompare(b.name));
  return NextResponse.json({ since: since.toISOString(), totalSamples: rows.length, summaries } satisfies AdminPerformanceResponse);
}
