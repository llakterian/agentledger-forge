// Which hashing convention does the Concordium registry use for the agent card?
import { createHash } from 'node:crypto';

const res = await fetch('https://botin-7ud.pages.dev/.well-known/agent-card.json');
const text = await res.text();
const sha = (s) => createHash('sha256').update(s).digest('hex');
const canon = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
};
const obj = JSON.parse(text);
console.log(JSON.stringify({
  expected: '49a19c07a9c6716dc3898d7d60b4303a4445aea9e66ff7b3180f5bf4b23c2402',
  raw: sha(text),
  trimmed: sha(text.trim()),
  canon: sha(canon(obj)),
  compact: sha(JSON.stringify(obj)),
  len: text.length,
}, null, 2));
