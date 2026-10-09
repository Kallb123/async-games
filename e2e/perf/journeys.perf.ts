import { devices, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { clerk } from '@clerk/testing/playwright';
import { clearGames, logBrowserErrors } from '../helpers';
import { performanceTable } from '@/utils/ui/performance';
import { summarisePerformance, type PerformanceMetricInput } from '@/utils/performance';

// Phase 0 item 5 of docs/loading-performance-plan.md: the plan's journeys,
// timed by the app's own instrumentation on a throttled phone, from a cold
// and from a warm HTTP cache, PERF_RUNS times over (default 3).
//
// The numbers are the ones production reports. The spec reads the batches the
// app's PerformanceReporter sends to /api/performance rather than timing
// anything itself, so a trace measures exactly what the admin report shows.
// Each step ends by having the reporter send what it holds, then waits for the
// milestone that ends its journey, so every batch lands under the step that
// caused it.
// CLS, LCP and INP are reported as a page is hidden, so each document ends by
// being hidden (the same stub web-vitals' own tests use).
//
// Solitaire is the game: solo, so no opponent, guide or recap stands between
// the tap and the board. It is left on the account at the end, for the query
// explain step in CI to read; the next run clears it before starting.
//
// Out: perf-report/journeys.md (medians per step) and journeys.json (every
// sample), a Playwright trace per browser context and a Chrome performance
// trace of the first run, which DevTools' Performance panel opens, under
// test-results/perf/.

const PLAYER = 'playwright/.auth/player-one.json';
test.use({ storageState: PLAYER });

// The traces this uploads record the requests they made, session cookie and
// all, so the session they were made with ends with them.
test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: PLAYER });
  const page = await context.newPage();
  // Warned rather than failed: the journeys have already been timed by now.
  await page.goto('/')
    .then(() => clerk.signOut({ page }))
    .catch(error => console.warn(`Couldn't sign the perf session out; its traces still hold it: ${error}`));
  await context.close();
});

const RUNS = Number(process.env.PERF_RUNS ?? 3);
const REPORT_DIR = 'perf-report';
const TRACE_DIR = 'test-results/perf';
const GAME_ROUTE = '/games/solitaire/[gameid]';

// Lighthouse's mobile profile: a mid-range phone on a slow 4G connection.
const NETWORK = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const CPU_SLOWDOWN = 4;
// Every context the journeys run in is this phone. (Dealing the game, on the
// project's own page, needs no phone.)
const { defaultBrowserType: _browser, ...PHONE } = devices['Pixel 7'];
// How long a step waits after its screen is up for the samples that come late
// — a fetch's resource timing, paired up to three seconds after its body
// landed, and images — before it has the reporter send its queue.
const SETTLE_MS = 3_500;

type Sample = PerformanceMetricInput & { step: string; run: number };

/**
 * Every sample the app reports from `context`, under the step that was running
 * when it arrived. The pages get no `sendBeacon`, so the reporter falls back to
 * its keepalive `fetch` (PerformanceReporter's `send`): a beacon's Blob body
 * reaches Playwright without its bytes, and a batch it can't read is a failure,
 * not an empty one.
 */
async function recordSamples(context: BrowserContext, samples: Sample[], current: { step: string; run: number; unreadable: number }) {
  await context.addInitScript(() => { Navigator.prototype.sendBeacon = () => false; });
  context.on('request', request => {
    if (request.method() !== 'POST' || !new URL(request.url()).pathname.endsWith('/api/performance')) return;
    let batch: PerformanceMetricInput[];
    try { batch = JSON.parse(request.postData() ?? ''); } catch { current.unreadable++; return; }
    for (const sample of batch) samples.push({ ...sample, step: current.step, run: current.run });
  });
}

/** Has the reporter send what it holds now — it sends on `pagehide` — once the late samples are in. */
async function flush(page: Page) {
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
}

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', NETWORK);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
}

