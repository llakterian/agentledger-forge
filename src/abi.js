// Minimal ABI helpers: function selectors, static argument encoding and the
// decoding of the BotIn registry views the app relies on.
//
// Only what the app needs — dynamic (string/bytes/array) return values are
// decoded by hand for the two structs we read.

import { keccak256Hex, hexToBytes, bytesToHex } from './keccak.js';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ZERO_HASH = '0x' + '0'.repeat(64);

/** keccak256 of a signature, first 4 bytes — the function selector. */
export function selector(signature) {
  return keccak256Hex(new TextEncoder().encode(signature)).slice(0, 10);
}

/** uint256 -> 32-byte hex word */
export function word(value) {
  let v = typeof value === 'bigint' ? value : BigInt(value);
  if (v < 0n) v = (1n << 256n) + v;
  return v.toString(16).padStart(64, '0');
}

/** address -> 32-byte hex word */
export function addressWord(address) {
  return String(address).replace(/^0x/, '').toLowerCase().padStart(64, '0');
}

/** bool -> 32-byte hex word */
export function boolWord(value) {
  return value ? word(1) : word(0);
}

/** bytes32 -> 32-byte hex word */
export function bytes32Word(value) {
  const s = String(value).replace(/^0x/, '').toLowerCase();
  if (s.length !== 64) throw new Error(`bytes32 must be 32 bytes: ${value}`);
  return s;
}

/** Build calldata for a call with only static (word-sized) arguments. */
export function encodeCall(signature, args = []) {
  let data = selector(signature);
  for (const arg of args) data += arg;
  return data;
}

/** Split a 32-byte-word ABI return value into its words. */
export function words(hex) {
  const s = String(hex).replace(/^0x/, '');
  const out = [];
  for (let i = 0; i + 64 <= s.length; i += 64) out.push('0x' + s.slice(i, i + 64));
  return out;
}

/** Read a uint from a word. */
export function asUint(wordHex) {
  return BigInt('0x' + String(wordHex).replace(/^0x/, ''));
}

/** Read an address from a word. */
export function asAddress(wordHex) {
  return '0x' + String(wordHex).replace(/^0x/, '').slice(-40);
}

/** Read a bool from a word. */
export function asBool(wordHex) {
  return BigInt(wordHex) !== 0n;
}

/**
 * Decode a dynamic string return value (offset word + length word + data).
 * Used for `tokenURI` / `agentURI` / `getMetadata`.
 */
export function asString(hex) {
  const s = String(hex).replace(/^0x/, '');
  if (s.length === 0) return '';
  const offset = parseInt(s.slice(0, 64), 16) * 2;
  if (offset === 0) return '';
  const len = parseInt(s.slice(offset, offset + 64), 16);
  const bytes = Buffer.from(s.slice(offset + 64, offset + 64 + len * 2), 'hex');
  return bytes.toString('utf8');
}

/** Decode a `bytes` return value (offset + length + data) to a hex string. */
export function asBytes(hex) {
  const s = String(hex).replace(/^0x/, '');
  if (s.length === 0) return '0x';
  const offset = parseInt(s.slice(0, 64), 16) * 2;
  if (offset === 0) return '0x';
  const len = parseInt(s.slice(offset, offset + 64), 16);
  return '0x' + s.slice(offset + 64, offset + 64 + len * 2);
}

/**
 * Decode `getAgentInfo(uint256)`:
 *   AgentInfo { uint256 agentId; address owner; string agentURI;
 *               address agentWallet; uint256 subscriptionTier;
 *               uint256 subscriptionExpiry; bool isActive; uint256 registeredAt; }
 * The struct is returned as a static tuple followed by one dynamic offset.
 */
export function decodeAgentInfo(hex) {
  const w = words(hex);
  if (w.length < 9) throw new Error(`unexpected getAgentInfo return length (${w.length} words)`);
  return {
    agentId: asUint(w[0]).toString(),
    owner: asAddress(w[1]),
    agentURI: asString(hex),
    agentWallet: asAddress(w[3]),
    subscriptionTier: asUint(w[4]).toString(),
    subscriptionExpiry: asUint(w[5]).toString(),
    isActive: asBool(w[6]),
    registeredAt: asUint(w[7]).toString(),
  };
}

/** keccak of the packed ABI encoding of (uint256 agentId) — used for reference ids. */
export function hashUint(value) {
  return keccak256Hex(hexToBytes('0x' + word(value)));
}

export { keccak256Hex, hexToBytes, bytesToHex };
