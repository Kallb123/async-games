'use client'

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals/attribution';
import { loadJourney, nextJourney, safeRoute, ttfbPhaseMetrics, type Journey, type JourneyMilestone, type PerformanceMetricInput, type PerformanceMetricName } from '@/utils/performance';

declare global {
  interface Window {
    /** A duration measured by the caller (a server span, a byte count). */
    __agPerformanceReport?: (name: PerformanceMetricName, value: number) => void;
    /** A milestone reached now, timed from the start of the current journey. */
    __agPerformanceMark?: (name: JourneyMilestone) => void;
  }
}
const queue: PerformanceMetricInput[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
const BATCH_SIZE = 10;

// Held until Clerk has loaded. `/api/performance` only takes a signed-in
// player's samples, and Clerk's middleware no longer runs on page loads to
// renew an expired session token before the page arrives — Clerk's script does
// that once it starts. A cold load after a while idle, the very load the TTFB
// phases are there to explain, would otherwise send its first batch with the
// stale token, be refused, and never know: a beacon can't see its answer.
// `auth_ready` releases the queue; so does a deadline, for a screen that never
// asks Clerk who is signed in.
let sendable = false;
const SEND_DEADLINE_MS = 10_000;

function release() {
  sendable = true;
  send();
}

function send() {
  timer = undefined;
  if (!sendable) return;
  // In batches, so a queue that built up while it was held stays inside the
  // route's per-request limit.
  while (queue.length) {
    const payload = JSON.stringify(queue.splice(0, BATCH_SIZE));
    if (!navigator.sendBeacon('/api/performance', new Blob([payload], { type: 'application/json' }))) {
      void fetch('/api/performance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true });
    }
  }
}
function enqueue(metric: PerformanceMetricInput) {
  queue.push(metric);
  if (queue.length >= BATCH_SIZE) send(); else timer ??= setTimeout(send, 5000);
}

let journey: Journey | undefined;
let lastIntent: number | undefined;
let lastPopstate: number | undefined;
let navigationReported = false;

/** Whether the document has been hidden since it loaded — including before this code ran, where the browser recorded it. */
function hiddenSinceLoad() {
  return document.visibilityState === 'hidden'
    || performance.getEntriesByType('visibility-state').some(entry => entry.name === 'hidden');
}

/**
 * The journey the page is on now. Read from `location` rather than from this
 * component's `pathname`, so it is right whichever runs first after a route
 * change: this component's effect, or the new screen's marking a milestone.
 */
function currentJourney(): Journey {
  const path = location.pathname;
  if (!journey) {
    journey = loadJourney(path, hiddenSinceLoad());
  } else if (journey.path !== path) {
    journey = nextJourney(path, performance.now(), lastIntent, lastPopstate);
    navigationReported = false;
  }
  return journey;
}

function report(name: PerformanceMetricName, value: number) {
  const { source, cache } = currentJourney();
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
  enqueue({ name, value: Math.max(0, value), route: safeRoute(location.pathname), source, cache, connection,
    build: process.env.NEXT_PUBLIC_BUILD_TIME });
}

/** A Core Web Vital, or a part of one: they belong to the document load, whichever route they are reported from. */
function reportVital(name: PerformanceMetricName, value: number) {
  if (!Number.isFinite(value)) return;
  enqueue({ name, value, route: safeRoute(location.pathname), source: 'load', cache: 'cold', build: process.env.NEXT_PUBLIC_BUILD_TIME });
}

// The vitals cannot be unregistered, so they are registered once per page
// rather than once per mount (React runs effects twice in development).
let vitalsRegistered = false;
function registerVitals() {
  if (vitalsRegistered) return;
  vitalsRegistered = true;
  onTTFB(metric => {
    reportVital('TTFB', metric.value);
    for (const phase of ttfbPhaseMetrics(metric.attribution)) reportVital(phase.name, phase.value);
  });
  for (const observe of [onFCP, onLCP, onCLS, onINP]) observe(metric => reportVital(metric.name, metric.value));
}

function mark(name: JourneyMilestone) {
  const now = performance.now();
  performance.mark(`ag_${name}`);
  if (name === 'auth_ready' && !sendable) release();
  const current = currentJourney();
  if (current.hidden || current.marked.has(name)) return;
  current.marked.add(name);
  report(name, now - current.start);
}

/** App-wide route, Core Web Vital, and custom journey timing collector. */
export default function PerformanceReporter() {
  const pathname = usePathname();

  useEffect(() => {
    registerVitals();
    window.__agPerformanceReport = report;
    window.__agPerformanceMark = mark;
    currentJourney();
    // Any tap or key press may be the one that navigates: post-mutation
    // transitions (create, join, start) call `router.push` from a button
    // rather than being `<a href>`, so a link-only listener would miss them.
    const intent = () => { lastIntent = performance.now(); };
    const keyboardIntent = (event: KeyboardEvent) => {
      // Typing in a field (a chat message) is not asking to go anywhere.
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.isContentEditable || target?.closest('input, textarea, select')) return;
      if (event.key === 'Enter' || event.key === ' ') intent();
    };
    const popstate = () => { lastPopstate = performance.now(); };
    const visibility = () => { if (document.visibilityState === 'hidden') currentJourney().hidden = true; };
    document.addEventListener('pointerdown', intent, true);
    document.addEventListener('keydown', keyboardIntent, true);
    window.addEventListener('popstate', popstate);
    document.addEventListener('visibilitychange', visibility);
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        if (resource.initiatorType === 'img') report('image_load', resource.duration);
      }
    });
    observer.observe({ type: 'resource', buffered: true });
    const deadline = setTimeout(release, SEND_DEADLINE_MS);
    return () => {
      clearTimeout(deadline);
      delete window.__agPerformanceReport;
      delete window.__agPerformanceMark;
      document.removeEventListener('pointerdown', intent, true);
      document.removeEventListener('keydown', keyboardIntent, true);
      window.removeEventListener('popstate', popstate);
      document.removeEventListener('visibilitychange', visibility);
      observer.disconnect();
      if (timer) { clearTimeout(timer); send(); }
    };
  }, []);

  useEffect(() => {
    performance.mark('ag_route_commit');
    const current = currentJourney();
    if (current.source !== 'load' && current.hasIntent && !current.hidden && !navigationReported) {
      navigationReported = true;
      report('navigation', performance.now() - current.start);
    }
  }, [pathname]);
  return null;
}
