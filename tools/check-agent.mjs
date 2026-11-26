// Live check of the two identity verifiers.
//
//   node tools/check-agent.mjs [agentRef]
//
// With no argument it checks both default agents: BotIn on the Concordium
// Agent Registry and BotIn's ERC-8004 registry on Base Sepolia.

import { verifyConcordiumAgent, verifyErc8004Agent } from '../src/verifiers.js';

// Outside the Forge runtime the platform global fetch is available; inside
// Forge the @forge/api fetch client is passed in instead.
const fetchImpl = (...args) => globalThis.fetch(...args);

const arg = process.argv[2];

function show(label, report) {
  console.log(`\n=== ${label} ===`);
  console.log(`  source        : ${report.sourceLabel} (${report.network})`);
  console.log(`  agent id      : ${report.agentId}`);
  console.log(`  reference     : ${report.tokenAddress || '(numeric id)'}`);
  console.log(`  owner         : ${report.owner}`);
  console.log(`  status        : ${report.status}`);
  console.log(`  valid         : ${report.valid}`);
  console.log(`  failed checks : ${(report.failedChecks || []).join(', ') || 'none'}`);
  console.log(`  card hash     : ${report.cardHashMatches === null ? 'n/a' : report.cardHashMatches ? 'matches on-chain hash' : 'MISMATCH'}`);
  if (report.agentUri) console.log(`  agent card    : ${report.agentUri}`);
  if (report.extra) console.log(`  extra         : ${JSON.stringify(report.extra)}`);
}

const targets = arg
  ? [[`agent ${arg}`, /^\d+$/.test(arg)
      ? () => verifyErc8004Agent(arg, fetchImpl)
      : () => verifyConcordiumAgent(arg, fetchImpl)]]
  : [
    ['Concordium · BotIn #1190', () => verifyConcordiumAgent('JyP9X278CKWoNLAFg5kVr', fetchImpl)],
    ['ERC-8004 · BotIn #1190 (Base Sepolia)', () => verifyErc8004Agent(1190, fetchImpl)],
  ];

let failed = 0;
for (const [label, fn] of targets) {
  try {
    const report = await fn();
    show(label, report);
    // An ERC-8004 registry that is deployed but holds no agent is a valid
    // (negative) answer, not a broken check: the app must be able to say
    // "not registered" instead of crashing.
    const emptyRegistry = report.source === 'erc8004' && report.extra?.totalAgents === '0';
    if (!report.valid && !emptyRegistry) failed++;
    if (emptyRegistry) {
      console.log('  note         : registry is deployed but empty: BotIn is registered on Concordium');
    }
  } catch (e) {
    failed++;
    console.log(`\n=== ${label} ===\n  ERROR: ${e.message}`);
  }
}
console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
