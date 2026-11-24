// Tests for how Forge hands a resolver its arguments.
//
// This is the bug that broke the panel: Forge calls a resolver with
// `{ context, call: { functionKey, payload } }`, so reading `payload.op`
// straight off the first argument silently returns undefined and the handler
// answers with something plausible instead of doing the work.
//
//   node --test test/

import test from 'node:test';
import assert from 'node:assert/strict';
import { unpack, issueKeyFrom } from '../src/resolver.js';

test('unpack reads the payload out of the Forge call envelope', () => {
  const { payload, context } = unpack({
    context: { cloudId: 'cloud-1' },
    call: { functionKey: 'resolver', payload: { op: 'verify-agent', agentRef: 'ABC' } },
  });
  assert.equal(payload.op, 'verify-agent');
  assert.equal(payload.agentRef, 'ABC');
  assert.equal(context.cloudId, 'cloud-1');
});

test('unpack tolerates a call envelope with no payload', () => {
  const { payload, context } = unpack({ context: { cloudId: 'cloud-1' }, call: { functionKey: 'resolver' } });
  assert.deepEqual(payload, {});
  assert.equal(context.cloudId, 'cloud-1');
});

test('unpack accepts the module-resolver shape (payload, context)', () => {
  const { payload, context } = unpack(
    { extension: { issue: { key: 'KAN-1', id: '10010' } } },
    { cloudId: 'cloud-2' },
  );
  assert.equal(payload.extension.issue.key, 'KAN-1');
  assert.equal(context.cloudId, 'cloud-2');
});

test('unpack survives being called with nothing at all', () => {
  const { payload, context } = unpack();
  assert.deepEqual(payload, {});
  assert.deepEqual(context, {});
});

test('unpack keeps a null payload from becoming a crash', () => {
  const { payload } = unpack({ context: {}, call: { functionKey: 'resolver', payload: null } });
  assert.deepEqual(payload, {});
});

test('issueKeyFrom finds the key in the payload envelope', () => {
  assert.equal(issueKeyFrom({ issue: { key: 'KAN-1' } }, {}), 'KAN-1');
  assert.equal(issueKeyFrom({ extension: { issue: { key: 'KAN-2' } } }, {}), 'KAN-2');
  assert.equal(issueKeyFrom({ key: 'KAN-3' }, {}), 'KAN-3');
});

test('issueKeyFrom finds the key in the context', () => {
  assert.equal(issueKeyFrom({}, { extension: { issue: { key: 'KAN-4' } } }), 'KAN-4');
  assert.equal(issueKeyFrom({}, { issue: { key: 'KAN-5' } }), 'KAN-5');
});

test('issueKeyFrom returns null when there is no key anywhere', () => {
  assert.equal(issueKeyFrom({}, {}), null);
  assert.equal(issueKeyFrom(undefined, undefined), null);
});
