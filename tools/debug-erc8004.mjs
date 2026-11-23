// Debug the Base Sepolia ERC-8004 registry calls.
import { encodeCall, word, asUint, words } from '../src/abi.js';

const RPC = 'https://sepolia.base.org';
const REG = '0x12b9e8776d5fc35cc65aeee148c5a84c2cf996b0';

async function call(data) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: REG, data }, 'latest'] }),
  });
  const body = await res.json();
  return body;
}

for (const sig of ['getAgentCount()', 'owner()', 'PAYMENT_VAULT()']) {
  const r = await call(encodeCall(sig));
  console.log(sig, '->', r.error ? `ERROR ${r.error.message}` : r.result);
}

for (const id of [1, 2, 3, 1190]) {
  const r = await call(encodeCall('ownerOf(uint256)', [word(id)]));
  console.log(`ownerOf(${id}) ->`, r.error ? `ERROR ${r.error.message}` : r.result);
  const a = await call(encodeCall('isActiveAgent(uint256)', [word(id)]));
  console.log(`isActiveAgent(${id}) ->`, a.error ? `ERROR ${a.error.message}` : a.result);
}

const info = await call(encodeCall('getAgentInfo(uint256)', [word(1)]));
console.log('getAgentInfo(1) ->', JSON.stringify(info).slice(0, 900));
const uri = await call(encodeCall('tokenURI(uint256)', [word(1)]));
console.log('tokenURI(1) ->', JSON.stringify(uri).slice(0, 500));
