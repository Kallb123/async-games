import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { PerformanceMetricModel } from '@/utils/mongodb/PerformanceMetricData';
import { PERFORMANCE_CACHES, PERFORMANCE_DATA_SOURCES, PERFORMANCE_METRIC_NAMES, PERFORMANCE_REQUESTS, isPerformanceRegion, performanceValueLimit, safeRoute, type PerformanceMetricInput } from '@/utils/performance';
import { consumeRateLimit } from '@/utils/rateLimit';

const names = new Set<string>(PERFORMANCE_METRIC_NAMES);
const sources = new Set(['link', 'history', 'load', 'deep-link']);
const caches = new Set<string>(PERFORMANCE_CACHES);
const requests = new Set<string>(PERFORMANCE_REQUESTS);
const dataSources = new Set<string>(PERFORMANCE_DATA_SOURCES);
const connections = new Set(['slow-2g', '2g', '3g', '4g']);

/** Accepts only bounded, allow-listed timings; never identities, game ids, names, or bodies. */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new NextResponse(null, { status: 401 });
  if (!(await consumeRateLimit('performance', userId, 300, 10 * 60 * 1000))) return new NextResponse(null, { status: 429 });
  let entries: PerformanceMetricInput[];
  try { entries = await request.json(); } catch { return new NextResponse(null, { status: 400 }); }
  if (!Array.isArray(entries) || entries.length > 40) return new NextResponse(null, { status: 400 });
  const valid = entries.filter(entry => names.has(entry?.name)
    && Number.isFinite(entry?.value) && entry.value >= 0 && entry.value <= performanceValueLimit(entry.name)
    && typeof entry.route === 'string' && entry.route.length <= 120
    && (entry.source === undefined || sources.has(entry.source))
    && (entry.cache === undefined || caches.has(entry.cache))
    && (entry.request === undefined || requests.has(entry.request))
    && (entry.region === undefined || isPerformanceRegion(entry.region))
    && (entry.dataSource === undefined || dataSources.has(entry.dataSource))
    && (entry.connection === undefined || connections.has(entry.connection))
    && (entry.build === undefined || (typeof entry.build === 'string' && entry.build.length <= 40 && /^[0-9T:.Z+-]+$/.test(entry.build))));
  if (!valid.length) return new NextResponse(null, { status: 202 });
  await dbConnect();
  await PerformanceMetricModel.insertMany(valid.map(entry => ({
    name: entry.name, value: entry.value, route: safeRoute(entry.route),
    source: entry.source, cache: entry.cache, request: entry.request, region: entry.region, dataSource: entry.dataSource, connection: entry.connection, build: entry.build,
  })), { ordered: false });
  return new NextResponse(null, { status: 202 });
}
