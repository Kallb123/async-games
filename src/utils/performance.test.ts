import { describe, expect, it } from 'vitest';
import { safeRoute } from './performance';

describe('safeRoute', () => {
  it.each([
    ['/games/dicecities/2b62c738-58dc-4f2d-9d45-91bc7f1bb790', '/games/dicecities/[gameid]'],
    ['/games/result/secret', '/games/result/[gameId]'],
    ['/profile/user_2secret', '/profile/[userId]'],
    ['/kingdombuilder/world-secret/settlement-secret', '/kingdombuilder/[worldId]/[settlementId]'],
    ['/lobby/invite-secret', '/lobby/[inviteId]'],
  ])('removes identifiers from %s', (input, expected) => expect(safeRoute(input)).toBe(expected));

  it('collapses an unknown identifier-shaped route', () => {
    expect(safeRoute('/unknown/2b62c738-58dc-4f2d-9d45-91bc7f1bb790')).toBe('other');
  });
});
