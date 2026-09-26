export class ServerTiming {
  private readonly started = performance.now();
  private readonly entries: { name: string; duration: number }[] = [];
  async time<T>(name: string, work: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try { return await work(); } finally { this.entries.push({ name, duration: performance.now() - start }); }
  }
  header(): string {
    const all = [...this.entries, { name: 'total', duration: performance.now() - this.started }];
    return all.map(({ name, duration }) => `${name};dur=${duration.toFixed(1)}`).join(', ');
  }
}
export function timedJson(body: unknown, timing: ServerTiming, init?: ResponseInit): Response {
  const serialise = performance.now();
  const json = JSON.stringify(body);
  const duration = performance.now() - serialise;
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Content-Length', String(new TextEncoder().encode(json).byteLength));
  headers.set('Server-Timing', `${timing.header()}, serialise;dur=${duration.toFixed(1)}`);
  return new Response(json, { ...init, headers });
}
