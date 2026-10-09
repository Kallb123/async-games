import type { AdminPerformanceResponse, PerformanceSummary } from '@/app/api/admin/performance/route';
import { isByteMetric, isShiftMetric } from '@/utils/performance';

/** One timing in the unit its metric is measured in: CLS is unitless, byte counts read as KB, the rest are ms. */
export const formatPerformanceValue = (name: string, n: number) => isShiftMetric(name) ? n.toFixed(3)
  : isByteMetric(name) ? `${Math.round(n / 1024)} KB` : `${Math.round(n)} ms`;

/** Escapes the characters that would break a Markdown table cell. */
const cell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');

/** Summary rows as a Markdown table, with any `lead` columns (a journey trace's step) before the metric. */
export function performanceTable<Row extends PerformanceSummary>(rows: Row[], lead: { heading: string; cell: (row: Row) => string }[] = []): string[] {
  const leading = (row: Row) => lead.map(column => `${cell(column.cell(row))} | `).join('');
  return [
    `| ${lead.map(column => `${column.heading} | `).join('')}Metric | Route | Load | Request | Region | Samples | Median | p75 | p95 |`,
    `| ${lead.map(() => '--- | ').join('')}--- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |`,
    ...rows.map(row => `| ${leading(row)}${cell(row.name)} | ${cell(row.route)} | ${cell(row.cache ?? '')} | ${cell(row.request ?? '')} | ${cell(row.region ?? '')} | ${row.samples} | ${[row.median, row.p75, row.p95].map(n => formatPerformanceValue(row.name, n)).join(' | ')} |`),
  ];
}

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
    ...performanceTable(data.summaries),
    '',
  ].join('\n');
}
