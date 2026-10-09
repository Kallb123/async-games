import type { AdminPerformanceResponse } from '@/app/api/admin/performance/route';
import { isByteMetric } from '@/utils/performance';

/** One timing in the unit its metric is measured in: CLS is unitless, byte counts read as KB, the rest are ms. */
export const formatPerformanceValue = (name: string, n: number) => name === 'CLS' ? n.toFixed(3)
  : isByteMetric(name) ? `${Math.round(n / 1024)} KB` : `${Math.round(n)} ms`;

/** Escapes the characters that would break a Markdown table cell. */
const cell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');

/**
 * The admin Performance section as a Markdown document, for archiving a week's
 * numbers before they age out of the seven-day window. Always every row — the
 * on-screen route/metric filters are for reading, not for what gets kept.
 */
export function performanceMarkdown(data: AdminPerformanceResponse, generatedAt: Date = new Date()): string {
  const lines = [
    '# Async Games performance report',
    '',
    `- Generated: ${generatedAt.toISOString()}`,
    `- Window: ${data.since} → ${generatedAt.toISOString()} (7 days)`,
    `- Samples: ${data.totalSamples}`,
    `- Metric / route pairs: ${data.summaries.length}`,
    '',
  ];
  if (data.summaries.length === 0) return [...lines, '_No performance samples in this window._', ''].join('\n');
  return [
    ...lines,
    '| Metric | Route | Load | Request | Samples | Median | p75 | p95 |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: |',
    ...data.summaries.map(row => `| ${cell(row.name)} | ${cell(row.route)} | ${cell(row.cache ?? '')} | ${cell(row.request ?? '')} | ${row.samples} | ${[row.median, row.p75, row.p95].map(n => formatPerformanceValue(row.name, n)).join(' | ')} |`),
    '',
  ].join('\n');
}
