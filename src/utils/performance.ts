/** Privacy-safe performance telemetry shared by the browser, API routes, and admin report. */
export const PERFORMANCE_METRIC_NAMES = [
  'navigation', 'auth_ready', 'first_data', 'dashboard_usable', 'game_board_painted',
  'game_usable', 'server_total', 'server_auth', 'server_mongo_connect', 'server_mongo_query', 'server_player_directory', 'server_response_build', 'server_response', 'server_reactions', 'server_serialise', 'response_bytes', 'image_load', 'LCP', 'INP', 'CLS', 'FCP', 'TTFB',
] as const;
export type PerformanceMetricName = typeof PERFORMANCE_METRIC_NAMES[number];

export interface PerformanceMetricInput {
  name: PerformanceMetricName;
  value: number;
  route: string;
  source?: 'link' | 'history' | 'load' | 'deep-link';
  cache?: 'cold' | 'warm';
  connection?: string;
  build?: string;
}

export function safeRoute(pathname: string): string {
  const route = pathname.split('?')[0];
  if (/^\/games\/result\/[^/]+$/.test(route)) return '/games/result/[gameId]';
  if (/^\/games\/[^/]+\/[^/]+$/.test(route)) return route.replace(/\/[^/]+$/, '/[gameid]');
  if (/^\/kingdombuilder\/[^/]+\/[^/]+$/.test(route)) return '/kingdombuilder/[worldId]/[settlementId]';
  if (/^\/kingdombuilder\/[^/]+$/.test(route)) return '/kingdombuilder/[worldId]';
  if (/^\/lobby\/[^/]+$/.test(route)) return '/lobby/[inviteId]';
  if (/^\/profile\/[^/]+$/.test(route)) return '/profile/[userId]';
  if (/^[a-z0-9_\-/]{1,120}$/i.test(route) && !/[0-9a-f]{8}-[0-9a-f-]{20,}/i.test(route)) return route;
  return 'other';
}
