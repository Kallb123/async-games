import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/api/adminRequest';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { PerformanceMetricModel } from '@/utils/mongodb/PerformanceMetricData';

export interface PerformanceSummary { name: string; route: string; samples: number; median: number; p75: number; p95: number; }
export interface AdminPerformanceResponse { since: string; totalSamples: number; summaries: PerformanceSummary[]; }
const percentile = (values: number[], fraction: number) => values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] ?? 0;

export async function GET(_request: NextRequest) {
  const caller = await requireAdmin();
  if ('error' in caller) return caller.error;
  await dbConnect();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await PerformanceMetricModel.find({ createdAt: { $gte: since } })
    .select({ name: 1, route: 1, value: 1, _id: 0 }).limit(20_000).lean();
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = `${row.name}\n${row.route}`;
    const values = groups.get(key) ?? [];
    values.push(row.value); groups.set(key, values);
  }
  const summaries = [...groups].map(([key, values]) => {
    values.sort((a, b) => a - b); const [name, route] = key.split('\n');
    return { name, route, samples: values.length, median: percentile(values, .5), p75: percentile(values, .75), p95: percentile(values, .95) };
  }).sort((a, b) => b.samples - a.samples || a.name.localeCompare(b.name));
  return NextResponse.json({ since: since.toISOString(), totalSamples: rows.length, summaries } satisfies AdminPerformanceResponse);
}
