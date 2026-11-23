// Keccak-256 (the pre-NIST padding used by Ethereum), dependency-free.
//
// The Forge runtime bundles `src/` with esbuild; keeping the hash function in
// the project means the backend does not depend on a runtime that ships
// keccak (Node's crypto only has SHA3-256, which is a different padding).
//
// Verified against the standard vectors in test/util.test.js.

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

const ROT = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

const MASK = (1n << 64n) - 1n;

function rotl(x, n) {
  if (n === 0) return x;
  const s = BigInt(n);
  return ((x << s) | (x >> (64n - s))) & MASK;
}

function keccakF(state) {
  const B = Array.from({ length: 25 }, () => 0n);
  for (let round = 0; round < 24; round++) {
    // theta
    const C = new Array(5)
    for (let x = 0; x < 5; x++) C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    const D = new Array(5)
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) state[x + 5 * y] ^= D[x];
    // rho + pi
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(state[x + 5 * y], ROT[x][y]);
      }
    }
    // chi
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[x + 5 * y] = B[x + 5 * y] ^ ((~B[((x + 1) % 5) + 5 * y] & MASK) & B[((x + 2) % 5) + 5 * y]);
      }
    }
    // iota
    state[0] ^= RC[round];
  }
  return state;
}

/** @param {Uint8Array} input @returns {Uint8Array} 32-byte digest */
export function keccak256(input) {
  const rate = 136; // 1088 bits for keccak-256
  const padLen = rate - (input.length % rate);
  const padded = new Uint8Array(input.length + padLen);
  padded.set(input, 0);
  padded[input.length] |= 0x01; // keccak padding (not SHA3's 0x06)
  padded[padded.length - 1] |= 0x80;

  const state = new Array(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate / 8; i++) {
      // lanes are little-endian: byte 0 of the lane is the least significant
      let lane = 0n;
      for (let b = 0; b < 8; b++) lane |= BigInt(padded[offset + i * 8 + b]) << (8n * BigInt(b));
      state[i] ^= lane;
    }
    keccakF(state);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = state[i];
    for (let b = 0; b < 8; b++) {
      out[i * 8 + b] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

export function keccak256Hex(input) {
  const bytes = typeof input === 'string' ? hexToBytes(input) : input;
  return '0x' + Buffer.from(keccak256(bytes)).toString('hex');
}

/** Ethereum hex string ("0x…") -> Uint8Array */
export function hexToBytes(hex) {
  const s = String(hex).replace(/^0x/, '');
  const padded = s.length % 2 === 0 ? s : '0' + s;
  const out = new Uint8Array(padded.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes) {
  return '0x' + Buffer.from(bytes).toString('hex');
}
