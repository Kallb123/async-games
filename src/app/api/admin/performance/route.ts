import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/api/adminRequest';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { PerformanceMetricModel } from '@/utils/mongodb/PerformanceMetricData';
import { consumeRateLimit } from '@/utils/rateLimit';
import { CANONICAL_BUILD, PERFORMANCE_RETENTION_MS, parsePerformanceWindow } from '@/utils/performanceWindow';
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
/** One deploy seen in the retention window, for the report's "from build" choice. */
export interface PerformanceBuild { build: string; firstSeen: string; samples: number; }
export interface AdminPerformanceResponse {
  /** The effective start of the window: the `since` asked for, clamped to the 30-day retention. */
  since: string;
  /** The effective `build` filter: only samples from this build time or later. Null when none was asked for. */
  build: string | null;
  totalSamples: number;
  summaries: PerformanceSummary[];
  /** The newest builds in the retention window, newest first, whatever `since` and `build` are. */
  builds: PerformanceBuild[];
}

// Each call runs two 20,000-row reads and the builds aggregate, and the screen
// asks again whenever a window control changes: roomy for a person, a ceiling
// for a stuck loop or a script holding an admin session.
const ADMIN_PERFORMANCE_LIMIT = 60;
const ADMIN_PERFORMANCE_WINDOW_MS = 60 * 1000;

const BUILD_LIST_LENGTH = 10;
/** How many of the newest samples the builds list looks through. */
const BUILD_LIST_SCAN = 100_000;

/**
 * The newest builds that sent samples, with when each was first seen and how
 * many samples it sent. It reads the newest `BUILD_LIST_SCAN` samples of the
 * retention window: `createdAt` is indexed, so the match-sort-limit walks the
 * index and stops at the cap, rather than scanning a month of documents; a
 * build's count is therefore its share of those samples, and the first-seen
 * time of the oldest build listed can be later than the true first sample. That
 * is enough to pick "since this deploy". No new index: the group runs on at
 * most the capped set. It is a convenience, so a failure (or a slow aggregate,
 * cut off by `maxTimeMS`) leaves the list empty rather than failing the report.
 */
async function recentBuilds(): Promise<PerformanceBuild[]> {
  try {
    const rows = await PerformanceMetricModel.aggregate<{ _id: string; firstSeen: Date; samples: number }>([
      { $match: { createdAt: { $gte: new Date(Date.now() - PERFORMANCE_RETENTION_MS) }, build: { $regex: CANONICAL_BUILD } } },
      { $sort: { createdAt: -1 } },
      { $limit: BUILD_LIST_SCAN },
      { $group: { _id: '$build', firstSeen: { $min: '$createdAt' }, samples: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: BUILD_LIST_LENGTH },
    ]).option({ maxTimeMS: 5_000 });
    return rows.map(row => ({ build: row._id, firstSeen: row.firstSeen.toISOString(), samples: row.samples }));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const caller = await requireAdmin();
  if ('error' in caller) return caller.error;
  if (!(await consumeRateLimit('admin-performance', caller.admin.id, ADMIN_PERFORMANCE_LIMIT, ADMIN_PERFORMANCE_WINDOW_MS))) {
    return NextResponse.json({}, { status: 429, statusText: 'Too many requests, try again shortly' });
  }
  const requested = parsePerformanceWindow(request.nextUrl.searchParams);
  if (!requested.ok) return NextResponse.json({ error: requested.error }, { status: 400 });
  const { since, build } = requested;
  await dbConnect();
  // A journey sample without `cache` predates journey timing: it counted from
  // when the tab opened, not from the tap, so it isn't a load time at all.
  // Newest first, so the cap drops the oldest samples rather than this week's.
  //
  // A screen's API fetches (tagged `request`) are read under a cap of their
  // own: a watched board polls every few seconds, and its samples would
  // otherwise crowd the page loads and journeys out of the window.
  //
  // `build` compares as a string: a build time is a fixed-width UTC ISO
  // timestamp (see `CANONICAL_BUILD`), so string order is time order. A sample
  // with no `build` doesn't match `$gte`, so it drops out when this is set.
  const read = (filter: object) => PerformanceMetricModel.find({ createdAt: { $gte: since }, ...(build && { build: { $gte: build } }), ...filter })
    .select({ name: 1, route: 1, value: 1, cache: 1, request: 1, region: 1, _id: 0 }).sort({ createdAt: -1 }).limit(20_000).lean();
  const [reads, builds] = await Promise.all([
    Promise.all([
      read({ request: { $exists: false }, $or: [{ name: { $nin: [...JOURNEY_METRICS] } }, { cache: { $exists: true } }] }),
      read({ request: { $exists: true } }),
    ]),
    recentBuilds(),
  ]);
  const rows = reads.flat();
  const loadOf = (row: { name: string; cache?: string }) => JOURNEY_METRICS.has(row.name) ? row.cache : undefined;
  const summaries = summarisePerformance(rows, row => [row.name, row.route, loadOf(row), row.request, row.region])
    .map(({ sample, stats }): PerformanceSummary => {
      const cache = loadOf(sample);
      return { name: sample.name, route: sample.route, ...(cache && { cache: cache as PerformanceCache }),
        ...(sample.request && { request: sample.request as PerformanceRequest }), ...(sample.region && { region: sample.region }), ...stats };
    })
    .sort((a, b) => b.samples - a.samples || a.name.localeCompare(b.name));
  return NextResponse.json({ since: since.toISOString(), build, totalSamples: rows.length, summaries, builds } satisfies AdminPerformanceResponse);
}
