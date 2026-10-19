import type { AdminPerformanceResponse, PerformanceSummary } from '@/app/api/admin/performance/route';
import { isByteMetric, isShiftMetric } from '@/utils/performance';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** One timing in the unit its metric is measured in: CLS is unitless, byte counts read as KB, the rest are ms. */
export const formatPerformanceValue = (name: string, n: number) => isShiftMetric(name) ? n.toFixed(3)
  : isByteMetric(name) ? `${Math.round(n / 1024)} KB` : `${Math.round(n)} ms`;

/** Escapes the characters that would break a Markdown table cell. */
const cell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');

/** Summary rows as a Markdown table, with any `lead` columns (a journey trace's step) before the metric. */
export function performanceTable<Row extends PerformanceSummary>(rows: Row[], lead: { heading: string; cell: (row: Row) => string }[] = []): string[] {
  const leading = (row: Row) => lead.map(column => `${cell(column.cell(row))} | `).join('');
  return [
    `| ${lead.map(column => `${column.heading} | `).join('')}Metric | Route | Load | Request | Region | Data | Samples | Median | p75 | p95 |`,
    `| ${lead.map(() => '--- | ').join('')}--- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |`,
    ...rows.map(row => `| ${leading(row)}${cell(row.name)} | ${cell(row.route)} | ${cell(row.cache ?? '')} | ${cell(row.request ?? '')} | ${cell(row.region ?? '')} | ${cell(row.dataSource ?? '')} | ${row.samples} | ${[row.median, row.p75, row.p95].map(n => formatPerformanceValue(row.name, n)).join(' | ')} |`),
  ];
}

/** A date as a `<input type="datetime-local">` holds it: the viewer's local time to the minute, no zone. */
export const toDateTimeLocal = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** What a `<input type="datetime-local">` holds, as the instant it means in the viewer's zone — null while it is empty or unfinished. */
export function fromDateTimeLocal(text: string): Date | null {
    const date = new Date(text);
    return text && !Number.isNaN(date.getTime()) ? date : null;
}

/** A span of time in the coarsest whole unit that is exact enough to read: "7 days", "36 hours", "20 minutes". */
export function formatWindowLength(ms: number): string {
    const unit = (size: number, name: string) => { const n = Math.round(ms / size); return `${n} ${name}${n === 1 ? '' : 's'}`; };
    if (ms >= 2 * DAY_MS) return unit(DAY_MS, 'day');
    if (ms >= 2 * HOUR_MS) return unit(HOUR_MS, 'hour');
    return unit(60_000, 'minute');
}

/**
 * The admin Performance section as a Markdown document, for archiving a week's
 * numbers before they age out of the 30-day retention, saying which window and which builds they cover. Always every row — the
 * on-screen route/metric filters are for reading, not for what gets kept.
 */
export function performanceMarkdown(data: AdminPerformanceResponse, generatedAt: Date = new Date()): string {
  const lines = [
    '# Async Games performance report',
    '',
    `- Generated: ${generatedAt.toISOString()}`,
    `- Window: ${data.since} → ${generatedAt.toISOString()} (${formatWindowLength(generatedAt.getTime() - Date.parse(data.since))})`,
    `- From build: ${data.build ?? 'any build'}`,
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
