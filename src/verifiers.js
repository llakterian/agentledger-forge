// Agent identity verification. Two independent sources.
//
// The point of AgentLedger is that an agent cannot claim an identity; it has to
// be checked against a registry that the agent does not control. Two sources
// are supported and both are read-only:
//
//  1. Concordium Agent Registry (CIS-8004). A badge check over HTTPS that
//     re-fetches the agent card and compares its SHA-256 with the hash
//     committed on-chain. Response includes every individual check, so the UI
//     can show *why* an identity is (or is not) valid.
//  2. BotIn ERC-8004 identity registry on Base Sepolia. A direct eth_call
//     read of the agent record (owner, wallet, active flag, subscription).
//
// Both return the same normalised shape, so the rest of the app does not care
// where an agent came from.

import { createHash } from 'node:crypto';
import {
  encodeCall, word, addressWord, asUint, asAddress, asBool, asString, words,
} from './abi.js';

export const CONCORDIUM_BADGE_CHECK = 'https://agent-registry-mcp.concordium.com/v1/badge-check/';
export const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';
/** BotIn contracts on Base Sepolia (84532). The proxies, not the implementations. */
export const BOTIN_IDENTITY_REGISTRY = '0x12b9e8776d5fc35cc65aeee148c5a84c2cf996b0';
export const BOTIN_IDENTITY_IMPLEMENTATION = '0x835fe55d67c332cc4ac6f77cd18b4c294b7f1c4a';
export const BOTIN_REPUTATION_REGISTRY = '0x50627a5ce19c20d9a3af4c3ae06f662dd26fa801';

/** EIP-8004 style registry labels used in the UI. */
export const SOURCES = {
  concordium: {
    id: 'concordium',
    label: 'Concordium Agent Registry (CIS-8004)',
    network: 'Concordium testnet',
  },
  erc8004: {
    id: 'erc8004',
    label: 'ERC-8004 identity registry',
    network: 'Base Sepolia (84532)',
  },
};

function sha256Hex(text) {
  return '0x' + createHash('sha256').update(text).digest('hex');
}

async function rpcCall(to, data, fetchImpl) {
  const res = await fetchImpl(BASE_SEPOLIA_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || 'RPC error');
  return body.result;
}

/**
 * Verify an agent against the Concordium Agent Registry.
 * @param {string} tokenAddress CIS-8004 token address (e.g. JyP9X278CKWoNLAFg5kVr)
 * @param {typeof fetch} fetchImpl the fetch client to use (Forge's @forge/api fetch)
 */
