'use client'

import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { useCallback, useEffect, useRef } from 'react';
import { safeRoute, type PerformanceMetricInput, type PerformanceMetricName } from '@/utils/performance';

declare global { interface Window { __agPerformanceReport?: (name: PerformanceMetricName, value: number) => void; } }
const queue: PerformanceMetricInput[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function send() {
  timer = undefined;
  const body = queue.splice(0, queue.length);
  if (!body.length) return;
  const payload = JSON.stringify(body);
  if (!navigator.sendBeacon('/api/performance', new Blob([payload], { type: 'application/json' }))) {
    void fetch('/api/performance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true });
  }
}
function enqueue(metric: PerformanceMetricInput) {
  queue.push(metric);
  if (queue.length >= 10) send(); else timer ??= setTimeout(send, 5000);
}

/** App-wide route, Core Web Vital, and custom journey timing collector. */
export default function PerformanceReporter() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const routeStarted = useRef(0);
  const report = useCallback((name: PerformanceMetricName, value: number) => {
    const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
    enqueue({ name, value: Math.max(0, value), route: safeRoute(location.pathname),
      source: name === 'navigation' ? 'history' : 'load', connection,
      build: process.env.NEXT_PUBLIC_BUILD_TIME });
  }, []);

  useReportWebVitals(metric => enqueue({ name: metric.name as PerformanceMetricName, value: metric.value,
    route: safeRoute(location.pathname), source: 'load', build: process.env.NEXT_PUBLIC_BUILD_TIME }));

  useEffect(() => {
    window.__agPerformanceReport = report;
    const intent = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!target) return;
      routeStarted.current = performance.now(); performance.mark('ag_navigation_intent');
    };
    document.addEventListener('pointerdown', intent, true);
    const keyboardIntent = (event: KeyboardEvent) => { if (event.key === 'Enter') intent(event); };
    document.addEventListener('keydown', keyboardIntent, true);
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        if (resource.initiatorType === 'img') enqueue({ name: 'image_load', value: resource.duration, route: safeRoute(location.pathname), source: 'load' });
      }
    });
    observer.observe({ type: 'resource', buffered: true });
    return () => {
      delete window.__agPerformanceReport;
      document.removeEventListener('pointerdown', intent, true);
      document.removeEventListener('keydown', keyboardIntent, true);
      observer.disconnect();
      if (timer) { clearTimeout(timer); send(); }
    };
  }, [report]);

  useEffect(() => {
    performance.mark('ag_route_commit');
    if (previous.current !== pathname) report('navigation', performance.now() - routeStarted.current);
    previous.current = pathname;
  }, [pathname, report]);
  return null;
}
