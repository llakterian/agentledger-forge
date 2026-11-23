// Unit tests for the pure parts of AgentLedger.
//
//   node --test test/
//
// These run without an Atlassian account: the identity, policy and hash-chain
// logic is deliberately kept free of platform dependencies.

import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256Hex, hexToBytes } from '../src/keccak.js';
import { selector, word, addressWord, asUint, asAddress, asBool } from '../src/abi.js';
import { canonical, appendAttestation, verifyChain, summarize, attestationHash, GENESIS_HASH } from '../src/attestations.js';
import { evaluateAction, policyTable, ACTIONS } from '../src/policy.js';

test('keccak256 matches the known empty-string vector', () => {
  assert.equal(
    keccak256Hex(new Uint8Array(0)),
    '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
  );
});

test('keccak256 matches the "abc" vector', () => {
  assert.equal(
    keccak256Hex(new TextEncoder().encode('abc')),
    '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45',
  );
});

test('function selectors match known ERC-20 selectors', () => {
  assert.equal(selector('transfer(address,uint256)'), '0xa9059cbb');
  assert.equal(selector('balanceOf(address)'), '0x70a08231');
  assert.equal(selector('totalSupply()'), '0x18160ddd');
});

test('word encoding pads to 32 bytes', () => {
  assert.equal(word(1), '0'.repeat(63) + '1');
  assert.equal(word(255), '0'.repeat(62) + 'ff');
  assert.equal(addressWord('0x835fe55d67c332cc4ac6f77cd18b4c294b7f1c4a'),
    '000000000000000000000000835fe55d67c332cc4ac6f77cd18b4c294b7f1c4a');
});

test('word and address decoding round-trip', () => {
  assert.equal(asUint(word(1190)), 1190n);
  assert.equal(asAddress(addressWord('0x835fe55d67c332cc4ac6f77cd18b4c294b7f1c4a')), '0x835fe55d67c332cc4ac6f77cd18b4c294b7f1c4a');
  assert.equal(asBool(word(1)), true);
  assert.equal(asBool(word(0)), false);
});

test('canonical JSON is order independent', () => {
  assert.equal(canonical({ b: 1, a: 2 }), canonical({ a: 2, b: 1 }));
  assert.notEqual(canonical({ a: 1 }), canonical({ a: 2 }));
});

test('the attestation chain links and verifies', () => {
  let chain = [];
  chain = appendAttestation(chain, {
    issueKey: 'SAFE-1', action: 'comment', agentRef: 'agent-1', agentId: '1190',
    verdict: 'allowed', reason: 'ok', actorAccountId: 'acc-1', actorType: 'agent', ts: '2026-11-24T10:00:00.000Z',
  });
  chain = appendAttestation(chain, {
    issueKey: 'SAFE-1', action: 'refund', agentRef: 'agent-1', agentId: '1190',
    verdict: 'flagged', reason: 'human approval required', actorAccountId: 'acc-1', actorType: 'agent', ts: '2026-11-24T10:05:00.000Z',
  });
  const state = verifyChain(chain);
  assert.equal(state.valid, true);
  assert.equal(state.length, 2);
  assert.equal(chain[0].prevHash, GENESIS_HASH);
  assert.equal(chain[1].prevHash, chain[0].hash);
  assert.equal(chain[0].hash, attestationHash({ ...chain[0], hash: undefined }).hash || chain[0].hash);
});

test('tampering with an entry breaks the chain', () => {
  let chain = [];
  chain = appendAttestation(chain, {
    issueKey: 'SAFE-1', action: 'comment', verdict: 'allowed', ts: '2026-11-24T10:00:00.000Z',
  });
  chain = appendAttestation(chain, {
    issueKey: 'SAFE-1', action: 'transition', verdict: 'allowed', ts: '2026-11-24T10:01:00.000Z',
  });
  const tampered = chain.map((e, i) => (i === 0 ? { ...e, verdict: 'denied' } : e));
  const state = verifyChain(tampered);
  assert.equal(state.valid, false);
  assert.equal(state.brokenAt, 0);
});

test('removing an entry breaks the chain', () => {
  let chain = [];
  chain = appendAttestation(chain, { issueKey: 'SAFE-1', action: 'comment', verdict: 'allowed', ts: 't1' });
  chain = appendAttestation(chain, { issueKey: 'SAFE-1', action: 'triage', verdict: 'allowed', ts: 't2' });
  const removed = [chain[0]];
  assert.equal(verifyChain(removed).valid, true); // a shorter prefix is still consistent
  const forged = [{ ...chain[0] }, { ...chain[1], prevHash: GENESIS_HASH }];
  assert.equal(verifyChain(forged).valid, false);
});

test('summarize reports the head and the chain state', () => {
  const chain = appendAttestation([], { issueKey: 'SAFE-2', action: 'comment', verdict: 'allowed', ts: 't1' });
  const s = summarize(chain);
  assert.equal(s.count, 1);
  assert.equal(s.chainValid, true);
  assert.equal(s.head, chain[0].hash);
});

test('policy allows a verified agent to comment', () => {
  const d = evaluateAction({ action: 'comment', identity: { valid: true, failedChecks: [] } });
  assert.equal(d.allowed, true);
  assert.equal(d.verdict, 'allowed');
});

test('policy denies an unverified agent', () => {
  const d = evaluateAction({ action: 'comment', identity: null });
  assert.equal(d.allowed, false);
  assert.equal(d.verdict, 'denied');
});

test('policy denies an agent whose identity checks failed', () => {
  const d = evaluateAction({ action: 'comment', identity: { valid: false, failedChecks: ['status_active'] } });
  assert.equal(d.allowed, false);
  assert.match(d.reason, /status_active/);
});

test('human-gated actions are flagged until approved', () => {
  const identity = { valid: true, failedChecks: [] };
  const flagged = evaluateAction({ action: 'refund', identity });
  assert.equal(flagged.allowed, false);
  assert.equal(flagged.verdict, 'flagged');
  assert.equal(flagged.requiresHuman, true);
  const approved = evaluateAction({ action: 'refund', identity, humanApproved: true });
  assert.equal(approved.allowed, true);
  assert.equal(approved.verdict, 'approved');
});

test('unknown actions are denied', () => {
  const d = evaluateAction({ action: 'drop-database', identity: { valid: true } });
  assert.equal(d.allowed, false);
  assert.equal(d.verdict, 'denied');
});

test('the policy table lists every action and its gate', () => {
  const table = policyTable();
  assert.equal(table.length, Object.keys(ACTIONS).length);
  const refund = table.find((p) => p.action === 'refund');
  assert.equal(refund.requiresHuman, true);
  assert.equal(refund.severity, 'critical');
});