/** Hides the document, which is when web-vitals reports CLS, LCP and INP and the reporter sends them. */
async function hide(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test('time the plan’s journeys on a throttled phone', async ({ browser, page: setupPage, request }) => {
  test.setTimeout(RUNS * 6 * 60_000 + 60_000);
  mkdirSync(REPORT_DIR, { recursive: true });

  // One live game on the dashboard to open, dealt without throttling: making
  // it isn't a journey being timed.
  await clearGames(request);
  await setupPage.goto('/newgame/solitaire');
  await setupPage.getByRole('button', { name: 'Deal a new game' }).click();
  await setupPage.waitForURL(/\/games\/solitaire\/.+/);
  const gamePath = new URL(setupPage.url()).pathname;
  await setupPage.close();

  const samples: Sample[] = [];
  const current = { step: 'setup', run: 0, unreadable: 0 };

  /**
   * Runs one step on `page`: `act`, then has the reporter send everything it
   * holds and waits for the milestone that ends the step to arrive, so every
   * sample is filed under the step that caused it.
   */
  async function step(page: Page, name: string, act: () => Promise<unknown>, until?: { metric: string; route: string }) {
    current.step = name;
    await act();
    await flush(page);
    if (until) {
      await expect.poll(() => samples.some(sample => sample.step === name && sample.run === current.run
        && sample.name === until.metric && sample.route === until.route),
      { message: `${name}: waiting for ${until.metric} on ${until.route}`, timeout: 30_000 }).toBe(true);
    }
    // The reporter's fetch is under way; give it a moment to be seen.
    await page.waitForTimeout(1_000);
    expect(current.unreadable, 'performance batches the spec could not read').toBe(0);
  }

  async function openContext(browser: Browser, label: string): Promise<{ context: BrowserContext; page: Page; finish: () => Promise<void> }> {
    const context = await browser.newContext({ ...PHONE, baseURL: test.info().project.use.baseURL, storageState: PLAYER });
    await recordSamples(context, samples, current);
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    logBrowserErrors(page, label);
    await throttle(page);
    const chromeTrace = current.run === 1 ? `${TRACE_DIR}/chrome-${label}.json` : undefined;
    if (chromeTrace) await browser.startTracing(page, { path: chromeTrace, screenshots: true });
    return {
      context, page,
      finish: async () => {
        if (chromeTrace) await browser.stopTracing();
        await context.tracing.stop({ path: `${TRACE_DIR}/run-${current.run}-${label}.zip` });
        await context.close();
      },
    };
  }

  const gameLink = (page: Page) => page.locator(`a[href="${gamePath}"]:visible`).first();
  const drawButton = (page: Page) => page.getByRole('button', { name: 'Draw' });

  for (let run = 1; run <= RUNS; run++) {
    current.run = run;

    // Home from a cold cache, then the in-app journeys from it.
    const first = await openContext(browser, 'home-first');
    const { page } = first;
    await step(page, 'cold cache: open home', async () => {
      await page.goto('/');
      await gameLink(page).waitFor();
    }, { metric: 'dashboard_usable', route: '/' });
    await step(page, 'dashboard → game', async () => {
      await gameLink(page).click();
      await drawButton(page).waitFor();
    }, { metric: 'game_board_painted', route: GAME_ROUTE });
    await step(page, 'game → home', async () => {
      await page.getByRole('link', { name: 'Back' }).click();
      await gameLink(page).waitFor();
    }, { metric: 'dashboard_usable', route: '/' });
    await step(page, 'home → profile', () => page.locator('.ag-topbar').getByRole('link', { name: 'Your profile' }).click(), { metric: 'first_data', route: '/profile' });
    await step(page, 'profile → home (back button)', () => page.goBack(), { metric: 'dashboard_usable', route: '/' });
    await step(page, 'home → new game', () => page.locator('.ag-topbar').getByRole('link', { name: 'New game', exact: true }).click(), { metric: 'navigation', route: '/newgame' });
    await step(page, 'cold cache: open home (vitals)', () => hide(page));
    // A push notification opens its game by URL: a document load of the game.
    await step(page, 'warm cache: open game by link', async () => {
      await page.goto(gamePath);
      await drawButton(page).waitFor();
    }, { metric: 'game_board_painted', route: GAME_ROUTE });
    await step(page, 'warm cache: open game by link (vitals)', () => hide(page));
    await first.finish();

    // The game by link from a cold cache, then home from a warm one.
    const second = await openContext(browser, 'game-first');
    await step(second.page, 'cold cache: open game by link', async () => {
      await second.page.goto(gamePath);
      await drawButton(second.page).waitFor();
    }, { metric: 'game_board_painted', route: GAME_ROUTE });
    await step(second.page, 'cold cache: open game by link (vitals)', () => hide(second.page));
    await step(second.page, 'warm cache: open home', async () => {
      await second.page.goto('/');
      await gameLink(second.page).waitFor();
    }, { metric: 'dashboard_usable', route: '/' });
    await step(second.page, 'warm cache: open home (vitals)', () => hide(second.page));
    await second.finish();
  }

  writeFileSync(`${REPORT_DIR}/journeys.json`, JSON.stringify(samples, null, 2));
  writeFileSync(`${REPORT_DIR}/journeys.md`, journeysMarkdown(samples));
});

/** Each step's samples summarised across runs, as the admin report summarises a week. A screen's later refreshes are left out. */
function journeysMarkdown(samples: Sample[]): string {
  const timed = samples.filter(sample => sample.request !== 'refresh' && sample.step !== 'setup');
  const rows = summarisePerformance(timed, sample => [sample.step, sample.name, sample.route, sample.cache, sample.request, sample.region])
    .map(({ sample, stats }) => ({ step: sample.step, name: sample.name, route: sample.route, cache: sample.cache, request: sample.request, region: sample.region, ...stats }));
  return [
    '# Journey traces',
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- Runs: ${RUNS}, on a Pixel 7 profile with ${CPU_SLOWDOWN}× CPU slowdown, ${NETWORK.latency} ms latency and 1.6 Mbps down`,
    '- Each value is timed by the app\'s own reporter, as production reports it. Refreshes are left out.',
    '',
    ...performanceTable(rows, [{ heading: 'Step', cell: row => row.step }]),
    '',
  ].join('\n');
}
