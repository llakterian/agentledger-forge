// Local manifest validation.
//
// The Forge CLI only validates a manifest when it deploys, and deploying needs
// an Atlassian login. This script checks the things that would otherwise only
// fail at deploy time:
//
//   * the YAML parses and has the expected top-level shape
//   * every key referenced by rovo:mcp.tools / rovo:agent.actions exists
//   * every function handler maps to an export in src/index.js
//   * every resource path exists on disk
//   * every resource: reference (icon, prompt) resolves to a file
//   * the egress allow-list covers every host the backend talks to
//
//   node tools/validate-manifest.mjs

import { readFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const notes = [];

function fail(msg) { problems.push(msg); }

// ── manifest ──────────────────────────────────────────────────────────────────
const manifestRaw = await readFile(join(root, 'manifest.yml'), 'utf8');
let manifest;
try {
  manifest = yaml.load(manifestRaw);
} catch (err) {
  console.error(`manifest.yml is not valid YAML: ${err.message}`);
  process.exit(1);
}

const modules = manifest.modules || {};
const resources = manifest.resources || [];

// ── app / runtime ─────────────────────────────────────────────────────────────
if (!manifest.app) fail('manifest.app is missing');
else {
  if (!manifest.app.id) fail('manifest.app.id is missing');
  if (!manifest.app.runtime?.name) fail('manifest.app.runtime.name is missing');
  else if (!/^nodejs/.test(manifest.app.runtime.name)) {
    fail(`unexpected runtime ${manifest.app.runtime.name} (expected a nodejs runtime)`);
  }
}

// ── resource paths ────────────────────────────────────────────────────────────
const resourceByKey = new Map();
for (const res of resources) {
  if (!res.key) { fail('a resource is missing its key'); continue; }
  if (!res.path) { fail(`resource ${res.key} is missing its path`); continue; }
  resourceByKey.set(res.key, res.path);
  try {
    await access(join(root, res.path));
  } catch {
    fail(`resource ${res.key} points at ${res.path}, which does not exist`);
  }
}

// ── resource: references ──────────────────────────────────────────────────────
// "resource:<key>;<path inside the resource>"
function checkResourceRef(value, where) {
  const m = /^resource:([^;]+);(.+)$/.exec(String(value || ''));
  if (!m) return; // absolute URL or a plain path
  const [, key, inner] = m;
  const res = resourceByKey.get(key);
  if (!res) { fail(`${where}: references unknown resource "${key}"`); return; }
  return join(root, res, inner);
}

const resourceFiles = new Set();
for (const [type, list] of Object.entries(modules)) {
  for (const mod of list || []) {
    if (mod.icon) {
      const p = checkResourceRef(mod.icon, `${type}:${mod.key}.icon`);
      if (p) {
        resourceFiles.add(p);
        try { await access(p); } catch { fail(`${type}:${mod.key}.icon -> ${p} does not exist`); }
      }
    }
    if (mod.prompt) {
      const p = checkResourceRef(mod.prompt, `${type}:${mod.key}.prompt`);
      if (p) {
        resourceFiles.add(p);
        try { await access(p); } catch { fail(`${type}:${mod.key}.prompt -> ${p} does not exist`); }
      }
    }
  }
}

// ── functions ─────────────────────────────────────────────────────────────────
const functionKeys = new Set((modules.function || []).map((f) => f.key));
const handlers = (modules.function || []).map((f) => f.handler);
const indexSource = await readFile(join(root, 'src/index.js'), 'utf8');
const exportedNames = new Set(
  [...indexSource.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1])
    .concat([...indexSource.matchAll(/export\s*\{([^}]+)\}/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop())))
    .filter(Boolean),
);

for (const fn of modules.function || []) {
  if (!fn.key) fail('a function module is missing its key');
  if (!fn.handler) { fail(`function ${fn.key} is missing its handler`); continue; }
  const [file, name] = fn.handler.split('.');
  if (file !== 'index') {
    notes.push(`function ${fn.key} points at ${file} (only src/index.js is wired up in this app)`);
  }
  if (name && !exportedNames.has(name)) {
    fail(`function ${fn.key} -> ${fn.handler}, but src/index.js does not export "${name}"`);
  }
}

// ── actions ───────────────────────────────────────────────────────────────────
const actionKeys = new Set((modules.action || []).map((a) => a.key));
for (const action of modules.action || []) {
  if (!action.key) { fail('an action module is missing its key'); continue; }
  if (!action.function) fail(`action ${action.key} is missing its function`);
  else if (!functionKeys.has(action.function)) {
    fail(`action ${action.key} -> function "${action.function}", which is not declared`);
  }
  if (!action.actionVerb) fail(`action ${action.key} is missing its actionVerb`);
  else if (!['GET', 'CREATE', 'UPDATE', 'DELETE', 'TRIGGER'].includes(action.actionVerb)) {
    fail(`action ${action.key} has an invalid actionVerb "${action.actionVerb}"`);
  }
  if (!action.description) fail(`action ${action.key} is missing its description`);
  if (!action.inputs || !Object.keys(action.inputs).length) {
    fail(`action ${action.key} must declare at least one input`);
  } else {
    for (const [name, input] of Object.entries(action.inputs)) {
      if (!input.title) fail(`action ${action.key}.${name} is missing its title`);
      if (!input.type) fail(`action ${action.key}.${name} is missing its type`);
      else if (!['string', 'integer', 'number', 'boolean'].includes(input.type)) {
        fail(`action ${action.key}.${name} has an unsupported type "${input.type}"`);
      }
      if (input.required === undefined) fail(`action ${action.key}.${name} is missing "required"`);
    }
  }
  if ((action.name || '').length > 30) {
    notes.push(`action ${action.key} name is ${action.name.length} characters (keep it short for the agent)`);
  }
}