export async function verifyConcordiumAgent(tokenAddress, fetchImpl) {
  if (!fetchImpl) throw new Error('a fetch implementation is required');
  const res = await fetchImpl(CONCORDIUM_BADGE_CHECK + encodeURIComponent(tokenAddress), {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`badge check failed with HTTP ${res.status}`);
  const body = await res.json();
  const cardRes = body.agent_uri ? await fetchImpl(body.agent_uri, { headers: { accept: 'application/json' } }) : null;
  let cardHash = null;
  let card = null;
  if (cardRes && cardRes.ok) {
    const text = await cardRes.text();
    cardHash = sha256Hex(text);
    try { card = JSON.parse(text); } catch { card = null; }
  }
  const checks = body.checks || {};
  // A check is failed only when it is explicitly false. Some checks carry a
  // descriptive value instead of a boolean (e.g. badge_embedding: "extension").
  const failed = Object.entries(checks).filter(([, ok]) => ok === false).map(([name]) => name);
  const valid = body.badge_valid === true && failed.length === 0;
  const strip0x = (h) => String(h || '').replace(/^0x/, '').toLowerCase();
  const registryHash = body.card_sha256 || body.metadata_hash_hex || null;
  return {
    source: SOURCES.concordium.id,
    sourceLabel: SOURCES.concordium.label,
    network: body.network || SOURCES.concordium.network,
    agentId: body.token_id != null ? String(body.token_id) : null,
    tokenAddress: body.token_address || tokenAddress,
    agentUri: body.agent_uri || null,
    owner: body.on_chain?.owner_account || null,
    status: body.on_chain?.status || null,
    valid,
    checks,
    failedChecks: failed,
    issues: body.issues || [],
    cardHashOnChain: registryHash,
    cardHashComputed: cardHash,
    // the registry's own view of the card hash vs. what we just fetched
    cardHashMatches: !!(cardHash && registryHash && strip0x(cardHash) === strip0x(registryHash)),
    agentName: card?.name || null,
    agentDescription: card?.description || null,
    skills: Array.isArray(card?.skills) ? card.skills.map((s) => s.name || s.id).filter(Boolean) : [],
  };
}

/**
 * Verify an agent against the BotIn ERC-8004 registry on Base Sepolia.
 * @param {number|string} agentId
 * @param {typeof fetch} fetchImpl the fetch client to use (Forge's @forge/api fetch)
 */
export async function verifyErc8004Agent(agentId, fetchImpl) {
  if (!fetchImpl) throw new Error('a fetch implementation is required');
  const id = BigInt(agentId);
  const registry = BOTIN_IDENTITY_REGISTRY;

  // The count is read first: a registry that holds no agents at all (or an id
  // beyond the last one) must produce an explicit "not found" report rather
  // than a raw revert, so the policy can deny the action with a reason.
  const countHex = await rpcCall(registry, encodeCall('getAgentCount()'), fetchImpl);
  const totalAgents = asUint(countHex).toString();
  if (id === 0n || id > BigInt(totalAgents)) {
    return erc8004Report(id, {
      agentId: id.toString(),
      agentUri: '',
      owner: null,
      status: 'Not found',
      valid: false,
      checks: {
        registry_found: false,
        status_active: false,
        owner_set: false,
        agent_uri_present: false,
        has_agent_wallet: false,
      },
      issues: [`agent ${id} is not registered in this registry (${totalAgents} agent(s) registered)`],
      extra: { totalAgents, registry, agentWallet: null, subscriptionTier: '0', subscriptionExpiry: '0', registeredAt: '0' },
    });
  }

  let infoHex;
  let activeHex;
  try {
    [infoHex, activeHex] = await Promise.all([
      rpcCall(registry, encodeCall('getAgentInfo(uint256)', [word(id)]), fetchImpl),
      rpcCall(registry, encodeCall('isActiveAgent(uint256)', [word(id)]), fetchImpl),
    ]);
  } catch (err) {
    if (/not found|revert/i.test(err.message)) {
      return erc8004Report(id, {
        agentId: id.toString(),
        agentUri: '',
        owner: null,
        status: 'Not found',
        valid: false,
        checks: {
          registry_found: false,
          status_active: false,
          owner_set: false,
          agent_uri_present: false,
          has_agent_wallet: false,
        },
        issues: [err.message],
        extra: { totalAgents, registry, agentWallet: null, subscriptionTier: '0', subscriptionExpiry: '0', registeredAt: '0' },
      });
    }
    throw err;
  }
  const w = words(infoHex);
  if (w.length < 8) throw new Error('unexpected getAgentInfo return value');
  const agentUri = asString(infoHex);
  const isActive = asBool(activeHex);
  const owner = asAddress(w[1]);
  const agentWallet = asAddress(w[3]);
  const tier = asUint(w[4]).toString();
  const expiry = asUint(w[5]).toString();
  const registeredAt = asUint(w[7]).toString();
  const valid = isActive && owner !== '0x0000000000000000000000000000000000000000';
  const checks = {
    registry_found: true,
    status_active: isActive,
    owner_set: owner !== '0x0000000000000000000000000000000000000000',
    agent_uri_present: !!agentUri,
    has_agent_wallet: agentWallet !== '0x0000000000000000000000000000000000000000',
  };
  return erc8004Report(id, {
    agentId: id.toString(),
    agentUri,
    owner,
    status: isActive ? 'Active' : 'Inactive',
    valid,
    checks,
    issues: [],
    extra: { subscriptionTier: tier, subscriptionExpiry: expiry, registeredAt, totalAgents, registry, agentWallet },
  });
}

/** Shared shape for every ERC-8004 report, found or not. */
function erc8004Report(id, { agentId, agentUri, owner, status, valid, checks, issues, extra }) {
  return {
    source: SOURCES.erc8004.id,
    sourceLabel: SOURCES.erc8004.label,
    network: SOURCES.erc8004.network,
    agentId,
    tokenAddress: null,
    agentUri,
    owner,
    status,
    valid,
    checks,
    failedChecks: Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name),
    issues,
    cardHashOnChain: null,
    cardHashComputed: null,
    cardHashMatches: null,
    agentName: null,
    agentDescription: null,
    skills: [],
    extra,
  };
}

/**
 * Verify an agent against whichever registry can answer for it.
 * `ref` is either a CIS-8004 token address (Base58-ish string) or a decimal
 * agent id for the ERC-8004 registry.
 */
export async function verifyAgent(ref, { fetchImpl, source = 'auto' } = {}) {
  if (!fetchImpl) throw new Error('a fetch implementation is required');
  const value = String(ref || '').trim();
  if (!value) throw new Error('an agent reference is required');
  const isNumeric = /^\d+$/.test(value);
  const chosen = source === 'auto' ? (isNumeric ? 'erc8004' : 'concordium') : source;
  try {
    if (chosen === 'erc8004') return await verifyErc8004Agent(value, fetchImpl);
    return await verifyConcordiumAgent(value, fetchImpl);
  } catch (err) {
    if (chosen === 'auto' || source !== 'auto') throw err;
    // auto mode: fall back to the other registry
    const fallback = chosen === 'concordium' ? 'erc8004' : 'concordium';
    return fallback === 'erc8004'
      ? await verifyErc8004Agent(value, fetchImpl)
      : await verifyConcordiumAgent(value, fetchImpl);
  }
}
