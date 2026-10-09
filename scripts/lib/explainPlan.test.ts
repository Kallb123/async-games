import { describe, expect, it } from 'vitest';
import { beyondReading, describePlan, errorLabel, explainableCommand, findExplain } from './explainPlan';

describe('describePlan', () => {
  it('names each stage and the index it scanned, outermost first', () => {
    const plan = { stage: 'PROJECTION_SIMPLE', inputStage: { stage: 'FETCH', inputStage: { stage: 'IXSCAN', indexName: 'userIdList_1_complete_1' } } };
    expect(describePlan(plan)).toBe('PROJECTION_SIMPLE > FETCH > IXSCAN userIdList_1_complete_1');
  });

  it('reads through the slot-based engine wrapper, and follows an $or into its first branch', () => {
    expect(describePlan({ queryPlan: { stage: 'FETCH', inputStage: { stage: 'OR', inputStages: [{ stage: 'IXSCAN', indexName: 'senderId_1' }, { stage: 'IXSCAN', indexName: 'userIdList.userId_1' }] } } }))
      .toBe('FETCH > OR > IXSCAN senderId_1');
  });

  it('shows a collection scan as one', () => {
    expect(describePlan({ stage: 'COLLSCAN' })).toBe('COLLSCAN');
    expect(describePlan(undefined)).toBe('—');
  });
});

describe('findExplain', () => {
  it('finds the planner and stats inside an aggregate', () => {
    const stage = { queryPlanner: { winningPlan: { stage: 'IXSCAN' } }, executionStats: { nReturned: 3 } };
    expect(findExplain({ stages: [{ $cursor: stage }, { $group: {} }] })).toBe(stage);
    expect(findExplain({ ok: 1 })).toBeUndefined();
  });
});

describe('explainableCommand', () => {
  it('drops the driver’s session and cluster fields, and keeps the query', () => {
    expect(explainableCommand({ find: 'gamedatas', filter: { complete: false }, limit: 1, lsid: { id: 1 }, $db: 'asyncgames', $clusterTime: {}, txnNumber: 2 }))
      .toEqual({ find: 'gamedatas', filter: { complete: false }, limit: 1 });
  });
});

describe('beyondReading', () => {
  const signedIn = (...actions: string[][]) => ({ authInfo: { authenticatedUsers: [{ user: 'explain' }], authenticatedUserPrivileges: actions.map(list => ({ actions: list })) } });

  it('is empty for a user with the read role and nothing else', () => {
    expect(beyondReading(signedIn(['find', 'collStats', 'listIndexes'], ['listCollections', 'dbStats', 'killCursors']))).toEqual([]);
    // Atlas's read role, as it reports itself.
    expect(beyondReading(signedIn(['changeStream', 'collStats', 'dbHash', 'dbStats', 'find', 'killCursors', 'listCollections', 'listIndexes', 'listSearchIndexes', 'planCacheRead']))).toEqual([]);
  });

  it('names anything else, including actions it has never heard of', () => {
    expect(beyondReading(signedIn(['find', 'insert', 'update'], ['createIndex', 'find'], ['grantRole', 'convertToCapped'])))
      .toEqual(['convertToCapped', 'createIndex', 'grantRole', 'insert', 'update']);
  });

  it('refuses a server where nobody is signed in', () => {
    expect(beyondReading({ authInfo: { authenticatedUsers: [], authenticatedUserPrivileges: [] } })).not.toEqual([]);
    expect(beyondReading({})).not.toEqual([]);
  });
});

describe('errorLabel', () => {
  it('keeps the name and code, never the message', () => {
    const refused = Object.assign(new Error('not authorized to execute { find: "gameresults", filter: { playerIds: "user_123" } }'), { name: 'MongoServerError', code: 13 });
    expect(errorLabel(refused)).toBe('MongoServerError 13');
    expect(errorLabel(new TypeError('user_123'))).toBe('TypeError');
  });
});