// ── rovo modules ──────────────────────────────────────────────────────────────
const skillKeys = new Set((modules['rovo:skill'] || []).map((s) => s.key));
for (const skill of modules['rovo:skill'] || []) {
  if (!skill.key) fail('a rovo:skill module is missing its key');
  if (!skill.source?.dir) fail(`rovo:skill ${skill.key} is missing its source.dir`);
  else {
    const dir = join(root, skill.source.dir);
    try {
      await access(join(dir, 'SKILL.md'));
    } catch {
      fail(`rovo:skill ${skill.key} -> ${skill.source.dir}/SKILL.md does not exist`);
    }
    const skillMd = await readFile(join(dir, 'SKILL.md'), 'utf8').catch(() => '');
    const fm = /^---\n([\s\S]*?)\n---/.exec(skillMd);
    if (!fm) fail(`rovo:skill ${skill.key}: SKILL.md has no YAML frontmatter`);
    else {
      const name = /^name:\s*(.+)$/m.exec(fm[1])?.[1]?.trim();
      const dirName = skill.source.dir.split('/').pop();
      if (name !== dirName) {
        fail(`rovo:skill ${skill.key}: frontmatter name "${name}" must match the directory name "${dirName}"`);
      }
      if (!/^description:\s*\S/m.test(fm[1])) fail(`rovo:skill ${skill.key}: SKILL.md is missing a description`);
    }
  }
  for (const tool of skill.dependencies?.tools || []) {
    if (!actionKeys.has(tool)) {
      fail(`rovo:skill ${skill.key} depends on tool "${tool}", which is not a declared action`);
    }
  }
}

for (const mcp of modules['rovo:mcp'] || []) {
  if (!mcp.key) fail('a rovo:mcp module is missing its key');
  if (!mcp.name) fail(`rovo:mcp ${mcp.key} is missing its name`);
  else if (mcp.name.length > 30) fail(`rovo:mcp ${mcp.name} exceeds 30 characters`);
  if (!mcp.tools || !mcp.tools.length) fail(`rovo:mcp ${mcp.key} must expose at least one tool`);
  for (const tool of mcp.tools || []) {
    if (!actionKeys.has(tool)) {
      fail(`rovo:mcp ${mcp.key} exposes tool "${tool}", which is not a declared action`);
    }
  }
}

for (const agent of modules['rovo:agent'] || []) {
  if (!agent.key) fail('a rovo:agent module is missing its key');
  if (!agent.name) fail(`rovo:agent ${agent.key} is missing its name`);
  else if (agent.name.length > 30) fail(`rovo:agent ${agent.name} exceeds 30 characters`);
  if (!agent.prompt) fail(`rovo:agent ${agent.key} is missing its prompt`);
  for (const action of agent.actions || []) {
    if (!actionKeys.has(action)) {
      fail(`rovo:agent ${agent.key} references action "${action}", which is not declared`);
    }
  }
  for (const skill of agent.skills || []) {
    if (!skillKeys.has(skill)) {
      fail(`rovo:agent ${agent.key} references skill "${skill}", which is not declared`);
    }
  }
}

// ── jira:issuePanel ───────────────────────────────────────────────────────────
for (const panel of modules['jira:issuePanel'] || []) {
  if (!panel.title) fail(`jira:issuePanel ${panel.key} is missing its title`);
  if (!panel.resource) fail(`jira:issuePanel ${panel.key} is missing its resource`);
  else if (!resourceByKey.has(panel.resource)) {
    fail(`jira:issuePanel ${panel.key} -> unknown resource "${panel.resource}"`);
  }
  if (!panel.icon) fail(`jira:issuePanel ${panel.key} is missing its icon`);
}

// ── egress allow-list ─────────────────────────────────────────────────────────
const egress = manifest.permissions?.external?.fetch?.backend || [];
const allowed = new Set(egress.map((e) => (typeof e === 'string' ? e : e.address).replace(/^https?:\/\//, '').replace(/\/.*$/, '')));
const usedHosts = ['agent-registry-mcp.concordium.com', 'sepolia.base.org', 'botin-7ud.pages.dev'];
for (const host of usedHosts) {
  if (!allowed.has(host)) fail(`the backend calls ${host} but it is not in permissions.external.fetch.backend`);
}
if (![...allowed].some((h) => h.endsWith('atlassian.net'))) {
  fail('the backend resolves the site cloud id via <site>.atlassian.net/_edge/tenant_info — allow it in permissions.external.fetch.backend');
}

if (!manifest.permissions?.scopes?.includes('storage:app')) {
  fail('the @forge/kvs package needs the storage:app scope');
}

// ── report ────────────────────────────────────────────────────────────────────
console.log(`manifest.yml parsed: ${Object.keys(modules).length} module types, ${resources.length} resource(s)`);
console.log(`actions: ${(modules.action || []).length} · rovo:mcp: ${(modules['rovo:mcp'] || []).length} · rovo:agent: ${(modules['rovo:agent'] || []).length}`);
if (notes.length) {
  console.log('\nnotes:');
  for (const n of notes) console.log(`  - ${n}`);
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('\nmanifest validation passed');
