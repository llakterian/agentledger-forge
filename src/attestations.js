// Tamper-evident attestation log.
//
// Every consequential agent action on an issue gets one attestation. Each
// attestation commits to the previous one (hash chain), so the trail cannot be
// edited or removed without breaking the chain — and the app shows the chain
// state instead of pretending the trail is authoritative.
//
// The chain lives in Forge storage (entity store). The pure functions below
// (hash, append, verify) are unit-tested locally without Atlassian.

import { createHash } from 'node:crypto';

export const GENESIS_HASH = '0x' + '0'.repeat(64);

/** Canonical JSON: keys sorted, so the hash does not depend on field order. */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

export function sha256Hex(text) {
  return '0x' + createHash('sha256').update(text).digest('hex');
}

/**
 * Hash of one attestation: the payload plus the hash of the previous entry.
 * @param {object} entry
 */
export function attestationHash(entry) {
  const { hash, ...payload } = entry;
  return sha256Hex(canonical(payload));
}

/**
 * Append an attestation to a chain. Pure: returns the new chain.
 * @param {Array<object>} chain existing attestations, oldest first
 * @param {object} input the attestation payload (without hash fields)
 */
export function appendAttestation(chain, input) {
  const prev = chain.length ? chain[chain.length - 1].hash : GENESIS_HASH;
  const base = {
    issueKey: input.issueKey,
    action: input.action,
    agentRef: input.agentRef || null,
    agentSource: input.agentSource || null,
    agentId: input.agentId || null,
    verdict: input.verdict,            // allowed | denied | approved | flagged
    reason: input.reason || null,
    actorAccountId: input.actorAccountId || null,
    actorType: input.actorType || 'human', // human | agent
    ts: input.ts,
    prevHash: prev,
  };
  const entry = { ...base, hash: attestationHash(base) };
  return [...chain, entry];
}

/**
 * Verify a chain: every entry's hash must match its content and its
 * prevHash must point at the previous entry.
 * @returns {{valid: boolean, length: number, brokenAt: number|null, reason: string|null}}
 */
export function verifyChain(chain) {
  let prev = GENESIS_HASH;
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    const { hash, ...payload } = entry;
    const expected = attestationHash(payload);
    if (hash !== expected) {
      return { valid: false, length: chain.length, brokenAt: i, reason: `entry ${i} content does not match its hash` };
    }
    if (entry.prevHash !== prev) {
      return { valid: false, length: chain.length, brokenAt: i, reason: `entry ${i} does not link to entry ${i - 1}` };
    }
    prev = hash;
  }
  return { valid: true, length: chain.length, brokenAt: null, reason: null };
}

/** A compact, human-readable summary used in the UI and in tool responses. */
export function summarize(chain) {
  const state = verifyChain(chain);
  const last = chain.length ? chain[chain.length - 1] : null;
  return {
    count: chain.length,
    chainValid: state.valid,
    brokenAt: state.brokenAt,
    reason: state.reason,
    head: last ? last.hash : GENESIS_HASH,
    latest: last,
  };
}
