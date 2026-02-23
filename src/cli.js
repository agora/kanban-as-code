import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import fg from 'fast-glob';
import matter from 'gray-matter';

import {
  ACTIVE_INITIATIVE_STATUSES,
  ACTIVE_SLICE_STATUSES,
  ACTIVE_STRATEGY_STATUSES,
  STAGE_ORDER,
  WORKFLOW_STATUSES,
  STRATEGY_STATUS_FLOW,
  SLICE_STATUS_FLOW,
  inferTypeFromCollectionName,
  getSchemaForType,
} from './schema.js';

const require = createRequire(import.meta.url);
let version = '0.0.0';
try {
  const pkg = require('../package.json');
  version = pkg.version || version;
} catch (error) {
  // keep fallback during direct file execution
}

const DEFAULT_CONFIG_NAME = 'kan.config.json';
const DEFAULT_OUTPUT = '.kan';
const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const AGENT_CLAIMS_FILE = '.kan/agent-claims.json';
const DEFAULT_AGENT_TTL_HOURS = 6;
const AGENTS_WORKTREE_SCRIPT_PATH = 'scripts/kan-agent-worktree.sh';
const AGENT_SCOPE_GUARD_WORKFLOW_PATH = '.github/workflows/kan-agent-scope-guard.yml';
const AGENT_COMPOUND_AUTOPILOT_WORKFLOW_PATH = '.github/workflows/kan-compound-autopilot.yml';
const SKELETON_AGENTS_DOC = 'agents.md';
const SKELETON_KANBAN_DIRS = [
  'kanban',
  'kanban/roadmap',
  'kanban/roadmap/themes',
  'kanban/roadmap/areas',
  'kanban/roadmap/initiatives',
  'kanban/work',
  'kanban/work/ideas',
  'kanban/work/strategic-briefs',
  'kanban/work/functional-specs',
  'kanban/work/technical-plans',
  'kanban/work/implementations',
  'kanban/work/tasks',
  'kanban/workflows',
  'kanban/archive',
];
const SKELETON_DOCS_DIRS = [
  'docs',
  'docs/architecture',
  'docs/architecture/entities',
  'docs/architecture/patterns',
  'docs/contracts',
  'docs/contracts/data',
  'docs/contracts/integrations',
  'docs/contracts/configuration',
  'docs/decisions',
  'docs/decisions/adr',
  'docs/features',
  'docs/guides',
  'docs/guides/deployment',
  'docs/knowledge',
  'docs/knowledge/canon',
  'docs/knowledge/whitepapers',
  'docs/knowledge/industry',
  'docs/knowledge/external',
  'docs/compounds',
  'docs/brainstorms',
  'docs/templates',
];
const SKELETON_ROOT_FILES = [
  {
    path: 'kanban/README.md',
    frontmatter: {
      id: 'kanban-index',
      type: 'generic',
      title: 'Kanban Index',
      status: 'active',
      summary_landing: 'Planning workspace for execution flow and strategy.',
      summary_developers: 'Track roadmap, work, and temporary routing notes here.',
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    },
    body: '# Kanban Workspace\n\nOperational planning plane for this repo.',
  },
  {
    path: 'kanban/architecture-reference.md',
    frontmatter: {
      id: 'architecture-reference',
      type: 'architecture-reference',
      title: 'Architecture Reference',
      status: 'draft',
      summary_landing: 'Architecture source of truth and boundaries.',
      summary_developers: 'Populate architectural contracts and system boundaries.',
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    },
    body: '# Architecture Reference\n\nThis file is intentionally left as the root architecture seed.',
  },
  {
    path: 'kanban/Strategy-Current.md',
    frontmatter: {
      id: 'strategy-current',
      type: 'strategy-current',
      title: 'Strategy Current',
      status: 'draft',
      summary_landing: 'Live execution sequencing for current cycle.',
      summary_developers: 'Update with What is now / next / blocked.',
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    },
    body: '# Strategy Current\n\nThis file is the live execution plan seed.',
  },
  {
    path: 'kanban/strategic-execution-spec.md',
    frontmatter: {
      id: 'strategic-execution-spec',
      type: 'strategic-execution-spec',
      title: 'Strategic Execution Spec',
      status: 'draft',
      summary_landing: 'Long-horizon positioning and execution framing.',
      summary_developers: 'Store long-range strategy as code-ready context.',
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    },
    body: '# Strategic Execution Spec\n\nThis file is the strategic direction seed.',
  },
  {
    path: 'docs/README.md',
    frontmatter: {
      id: 'docs-index',
      type: 'generic',
      title: 'Docs Index',
      status: 'active',
      summary_landing: 'Knowledge index for the repo.',
      summary_developers: 'Store stable reference and contracts here.',
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    },
    body: '# Docs Index\n\nKnowledge-plane documents, contracts, and prompts.',
  },
];

const STARTER_MARKER_PATH = '.kan/starter-template.json';
const PLUGINS_ROOT = '.kan/plugins';
const PLUGIN_REGISTRY_FILE = '.kan/plugin-registry.json';
const PLUGIN_TEMPLATES_DIR = path.resolve(PACKAGE_ROOT, 'templates', 'plugins');
const COMPOUND_ARTIFACT_DIR = 'docs/compounds';
const COMPOUND_BRAINSTORM_DIR = 'docs/brainstorms';
const COMPOUND_SYSTEM_PROMPT_FILE = path.join(COMPOUND_BRAINSTORM_DIR, 'system-prompts.md');
const WORKFLOW_STEPS = ['plan', 'work', 'review', 'compound'];
const COMMAND_TIMEOUT_MS = 120000;
const START_CAPABILITIES = [
  {
    id: 'init',
    category: 'bootstrap',
    command: 'kan init',
    description: 'Bootstrap starter docs, kanban layout, docs tree, and runtime config.',
    next: ['kan agent init', 'kan lint'],
  },
  {
    id: 'start',
    category: 'orchestration',
    command: 'kan start --json',
    description: 'Emit machine-readable capability and next-step context for agents.',
    next: ['kan lint --json', 'kan query .[] | ...'],
  },
  {
    id: 'lint',
    category: 'validation',
    command: 'kan lint',
    description: 'Validate schemas, references, and stage-flow conventions.',
    next: ['kan build --json', 'kan agent claim'],
  },
  {
    id: 'build',
    category: 'build',
    command: 'kan build',
    description: 'Compile validated markdown into machine-readable JSON artifacts.',
    next: ['kan health', 'kan query'],
  },
  {
    id: 'health',
    category: 'observability',
    command: 'kan health',
    description: 'Emit repository health summary and issue counts.',
    next: ['kan lint', 'kan build'],
  },
  {
    id: 'query',
    category: 'query',
    command: 'kan query',
    description: 'Run jq-like document queries for planning and selection.',
    next: ['kan query ".[] | select(.status == \"in-progress\")"'],
  },
  {
    id: 'evolve',
    category: 'workflow',
    command: 'kan evolve <target>',
    description: 'Advance documents through supported status transitions with conflict checks.',
    next: ['kan query .[] | select(.status == \"ready\")'],
  },
  {
    id: 'mv',
    category: 'workflow',
    command: 'kan mv <source> <destination>',
    description: 'Move docs or files with scope lock guard enforcement.',
    next: ['kan agent claim --scope <path>'],
  },
  {
    id: 'rm',
    category: 'workflow',
    command: 'kan rm <target>',
    description: 'Archive by default or delete with --hard.',
    next: ['kan evolve <id>', 'kan lint'],
  },
  {
    id: 'agent',
    category: 'coordination',
    command: 'kan agent status|init|claim|unclaim|guard|worktree|prune',
    description: 'Manage scope claims and enforce overlap for parallel agents.',
    next: ['kan agent claim --scope <scope> --agent <name>'],
  },
  {
    id: 'plugin',
    category: 'extensibility',
    command: 'kan plugin list|install',
    description: 'Install plugins and extend command surface.',
    next: ['kan plugin install compound-engineering'],
  },
  {
    id: 'loop',
    category: 'autonomy',
    command: 'kan loop [--stage plan|work|review|compound]',
    description: 'Run one stage or the full Plan→Work→Review→Compound flow.',
    next: ['kan loop --stage plan', 'kan loop --stage compound --auto'],
  },
];
const WORKFLOW_STEP_NEXT = {
  plan: 'work',
  work: 'review',
  review: 'compound',
  compound: null,
};

class ClassifiedError extends Error {
  constructor({ code, message, field, context, suggestedNext }) {
    super(message);
    this.name = 'ClassifiedError';
    this.code = code || 'cmd/failure';
    this.field = field || null;
    this.context = context || null;
    this.suggestedNext = Array.isArray(suggestedNext) ? suggestedNext : [];
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function requireNonEmptyString(value, fieldName, context = {}) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ClassifiedError({
      code: 'validation/required',
      message: `Required value is missing for '${fieldName}'.`,
      field: fieldName,
      context,
      suggestedNext: [`Provide ${fieldName} and retry.`],
    });
  }
  return value.trim();
}

function execWithTimeout(command, options = {}) {
  return execSync(command, {
    timeout: COMMAND_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...options,
  });
}

function isLikelyId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function toRelative(cwd, file) {
  return path.relative(cwd, file);
}

function collectArg(value, previous = []) {
  return previous.concat([value]);
}

function normalizePath(pathInput) {
  return String(pathInput || '').replace(/\\/g, '/').replace(/\/+$/, '');
}

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 80) || 'artifact';
}

function joinYamlLines(lines, next) {
  return `${lines.join('\n')}\n${next ? `${next}\n` : ''}`;
}

function isQuoted(value) {
  return typeof value === 'string' && /[\s:\[\]{}#>|]/.test(value);
}

function formatYamlScalar(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  const text = String(value);
  if (text.length === 0) {
    return '""';
  }
  if (isQuoted(text) || text.includes('"')) {
    return JSON.stringify(text);
  }
  return text;
}

function appendYamlRecord(lines, key, value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${pad}${key}: []`);
      return;
    }
    lines.push(`${pad}${key}:`);
    for (const entry of value) {
      if (entry === null || entry === undefined) {
        lines.push(`${pad}  - null`);
      } else if (Array.isArray(entry) || (typeof entry === 'object' && entry !== null)) {
        const nested = [];
        for (const [nestedKey, nestedValue] of Object.entries(entry)) {
          appendYamlRecord(nested, nestedKey, nestedValue, 4);
        }
        lines.push(`${pad}  -`);
        for (const entryLine of nested) {
          lines.push(`${pad}${entryLine}`);
        }
      } else {
        lines.push(`${pad}  - ${formatYamlScalar(entry)}`);
      }
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    const nestedLines = [];
    lines.push(`${pad}${key}:`);
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      appendYamlRecord(nestedLines, nestedKey, nestedValue, indent + 2);
    }
    for (const nestedLine of nestedLines) {
      lines.push(`${pad}${nestedLine}`);
    }
    return;
  }
  lines.push(`${pad}${key}: ${formatYamlScalar(value)}`);
}

function buildAgentsMarkdown(scopePath) {
  return `---
id: ${slugify(scopePath)}
type: generic
title: Agents Scope - ${scopePath}
status: active
---

# Agents

Scope boundary: \`${scopePath}\`

Session contract:

- Start with \`kan start --json\`.
- Use \`kan agent claim --scope ${scopePath}\` or claim by task when parallel edits are likely.
- Keep claims narrow and short-lived.
- If overlap risk appears, pause and re-claim with narrower scope.
`;
}

function frontmatterToYamlLines(frontmatter) {
  const keys = Object.keys(frontmatter);
  const lines = ['---'];
  for (const key of keys) {
    appendYamlRecord(lines, key, frontmatter[key], 0);
  }
  lines.push('---');
  return lines.join('\n');
}

async function writeIfMissingOrForced(targetPath, content, force) {
  if (!force && (await fileExists(targetPath))) {
    return false;
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, 'utf8');
  return true;
}

async function initializeSkeletonWorkspace(cwd, options = {}) {
  const force = Boolean(options.force);
  const created = {
    dirs: 0,
    agents: 0,
    files: 0,
  };
  const allDirs = [...SKELETON_KANBAN_DIRS, ...SKELETON_DOCS_DIRS];
  for (const folder of allDirs) {
    const folderPath = path.join(cwd, folder);
    await fs.mkdir(folderPath, { recursive: true });
    created.dirs += 1;
    const markerPath = path.join(folderPath, SKELETON_AGENTS_DOC);
    const shouldWrite = await writeIfMissingOrForced(markerPath, buildAgentsMarkdown(folder), force);
    if (shouldWrite) {
      created.agents += 1;
    }
  }

  for (const file of SKELETON_ROOT_FILES) {
    const filePath = path.join(cwd, file.path);
    const content = `${frontmatterToYamlLines(file.frontmatter)}\n\n${file.body}\n`;
    const wrote = await writeIfMissingOrForced(filePath, content, force);
    if (wrote) {
      created.files += 1;
    }
  }
  return created;
}

function toYamlFrontMatter(record) {
  const lines = [];
  for (const [key, value] of Object.entries(record)) {
    appendYamlRecord(lines, key, value, 0);
  }
  return `${lines.join('\n')}\n`;
}

function pluginTemplatePath(pluginName) {
  return path.join(PLUGIN_TEMPLATES_DIR, pluginName);
}

function pluginInstallPath(cwd, pluginName) {
  return path.resolve(cwd, PLUGINS_ROOT, pluginName);
}

function pluginRegistryPath(cwd) {
  return path.resolve(cwd, PLUGIN_REGISTRY_FILE);
}

async function readPluginRegistry(cwd) {
  const pathToRegistry = pluginRegistryPath(cwd);
  try {
    const raw = await fs.readFile(pathToRegistry, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new ClassifiedError({
        code: 'plugin-registry/parse',
        message: `Unable to parse plugin registry at ${pathToRegistry}.`,
        field: pathToRegistry,
        context: { reason: error.message },
        suggestedNext: [
          'Fix JSON syntax in .kan/plugin-registry.json before retrying.',
          'Delete the file and reinstall plugins to recreate registry.',
        ],
      });
    }

    const entries = Array.isArray(parsed?.installed) ? parsed.installed : [];
    if (!Array.isArray(entries)) {
      throw new ClassifiedError({
        code: 'plugin-registry/shape',
        message: `Invalid plugin registry shape at ${pathToRegistry}: expected "installed" array.`,
        field: `${pathToRegistry}#installed`,
        suggestedNext: ['Rewrite registry as { "installed": [] } and retry.'],
      });
    }

    return {
      path: pathToRegistry,
      installed: entries,
      updatedAt: parsed.updatedAt || new Date(0).toISOString(),
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        path: pathToRegistry,
        installed: [],
        updatedAt: new Date(0).toISOString(),
      };
    }
    if (error instanceof ClassifiedError) {
      throw error;
    }
    throw new ClassifiedError({
      code: 'plugin-registry/read',
      message: `Unable to read plugin registry: ${error.message}`,
      field: pathToRegistry,
      context: { reason: error.message },
      suggestedNext: ['Recreate plugin registry via plugin install flow.'],
    });
  }
}

async function writePluginRegistry(cwd, registry) {
  try {
    await fs.mkdir(path.dirname(pluginRegistryPath(cwd)), { recursive: true });
    const payload = {
      updatedAt: new Date().toISOString(),
      installed: registry.installed || [],
    };
    await fs.writeFile(pluginRegistryPath(cwd), JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    throw new ClassifiedError({
      code: 'plugin-registry/write',
      message: `Unable to write plugin registry at ${pluginRegistryPath(cwd)}.`,
      field: pluginRegistryPath(cwd),
      context: { reason: error.message },
      suggestedNext: ['Check write permissions for .kan and retry.'],
    });
  }
}

function isPluginInstalledState(registry, pluginName) {
  const normalized = normalizePluginName(pluginName);
  return registry.installed.some((entry) => normalizePluginName(entry?.name) === normalized);
}

function normalizePluginName(raw = '') {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, '-');
}

async function isPluginInstalled(cwd, pluginName) {
  const normalized = normalizePluginName(pluginName);
  const marker = path.resolve(pluginInstallPath(cwd, normalized), 'manifest.json');
  return fileExists(marker);
}

async function ensureDir(cwd, relativePath) {
  await fs.mkdir(path.resolve(cwd, relativePath), { recursive: true });
}

function commandForNextWorkflowStep(step, context = {}) {
  const next = WORKFLOW_STEP_NEXT[step];
  if (!next) {
    return null;
  }
  const initiative = context.initiative ? ` --initiative ${context.initiative}` : '';
  const scope = context.scope ? ` --scope ${context.scope}` : '';
  const auto = context.auto ? ' --auto' : '';
  return `kan loop --stage ${next}${initiative}${scope}${auto}`.trim();
}

function buildCompoundPayload(step, scope, initiative, options, source = 'cli') {
  const isAutoMode = Boolean(options.auto);
  const tags = Array.isArray(options.tag) ? [...options.tag] : [];
  if (isAutoMode) {
    tags.push('auto');
    tags.push('compound++');
  }
  const now = new Date().toISOString();
  const normalizedScope = normalizePath(scope || '');
  const safeId = `${step}-${slugify(initiative || normalizedScope || 'artifact')}-${now.replace(/[:.]/g, '-')}`;
  const notes = (options.note || []).filter((entry) => String(entry || '').trim());
  const evidence = (options.evidence || []).filter((entry) => String(entry || '').trim());
  const agent = String(
    options.agent || process.env.KAN_AGENT_ID || process.env.USER || process.env.USERNAME || 'unknown',
  ).trim();
  const status = options.status || 'captured';

  return {
    id: safeId,
    type: 'compound-loop-artifact',
    stage: step,
    source,
    created_at: now,
    initiative: initiative || '',
    scope: normalizedScope,
    agent,
    objective: options.objective || '',
    result: options.result || '',
    auto: isAutoMode,
    status,
    tags: [...new Set(tags)],
    notes,
    evidence,
    next_command: commandForNextWorkflowStep(step, {
      initiative,
      scope: normalizedScope,
    }),
  };
}

async function writeCompoundArtifact(cwd, payload) {
  await ensureDir(cwd, COMPOUND_ARTIFACT_DIR);
  const fileName = `${payload.id}.md`;
  const filePath = path.join(path.resolve(cwd, COMPOUND_ARTIFACT_DIR), fileName);
  const content = [
    '---',
    toYamlFrontMatter(payload),
    '---',
    '',
    `# ${payload.id}`,
    '',
    payload.objective ? `## Objective\n${payload.objective}` : '## Objective',
    payload.result ? `\n## Result\n${payload.result}` : '',
    payload.notes.length ? `\n## Notes\n${payload.notes.map((note) => `- ${note}`).join('\n')}` : '',
  ].join('\n');
  await fs.writeFile(filePath, content, 'utf8');
  return path.relative(cwd, filePath);
}

async function updateSystemPrompts(cwd, payload, options = {}) {
  if (!options.promote) {
    return null;
  }
  const filePath = path.resolve(cwd, COMPOUND_SYSTEM_PROMPT_FILE);
  await ensureDir(cwd, COMPOUND_BRAINSTORM_DIR);
  const exists = await fileExists(filePath);
  const header = exists
    ? ''
    : '# System Prompt Memory\n\nReusable prompts, patterns, and safeguards harvested from review/compound steps.\n\n';
  const entry = [
    `## ${payload.id}`,
    `- stage: ${payload.stage}`,
    `- initiative: ${payload.initiative || '<unknown>'}`,
    `- scope: ${payload.scope || '<unknown>'}`,
    `- recorded: ${payload.created_at}`,
    `- agent: ${payload.agent}`,
    '',
    payload.notes.length ? payload.notes.map((entry) => `- insight: ${entry}`).join('\n') : '',
    '',
  ]
    .filter(Boolean)
    .join('\n');
  const separator = exists ? '\n' : '';
  await fs.appendFile(filePath, `${header}${separator}${entry}\n`, 'utf8');
  return path.relative(cwd, filePath);
}

async function buildSkillArtifact(cwd, payload, options = {}) {
  if (!options.emitSkill) {
    return null;
  }
  const name = slugify(options.emitSkill === true ? payload.id : options.emitSkill);
  const normalizedName = name || payload.id;
  const targetDir = path.resolve(cwd, '.kan', 'skills');
  await ensureDir(cwd, '.kan/skills');
  const skillPath = path.join(targetDir, `${normalizedName}.md`);
  const exists = await fileExists(skillPath);
  if (exists && !options.forceSkill) {
    return path.relative(cwd, skillPath);
  }
  const text = [
    `# ${normalizedName}`,
    `id: ${normalizedName}`,
    `origin: ${payload.id}`,
    '',
    `## Trigger`,
    payload.objective || payload.result || 'No objective.',
    '',
    `## Rule`,
    payload.next_command || 'No suggestion.',
    '',
    `## Rationale`,
    (payload.notes || ['Captured from loop artifacts.']).join('\n'),
    '',
  ].join('\n');
  await fs.writeFile(skillPath, text, 'utf8');
  return path.relative(cwd, skillPath);
}

async function ensureCompoundRoots(cwd) {
  await ensureDir(cwd, COMPOUND_ARTIFACT_DIR);
  await ensureDir(cwd, COMPOUND_BRAINSTORM_DIR);
}

function normalizeScope(cwd, scopeInput) {
  const raw = String(scopeInput || '').trim();
  if (!raw || raw === '.') {
    return '';
  }
  const absolute = path.resolve(cwd, raw);
  const relative = normalizePath(path.relative(cwd, absolute));
  if (!relative || relative === '.' ) {
    return '';
  }
  if (relative.startsWith('..')) {
    throw new ClassifiedError({
      code: 'agent/scope-outside-repo',
      message: `Scope outside repository is not allowed: ${scopeInput}`,
      field: 'scope',
      context: { scope: raw },
      suggestedNext: ['Use scopes limited to this repository, such as kanban/ or docs/.'],
    });
  }
  return relative;
}

function scopesOverlap(scopeA, scopeB) {
  if (!scopeA || !scopeB) {
    return true;
  }
  return (
    scopeA === scopeB ||
    scopeA.startsWith(`${scopeB}/`) ||
    scopeB.startsWith(`${scopeA}/`)
  );
}

function fileMatchesScope(fileRel, scope) {
  if (!scope) {
    return true;
  }
  const normalizedFile = normalizePath(fileRel);
  return normalizedFile === scope || normalizedFile.startsWith(`${scope}/`);
}

function isExpiredClaim(claim, now = Date.now()) {
  if (!claim || !claim.expiresAt) {
    return false;
  }
  const expires = Date.parse(claim.expiresAt);
  return Number.isNaN(expires) ? false : expires <= now;
}

async function readAgentClaims(cwd) {
  const filePath = path.resolve(cwd, AGENT_CLAIMS_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new ClassifiedError({
        code: 'agent-claims/parse',
        message: `Unable to parse agent claims file at ${filePath}.`,
        field: filePath,
        context: { reason: error.message },
        suggestedNext: [
          'Fix JSON syntax in .kan/agent-claims.json.',
          'Delete the file and retry after re-claiming scopes.',
        ],
      });
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ClassifiedError({
        code: 'agent-claims/shape',
        message: 'Agent claims file shape is invalid.',
        field: filePath,
        suggestedNext: ['Use { "version": 1, "claims": [], "updatedAt": "..." } as root shape.'],
      });
    }

    if (parsed.version !== undefined && typeof parsed.version !== 'number') {
      throw new ClassifiedError({
        code: 'agent-claims/version',
        message: `Invalid claims file version at ${filePath}.`,
        field: `${filePath}#version`,
        context: { value: parsed.version },
        suggestedNext: ['Use a numeric version and retry.'],
      });
    }

    if (!Array.isArray(parsed.claims)) {
      throw new ClassifiedError({
        code: 'agent-claims/shape',
        message: `Invalid claims list in ${filePath}; expected "claims" array.`,
        field: `${filePath}#claims`,
        suggestedNext: ['Rewrite the file with a valid claims array.'],
      });
    }

    const claims = parsed.claims;
    return {
      version: parsed.version || 1,
      claims,
      updatedAt: parsed.updatedAt || new Date(0).toISOString(),
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { version: 1, claims: [], updatedAt: new Date(0).toISOString() };
    }
    if (error instanceof ClassifiedError) {
      throw error;
    }
    throw new ClassifiedError({
      code: 'agent-claims/read',
      message: `Unable to read claim file ${AGENT_CLAIMS_FILE}.`,
      field: AGENT_CLAIMS_FILE,
      context: { reason: error.message },
      suggestedNext: ['Check file permissions for .kan/ and retry.'],
    });
  }
}

async function writeAgentClaims(cwd, state) {
  const filePath = path.resolve(cwd, AGENT_CLAIMS_FILE);
  const payload = buildAgentClaimsState(state);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    throw new ClassifiedError({
      code: 'agent-claims/write',
      message: `Unable to write agent claims file at ${filePath}.`,
      field: filePath,
      context: { reason: error.message },
      suggestedNext: ['Check write permissions for .kan and retry.'],
    });
  }
}

function buildAgentClaimsState(state = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new ClassifiedError({
      code: 'agent-claims/shape',
      message: 'Agent claims state shape is invalid.',
      field: AGENT_CLAIMS_FILE,
      suggestedNext: ['Use {"version":1,"claims":[]} as the canonical claims shape.'],
    });
  }

  const sourceClaims = Array.isArray(state.claims) ? state.claims : [];
  const claims = [];
  const seenAgents = new Set();

  for (const [index, entry] of sourceClaims.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ClassifiedError({
        code: 'agent-claims/claim-shape',
        message: `Invalid claim record at index ${index}.`,
        field: `${AGENT_CLAIMS_FILE}#claims[${index}]`,
        context: { index },
        suggestedNext: ['Repair malformed claim records before retrying.'],
      });
    }

    const normalizedAgent = String(entry.agent || '').trim();
    if (!normalizedAgent) {
      throw new ClassifiedError({
        code: 'agent-claims/agent-required',
        message: `Claim record missing agent at index ${index}.`,
        field: `${AGENT_CLAIMS_FILE}#claims[${index}].agent`,
        suggestedNext: ['Set a non-empty agent name for every claim.'],
      });
    }
    if (seenAgents.has(normalizedAgent)) {
      throw new ClassifiedError({
        code: 'agent-claims/agent-duplicate',
        message: `Duplicate claim entry for agent '${normalizedAgent}'.`,
        field: `${AGENT_CLAIMS_FILE}#claims[${index}].agent`,
        context: { agent: normalizedAgent },
        suggestedNext: ['Keep one claim record per agent.'],
      });
    }
    seenAgents.add(normalizedAgent);

    if (!Array.isArray(entry.scopes) || entry.scopes.length === 0) {
      throw new ClassifiedError({
        code: 'agent-claims/scopes-required',
        message: `Claim for '${normalizedAgent}' requires at least one scope.`,
        field: `${AGENT_CLAIMS_FILE}#claims[${index}].scopes`,
        context: { agent: normalizedAgent },
        suggestedNext: ['Provide one or more scope paths when creating claims.'],
      });
    }

    const scopes = [];
    const seenScopes = new Set();
    for (const scope of entry.scopes) {
      const normalizedScope = String(scope || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
      if (!normalizedScope) {
        throw new ClassifiedError({
          code: 'agent-claims/scope-required',
          message: `Empty scope in claim for ${normalizedAgent}.`,
          field: `${AGENT_CLAIMS_FILE}#claims[${index}].scopes`,
          context: { agent: normalizedAgent },
          suggestedNext: ['Remove empty scopes from the claim record.'],
        });
      }
      if (!seenScopes.has(normalizedScope)) {
        seenScopes.add(normalizedScope);
        scopes.push(normalizedScope);
      }
    }

    const claimedAt = String(entry.claimedAt || '').trim();
    if (!claimedAt || Number.isNaN(Date.parse(claimedAt))) {
      throw new ClassifiedError({
        code: 'agent-claims/claimed-at',
        message: `Claim for '${normalizedAgent}' requires a valid claimedAt timestamp.`,
        field: `${AGENT_CLAIMS_FILE}#claims[${index}].claimedAt`,
        context: { value: entry.claimedAt },
        suggestedNext: ['Set claimedAt with an ISO timestamp.'],
      });
    }

    const updatedAt = String(entry.updatedAt || '').trim();
    if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
      throw new ClassifiedError({
        code: 'agent-claims/updated-at',
        message: `Claim for '${normalizedAgent}' requires a valid updatedAt timestamp.`,
        field: `${AGENT_CLAIMS_FILE}#claims[${index}].updatedAt`,
        context: { value: entry.updatedAt },
        suggestedNext: ['Set updatedAt with an ISO timestamp.'],
      });
    }

    if (entry.expiresAt !== null && entry.expiresAt !== undefined) {
      const expiresAt = String(entry.expiresAt || '').trim();
      if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) {
        throw new ClassifiedError({
          code: 'agent-claims/expires-at',
          message: `Claim for '${normalizedAgent}' has invalid expiresAt.`,
          field: `${AGENT_CLAIMS_FILE}#claims[${index}].expiresAt`,
          context: { value: entry.expiresAt },
          suggestedNext: ['Set expiresAt with an ISO timestamp or remove it from the claim.'],
        });
      }
    }

    const note = entry.note === undefined ? '' : String(entry.note);
    const updatedBy = String(entry.updatedBy || normalizedAgent).trim();
    claims.push({
      agent: normalizedAgent,
      scopes,
      note,
      claimedAt,
      expiresAt: entry.expiresAt === null || entry.expiresAt === undefined ? null : String(entry.expiresAt).trim(),
      updatedBy: updatedBy || normalizedAgent,
      updatedAt,
    });
  }

  const next = { version: 1, claims, updatedAt: new Date().toISOString() };
  return next;
}

function pruneExpiredClaims(state) {
  const now = Date.now();
  return {
    ...state,
    claims: state.claims.filter((claim) => !isExpiredClaim(claim, now)),
  };
}

function normalizeClaimsInputScopes(cwd, scopes = []) {
  return [...new Set(scopes.map((scope) => normalizeScope(cwd, scope)).filter((scope) => scope !== undefined))];
}

function normalizeAgentNameWithFallback(opts = {}) {
  return String(opts.agent || process.env.KAN_AGENT_ID || process.env.USER || process.env.USERNAME || '').trim();
}

function buildScopeConflictPayload(agent, requestedScopes, conflicts) {
  const conflictErrors = conflicts.map((conflict) => ({
    severity: 'error',
    file: `agent-claims:${conflict.file}`,
    ruleId: 'agent/claim-conflict',
    message: `Claim conflict on ${conflict.file}: scope ${conflict.requestedScope} is owned by ${conflict.claimedBy}`,
    suggestedNext: [
      `Release ${conflict.requestedScope} with: kan agent unclaim --agent ${conflict.claimedBy} --scope ${conflict.requestedScope}`,
      `Request transfer by direct coordination and retry with --force`,
      'Run `kan agent guard` to verify current overlap status',
    ],
  }));

  return {
    success: false,
    agent,
    requestedScopes,
    conflicts,
    errors: conflictErrors,
    errorCount: conflictErrors.length,
  };
}

async function checkClaimConflictsForPaths(cwd, opts, paths, options = {}) {
  const requireAgent = Boolean(options.requireAgent);
  const agent = normalizeAgentNameWithFallback(opts);
  const requested = paths.map((candidate) => normalizeScope(cwd, candidate)).filter(Boolean);
  if (!requested.length) {
    return null;
  }
  const state = pruneExpiredClaims(buildAgentClaimsState(await readAgentClaims(cwd)));
  const activeClaims = state.claims.filter((claim) => claim.agent !== agent);

  if (activeClaims.length === 0) {
    return null;
  }

  if (!agent && !opts.force && requireAgent) {
    return {
      success: false,
      agent: null,
      requestedScopes: requested,
      conflicts: [],
      errors: [
        {
          file: 'agent-claims',
          severity: 'error',
          ruleId: 'agent/agent-id-required',
          message: 'Scope locking is active, but this command has no effective agent id.',
          suggestedNext: [
            'Run again with --agent <name> to apply scope-aware locking.',
            'Or temporarily override checks with --force when safe and coordinated.',
          ],
        },
      ],
      errorCount: 1,
    };
  }

  if (!agent) {
    return null;
  }

  const conflicts = [];
  const seen = new Set();

  for (const requestedScope of requested) {
    for (const claim of activeClaims) {
      for (const claimedScope of claim.scopes || []) {
        const normalizedClaimedScope = normalizePath(claimedScope);
        if (!scopesOverlap(requestedScope, normalizedClaimedScope)) {
          continue;
        }
        const key = `${requestedScope}::${claim.agent}::${normalizedClaimedScope}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        conflicts.push({
          file: requestedScope,
          requestedScope,
          claimedBy: claim.agent,
          claimScope: normalizedClaimedScope,
        });
      }
    }
  }

  if (conflicts.length === 0) {
    return null;
  }
  return buildScopeConflictPayload(agent, requested, conflicts);
}

function listGitStatusFiles(cwd) {
  const output = execWithTimeout('git status --porcelain=v1', {
    cwd,
  });
  const lines = output.split('\n').filter(Boolean);
  const files = new Set();
  for (const line of lines) {
    const fileField = line.slice(3).trim();
    if (!fileField) {
      continue;
    }
    const file = fileField.includes(' -> ') ? fileField.split(' -> ')[1].trim() : fileField;
    if (file) {
      files.add(normalizePath(file));
    }
  }
  return [...files];
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function commandFailurePayload(message, ruleId = 'cmd/failure', suggestedNext = [], context = {}) {
  return {
    success: false,
    errors: [
      {
        file: 'kan',
        message: String(message),
        severity: 'error',
        ruleId,
        suggestedNext:
          suggestedNext.length > 0
            ? suggestedNext
            : ['Run `kan --help` to review available commands.'],
        context: context || null,
      },
    ],
  };
}

function commandFailurePayloadFromError(error, fallbackRuleId = 'cmd/failure') {
  if (error instanceof ClassifiedError) {
    return commandFailurePayload(
      error.message,
      error.code,
      error.suggestedNext || [],
      error.context,
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return commandFailurePayload(message, fallbackRuleId);
}

function printLine(...args) {
  process.stdout.write(`${args.join(' ')}\n`);
}

function shellArg(value) {
  return JSON.stringify(String(value));
}

function normalizeAgentName(raw = '') {
  const normalized = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-');
  return normalized.replace(/^-+|-+$/g, '') || 'agent';
}

function escapeJsonLike(value) {
  if (typeof value !== 'string') {
    return String(value);
  }
  const needsQuote = /[\s"'`]/.test(value);
  return needsQuote ? JSON.stringify(value) : value;
}

function suggestedNextForIssue(ruleId, context = {}) {
  switch (ruleId) {
    case 'frontmatter/parse':
      return ['Open the file and fix YAML frontmatter syntax before re-running `kan lint`.'];
    case 'schema/valid':
      return [
        `Set required frontmatter fields for ${context.type || 'document'} and remove unexpected values`,
        'Run `kan lint --json` after applying corrections.',
      ];
    case 'id/required':
      return ['Add a stable `id` field in frontmatter.'];
    case 'id/unique':
      return [
        'Rename one document while keeping the canonical id stable',
        'If this was moved, prefer `kan mv <old-path> <new-path>`',
      ];
    case 'collection/missing':
      return ['Create the missing collection path and add expected documents.'];
    case 'collection/type-mismatch':
      return ['Point the collection path at an existing file or directory.'];
    case 'workflow/blocked':
      return ['Add `blocking_reason` for blocked documents.'];
    case 'workflow/review':
      return ['Add `reviewer` before leaving review stage.'];
    case 'initiative/problem-required':
      return ['Add at least one `problem_statements` entry.'];
    case 'initiative/no-owner':
      return ['Assign `owner` to indicate execution ownership.'];
    case 'initiative/theme-required':
      return ['Add at least one `theme_ids` entry.'];
    case 'initiative/area-required':
      return ['Set `area_id` for this initiative.'];
    case 'slice/initiative-required':
      return ['Set `initiative_id` for active slice work items.'];
    case 'slice/acceptance-required':
      return ['Add one or more `acceptance_criteria` before moving past idea/analysis.'];
    case 'slice/gears-required':
      return ['Add at least one `gears_requirements` item with `shall` + requirements language.'];
    case 'ref/valid':
      return ['Fix the id reference and rerun validation.'];
    case 'ref/path-valid':
      return ['Point `related_docs` to an existing repository path.'];
    case 'ref/related':
      return ['Update or remove unresolved related references.'];
    case 'task/agent-workspace':
      return ['Add `agent_workspace` (path prefix) to task docs that are meant for concurrent agent execution.'];
    case 'query/parse':
      return [
        'Use a supported jq-style expression such as `.[] | select(.status == "in-progress")`',
        'Combine conditions with `and`/`or`, for example `.[] | select(.status == "in-progress" and .type == "slice")`',
        'Use --where with the same style, such as `--where status==in-progress and type==slice`',
        'You can also run `... | sort_by(.status)` or `... | length`.',
      ];
    case 'query/execute':
      return [
        'Re-run query with a simpler jq-style expression.',
        'Verify document fields exist before projecting: `.[] | select(.status) | .id`.',
        'Run without `--json` first to inspect result shape quickly.',
      ];
    default:
      return [];
  }
}

function suggestedNextForClaimConflict(conflict) {
  return [
    `Release the conflicting scope owned by ${conflict?.agent || 'another agent'} with \`kan agent unclaim --agent ${conflict?.agent || '<agent>'} --scope ${conflict?.fileScope}\``,
    'Retry with --force only when overlap is intentional and coordinated.',
    'Run `kan agent guard` to check overlap against your current working tree.',
  ];
}

const AGENT_WORKTREE_BOOTSTRAP_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $(basename "$0") <agent-name> [branch] [path]" >&2
  exit 1
fi

REPO_ROOT="\${KAN_REPO_ROOT:-$(git rev-parse --show-toplevel)}"
AGENT_NAME="$1"
BRANCH="\${2:-agent/\${AGENT_NAME}}"
WORKTREE_PATH="\${3:-$(dirname "\${REPO_ROOT}")/agent-worktrees/\${AGENT_NAME}}"

mkdir -p "$(dirname "$WORKTREE_PATH")"

if git -C "$REPO_ROOT" rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null 2>&1; then
  git -C "$REPO_ROOT" worktree add "$WORKTREE_PATH" "$BRANCH"
else
  git -C "$REPO_ROOT" worktree add -b "$BRANCH" "$WORKTREE_PATH"
fi

echo "$WORKTREE_PATH"
`;

const AGENT_SCOPE_GUARD_WORKFLOW = `name: Kanban Agent Scope Guard

on:
  pull_request:

jobs:
  kan-agent-guard:
    name: Enforce workspace claims
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: npm install
      - name: Enforce agent scope guard
        env:
          KAN_AGENT_ID: github-actions
        run: npx kan agent guard --agent github-actions --json
`;

const AGENT_COMPOUND_AUTOPILOT_WORKFLOW = `name: Kan Compound Autopilot

on:
  pull_request:
    types: [closed]

jobs:
  kan-compound-autopilot:
    if: github.event.pull_request.merged == true
    name: Generate compound artifacts after merge
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: npm install
      - name: Auto compound pass
        run: |
          if [ -f .kan/plugin-registry.json ] && grep -q '"compound-engineering"' .kan/plugin-registry.json; then
            npx kan loop --stage compound --auto --scope kanban --objective "Post-merge compound reflection" --result "Automatic PR reflection snapshot"
          else
            echo "Skipping compound autopilot: compound-engineering plugin not installed."
          fi
`;

function addIssue(issues, severity, file, ruleId, message, context = {}) {
  issues.push({
    severity,
    file,
    ruleId,
    message,
    suggestedNext: suggestedNextForIssue(ruleId, context),
  });
}

function printErrors(result, jsonMode = false) {
  if (jsonMode) {
    return printJson(result);
  }
  for (const item of result.errors) {
    printLine(`[${item.severity.toUpperCase()}] ${item.file} (${item.ruleId}): ${item.message}`);
    if (item.suggestedNext?.length) {
      for (const suggestion of item.suggestedNext) {
        printLine(`  - suggestedNext: ${suggestion}`);
      }
    }
  }
  for (const item of result.warnings) {
    printLine(`[WARNING] ${item.file} (${item.ruleId}): ${item.message}`);
    if (item.suggestedNext?.length) {
      for (const suggestion of item.suggestedNext) {
        printLine(`  - suggestedNext: ${suggestion}`);
      }
    }
  }
}

function normalizeConfig(raw = {}) {
  const collections = {};
  const configuredCollections = raw.collections;
  if (!configuredCollections || typeof configuredCollections !== 'object' || Array.isArray(configuredCollections)) {
    throw new ClassifiedError({
      code: 'config/collections',
      message: 'Invalid `collections` object in configuration.',
      field: 'collections',
      suggestedNext: [
        'Set "collections" to an object where each entry includes a path and explicit type.',
        'Use the starter kan.config.json as the required shape baseline.',
      ],
    });
  }

  if (!raw.kanbanRoot || !raw.docsRoot) {
    throw new ClassifiedError({
      code: 'config/schema',
      message: '`kanbanRoot` and `docsRoot` are required in configuration.',
      field: 'kanbanRoot/docsRoot',
      suggestedNext: ['Update kan.config.json to include explicit kanbanRoot and docsRoot fields.'],
    });
  }

  const configured = raw.collections || {};
  for (const [name, rawEntry] of Object.entries(configured)) {
    const normalizedName = String(name).trim();
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      throw new ClassifiedError({
        code: 'config/collection',
        message: `Invalid collection entry shape for "${normalizedName}".`,
        field: `collections.${normalizedName}`,
        context: { collection: normalizedName },
        suggestedNext: [
          `Use { "path": "path/to/documents", "type": "initiative" } for collection "${normalizedName}".`,
          'Use explicit collection entries with both path and type.',
        ],
      });
    }
    const explicitPath = String(rawEntry.path || '').trim();
    const explicitType = String(rawEntry.type || '').trim();
    if (!explicitPath || !explicitType) {
      throw new ClassifiedError({
        code: 'config/collection',
        message: `Collection "${normalizedName}" must define both path and type.`,
        field: `collections.${normalizedName}`,
        context: { collection: normalizedName },
        suggestedNext: [
          `Use { "path": "path/to/${normalizedName}", "type": "${inferTypeFromCollectionName(normalizedName)}" }`,
          'Use explicit collection entries only.',
        ],
      });
    }

    collections[normalizedName] = {
      path: explicitPath,
      type: explicitType,
    };
  }
  return {
    kanbanRoot: String(raw.kanbanRoot || '').trim(),
    docsRoot: String(raw.docsRoot || '').trim(),
    outputDir: raw.outputDir || DEFAULT_OUTPUT,
    collections,
    evolution: Array.isArray(raw.evolution) && raw.evolution.length ? raw.evolution : STAGE_ORDER,
    cleanup: raw.cleanup || { staleDays: 90 },
  };
}

async function readConfig(cwd, configPath) {
  const candidatePath = path.resolve(cwd, configPath || DEFAULT_CONFIG_NAME);
  const exists = await fileExists(candidatePath);
  if (!exists) {
    throw new ClassifiedError({
      code: 'config/missing',
      message: `No configuration file found at ${candidatePath}.`,
      field: 'config',
      suggestedNext: [
        `Create ${candidatePath} from the starter template or copy a known-working configuration file.`,
      ],
    });
  }
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(candidatePath, 'utf8'));
  } catch (error) {
    throw new ClassifiedError({
      code: 'config/parse',
      message: `Invalid JSON in configuration file ${candidatePath}.`,
      field: candidatePath,
      context: { reason: error.message },
      suggestedNext: ['Fix invalid JSON syntax and retry.'],
    });
  }
  return {
    path: candidatePath,
    ...normalizeConfig(raw),
  };
}

function buildTemplatePath(templateName) {
  const templatesDir = path.resolve(PACKAGE_ROOT, 'templates', templateName);
  return {
    base: templatesDir,
  };
}

async function copyDirectory(source, target, { force = false } = {}) {
  let sourceStat;
  try {
    sourceStat = await fs.stat(source);
  } catch (error) {
    throw new ClassifiedError({
      code: 'fs/source-missing',
      message: `Source path does not exist: ${source}`,
      field: source,
      context: { reason: error.message },
      suggestedNext: ['Verify the source path and retry.'],
    });
  }
  if (!sourceStat.isDirectory()) {
    throw new ClassifiedError({
      code: 'fs/source-invalid',
      message: `Source path is not a directory: ${source}`,
      field: source,
      suggestedNext: ['Provide a template directory as source and retry.'],
    });
  }

  if (!force) {
    await assertNoCopyConflicts(source, target);
  } else {
    await fs.rm(target, { recursive: true, force: true });
  }

  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath, { force });
      continue;
    }
    if (!force && (await fileExists(targetPath))) {
      throw new ClassifiedError({
        code: 'fs/copy-conflict',
        message: `Destination file already exists: ${targetPath}`,
        field: targetPath,
        suggestedNext: ['Re-run with --force to overwrite.', 'Choose a clean destination for init/plugin install.'],
      });
    }
    await fs.copyFile(sourcePath, targetPath);
  }
}

async function assertNoCopyConflicts(source, target) {
  const sourceEntries = await fs.readdir(source, { withFileTypes: true });
  for (const sourceEntry of sourceEntries) {
    const sourcePath = path.join(source, sourceEntry.name);
    const targetPath = path.join(target, sourceEntry.name);

    if (await fileExists(targetPath)) {
      throw new ClassifiedError({
        code: 'fs/copy-conflict',
        message: `Destination path already exists: ${targetPath}`,
        field: targetPath,
        suggestedNext: ['Re-run with --force to overwrite.', 'Pick a clean destination and retry.'],
      });
    }

    if (sourceEntry.isDirectory()) {
      await assertNoCopyConflicts(sourcePath, targetPath);
    }
  }
}

async function runInit({
  template = 'starter',
  root = '.',
  force = false,
  skeleton = false,
}) {
  const cwd = path.resolve(root);
  if (skeleton) {
    const created = await initializeSkeletonWorkspace(cwd, { force });
    const target = [
      `Initialized skeleton at ${cwd}.`,
      `Created ${created.dirs} directories, ${created.agents} agents.md placeholders, ${created.files} strategy files.`,
    ];
    if (created.files === 0) {
      target.push('Strategy files already existed.');
    }
    printLine(target.join(' '));
    return;
  }

  const templatePath = buildTemplatePath(template).base;
  if (!(await fileExists(templatePath))) {
    throw new ClassifiedError({
      code: 'init/template-missing',
      message: `Template not found: ${templatePath}.`,
      field: templatePath,
      suggestedNext: ['Run with a valid --template name from templates/.'],
    });
  }

  const templateConfigPath = path.join(templatePath, DEFAULT_CONFIG_NAME);
  if (!(await fileExists(templateConfigPath))) {
    throw new ClassifiedError({
      code: 'init/template-invalid',
      message: `Template is missing required config file: ${templateConfigPath}.`,
      field: templateConfigPath,
      suggestedNext: ['Restore the starter template files from a clean source.'],
    });
  }

  await copyDirectory(templatePath, cwd, { force });
  const configPath = path.join(cwd, DEFAULT_CONFIG_NAME);
  if (!(await fileExists(configPath))) {
    throw new ClassifiedError({
      code: 'init/target-config-missing',
      message: `Template copy did not create required config at ${configPath}.`,
      field: configPath,
      suggestedNext: ['Retry init in a clean directory.'],
    });
  }

  await readConfig(cwd, DEFAULT_CONFIG_NAME);

  const markerPath = path.join(cwd, STARTER_MARKER_PATH);
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(
    markerPath,
    JSON.stringify(
      {
        source: 'kan init',
        template,
        initializedAt: new Date().toISOString(),
        packageVersion: version,
      },
      null,
      2,
    ),
    'utf8',
  );

  printLine(`Initialized kanban starter at ${cwd}`);
}

async function loadCollection(cwd, collectionName, collection, issues, parsedConfig) {
  const absoluteCollectionPath = path.resolve(cwd, collection.path);
  const exists = await fileExists(absoluteCollectionPath);
  if (!exists) {
    addIssue(issues, 'warning', collection.path, 'collection/missing', `Collection folder missing: ${collection.path}`);
    return [];
  }

  const stat = await fs.stat(absoluteCollectionPath);
  const collectionFiles = [];

  if (stat.isDirectory()) {
    const files = await fg(['**/*.md', '**/*.mdx'], {
      cwd: absoluteCollectionPath,
      absolute: true,
      onlyFiles: true,
      dot: false,
      suppressErrors: true,
    });
    collectionFiles.push(...files);
  } else if (stat.isFile()) {
    collectionFiles.push(absoluteCollectionPath);
  } else {
    addIssue(
      issues,
      'warning',
      collection.path,
      'collection/type-mismatch',
      `Collection path is not a file or directory: ${collection.path}`,
    );
    return [];
  }

  const docs = [];
  for (const absoluteFile of collectionFiles) {
    const raw = await fs.readFile(absoluteFile, 'utf8');
    let parsed;
    try {
      parsed = matter(raw);
    } catch (error) {
      addIssue(issues, 'error', absoluteFile, 'frontmatter/parse', `Unable to parse frontmatter: ${error.message}`);
      continue;
    }

    const data = parsed.data || {};
    const inferredType = data.type || collection.type || inferTypeFromCollectionName(collectionName);
    docs.push({
      file: absoluteFile,
      type: inferredType,
      raw: raw,
      content: parsed.content,
      collection: collectionName,
      rel: toRelative(cwd, absoluteFile),
      data,
    });
  }
  return docs;
}

async function loadAllDocs(cwd, config, commandOpts = {}, allIssues = []) {
  const allDocs = [];
  for (const [collectionName, collection] of Object.entries(config.collections)) {
    const collectionDocs = await loadCollection(cwd, collectionName, collection, allIssues);
    allDocs.push(...collectionDocs);
  }
  return allDocs;
}

function statusProgressionForType(config, docType) {
  const configured = Array.isArray(config.evolution) ? config.evolution.filter(Boolean).map((value) => String(value).trim()) : [];
  if (configured.length && configured.every((value) => STAGE_ORDER.includes(value))) {
    return configured;
  }
  if (docType === 'slice') {
    return SLICE_STATUS_FLOW;
  }
  if (docType === 'initiative') {
    return WORKFLOW_STATUSES;
  }
  if (docType === 'architecture-reference') {
    return STRATEGY_STATUS_FLOW;
  }
  if (docType === 'strategy-current' || docType === 'strategic-execution-spec') {
    return STRATEGY_STATUS_FLOW;
  }
  return STAGE_ORDER;
}

function withStatusSuggestions(order, status) {
  const index = order.indexOf(status);
  if (index === -1 || index + 1 >= order.length) {
    return [];
  }
  return order.slice(index + 1).map((next) => `kan evolve --to ${next} <id>`);
}

function toQueryRecord(doc) {
  return {
    ...doc.data,
    id: doc.data?.id,
    type: doc.type,
    collection: doc.collection,
    file: doc.rel,
    _type: doc.type,
    _collection: doc.collection,
  };
}

function parseArraySlice(rawPath, rawSelector) {
  const trimmed = String(rawSelector || '').trim();
  if (!trimmed.includes(':')) {
    const validIndex = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
    if (Number.isNaN(validIndex)) {
      throw new ClassifiedError({
        code: 'query/parse',
        message: `Unsupported array index in query: ${rawPath}`,
        field: 'query',
        context: { query: rawPath, selector: rawSelector },
        suggestedNext: ['Use a numeric index, for example .records[0].'],
      });
    }
    return { arrayIndex: validIndex };
  }

  const [rawStart, rawEnd, ...rest] = trimmed.split(':');
  if (rest.length > 0) {
    throw new ClassifiedError({
      code: 'query/parse',
      message: `Unsupported array slice in query: ${rawPath}`,
      field: 'query',
      context: { query: rawPath, selector: rawSelector },
      suggestedNext: ['Use a single `:` for simple ranges: .items[1:4], .items[:4], .items[3:].'],
    });
  }

  const parseBoundary = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return undefined;
    }
    const numeric = Number(normalized);
    if (!Number.isInteger(numeric) || numeric < 0) {
      throw new ClassifiedError({
        code: 'query/parse',
        message: `Unsupported array slice boundary in query: ${rawPath}`,
        field: 'query',
        context: { query: rawPath, selector: rawSelector },
        suggestedNext: ['Use zero-based integer boundaries, for example .items[2:5] or .items[:5]'],
      });
    }
    return numeric;
  };

  const start = parseBoundary(rawStart);
  const end = parseBoundary(rawEnd);
  if (start !== undefined && end !== undefined && start >= end) {
    throw new ClassifiedError({
      code: 'query/parse',
      message: `Invalid array slice in query: start (${start}) must be less than end (${end})`,
      field: 'query',
      context: { query: rawPath, selector: rawSelector },
      suggestedNext: [
        'Use start < end when constructing ranges, for example .items[0:4].',
        'Use .items[] when you need the full list.',
      ],
    });
  }

  return { slice: { start, end } };
}

function parseQueryPath(rawPath) {
  const normalized = String(rawPath || '').trim();
  if (!normalized.startsWith('.')) {
    return null;
  }
  const body = normalized.slice(1);
  if (!body) {
    return [];
  }

  const segments = [];
  let index = 0;
  while (index < body.length) {
    if (body[index] === '[') {
      const close = body.indexOf(']', index + 1);
      if (close < 0) {
        throw new ClassifiedError({
          code: 'query/parse',
          message: `Unsupported array syntax in query: ${rawPath}`,
          field: 'query',
          context: { query: rawPath },
          suggestedNext: ['Close your bracket in expressions such as .items[0] or .items[1:3].'],
        });
      }
      if (close === index + 1) {
        segments.push({ type: 'root', wildcard: true });
        index = close + 1;
        if (body[index] === '.') {
          index += 1;
        }
        continue;
      }

      const selector = body.slice(index + 1, close);
      const normalizedSelector = selector.trim();
      if (normalizedSelector === '*') {
        segments.push({ type: 'root', wildcard: true });
      } else {
        const parsedSelector = parseArraySlice(rawPath, selector);
        segments.push({
          type: 'root',
          arrayIndex: parsedSelector.arrayIndex,
          slice: parsedSelector.slice,
        });
      }
      index = close + 1;
      if (body[index] === '.') {
        index += 1;
      }
      continue;
    }

    let start = index;
    while (index < body.length && body[index] !== '.' && body[index] !== '[') {
      index += 1;
    }
    const key = body.slice(start, index).trim();
    if (!key) {
      throw new ClassifiedError({
        code: 'query/parse',
        message: `Unsupported path token in query: ${rawPath}`,
        field: 'query',
        context: { query: rawPath },
        suggestedNext: ['Use simple dotted paths, for example `.status`'],
      });
    }

    const segment = {
      type: 'property',
      key,
      arrayIndex: undefined,
      wildcard: false,
    };

    if (body[index] === '[') {
      const close = body.indexOf(']', index + 1);
      if (close < 0) {
        throw new ClassifiedError({
          code: 'query/parse',
          message: `Unsupported array syntax in query: ${rawPath}`,
          field: 'query',
          context: { query: rawPath },
          suggestedNext: ['Close your bracket in expressions such as .items[0] or .items[1:3].'],
        });
      }
      if (close === index + 1) {
        segment.wildcard = true;
        index = close + 1;
      } else {
        const selector = body.slice(index + 1, close);
        if (selector.trim() === '*') {
          segment.wildcard = true;
        } else {
          const parsedSelector = parseArraySlice(rawPath, selector);
          segment.slice = parsedSelector.slice;
          segment.arrayIndex = parsedSelector.arrayIndex;
        }
        index = close + 1;
      }
    }

    segments.push(segment);
    if (body[index] === '.') {
      index += 1;
    }
  }

  return segments;
}

function mapByQueryPath(input, rawPath) {
  const segments = parseQueryPath(rawPath);
  if (!segments) {
    return [input];
  }
  if (segments.length === 0) {
    return Array.isArray(input) ? [...input] : [input];
  }

  let values = [input];
  for (const segment of segments) {
    const next = [];
    for (const value of values) {
      if (value === undefined || value === null) {
        continue;
      }
      if (segment.type === 'wildcard') {
        if (Array.isArray(value)) {
          next.push(...value);
        }
        continue;
      }

      const currentValue = segment.type === 'root' ? value : value?.[segment.key];
      if (segment.type === 'root' && segment.wildcard) {
        if (Array.isArray(currentValue)) {
          next.push(...currentValue);
        }
        continue;
      }
      if (segment.slice) {
        if (Array.isArray(currentValue)) {
          const size = currentValue.length;
          const start = Number.isInteger(segment.slice.start) ? Math.max(0, segment.slice.start) : 0;
          const end = Number.isInteger(segment.slice.end) ? Math.min(size, segment.slice.end) : size;
          for (let i = start; i < end; i += 1) {
            next.push(currentValue[i]);
          }
        }
        continue;
      }
      if (segment.wildcard) {
        if (Array.isArray(currentValue)) {
          next.push(...currentValue);
        }
        continue;
      }
      if (segment.arrayIndex !== undefined) {
        next.push(Array.isArray(currentValue) ? currentValue[segment.arrayIndex] : undefined);
        continue;
      }
      next.push(currentValue);
    }
    values = next;
  }
  return values;
}

function resolveRecordPath(record, rawPath) {
  const values = mapByQueryPath(record, rawPath);
  if (!Array.isArray(values) || values.length === 0) {
    return undefined;
  }
  if (values.length === 1) {
    return values[0];
  }
  return values;
}

function parseQueryLiteral(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return '';
  }
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  if (/^(true|false)$/i.test(text)) {
    return text.toLowerCase() === 'true';
  }
  if (text.toLowerCase() === 'null') {
    return null;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    return Number(text);
  }
  return text;
}

function splitLogicalPredicateExpression(raw) {
  const expression = String(raw || '').trim();
  const terms = [];
  let current = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let operator = null;

  const isBoundary = (char) => !/[A-Za-z0-9_]/.test(char);

  const pushCurrent = () => {
    const value = current.trim();
    if (value) {
      terms.push(value);
    }
    current = '';
  };

  for (let index = 0; index < expression.length; index += 1) {
    const ch = expression[index];
    const next = expression[index + 1];

    if (ch === '\\' && (inSingle || inDouble)) {
      current += ch;
      if (next !== undefined) {
        current += next;
        index += 1;
      }
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    if (!inSingle && !inDouble) {
      if (ch === '(') {
        depth += 1;
      } else if (ch === ')') {
        depth = Math.max(0, depth - 1);
      }

      const isAnd =
        depth === 0 &&
        expression.slice(index, index + 3).toLowerCase() === 'and' &&
        isBoundary(expression[index - 1]) &&
        isBoundary(expression[index + 3]);

      const isOr =
        depth === 0 &&
        expression.slice(index, index + 2).toLowerCase() === 'or' &&
        isBoundary(expression[index - 1]) &&
        isBoundary(expression[index + 2]);
      const isAndSymbol =
        depth === 0 &&
        expression.slice(index, index + 2) === '&&' &&
        isBoundary(expression[index - 1]) &&
        isBoundary(expression[index + 2]);
      const isOrSymbol =
        depth === 0 &&
        expression.slice(index, index + 2) === '||' &&
        isBoundary(expression[index - 1]) &&
        isBoundary(expression[index + 2]);

      if (isAnd || isOr || isAndSymbol || isOrSymbol) {
        const nextOperator = isAnd || isAndSymbol ? 'and' : 'or';
        if (!operator) {
          operator = nextOperator;
        } else if (operator !== nextOperator) {
          throw new Error(`Unsupported mixed predicate operators in '${expression}'.`);
        }
        pushCurrent();
        const operatorSize = isAnd || isOr ? (isAnd ? 3 : 2) : 2;
        index = index + (operatorSize - 1);
        continue;
      }
    }

    current += ch;
  }

  pushCurrent();
  if (terms.length === 0) {
    return { operator: null, terms: [expression] };
  }
  return { operator, terms };
}

function parseAtomicPredicate(raw) {
  const expression = String(raw || '').trim();
  const simpleMatch = expression.match(/^\.?([a-zA-Z0-9_][a-zA-Z0-9_\-.]*)\s*(==|=|!=|>=|<=|>|<)\s*(.+)$/);
  if (simpleMatch) {
    const [, pathExpr, op, rawValue] = simpleMatch;
    const path = pathExpr.startsWith('.') ? pathExpr : `.${pathExpr}`;
    return {
      type: 'binary',
      path,
      op,
      value: parseQueryLiteral(rawValue),
    };
  }

  const existsMatch = expression.match(/^\.?([a-zA-Z0-9_][a-zA-Z0-9_\-.]*)$/);
  if (existsMatch) {
    const path = existsMatch[1].startsWith('.') ? existsMatch[1] : `.${existsMatch[1]}`;
    return {
      type: 'exists',
      path,
    };
  }

  throw new Error(`Unsupported predicate: ${expression}`);
}

function parsePredicate(raw) {
  const expression = String(raw || '').trim().replace(/^\((.*)\)$/, '$1');
  const split = splitLogicalPredicateExpression(expression);

  if (split.terms.length === 1 && !split.operator) {
    return parseAtomicPredicate(split.terms[0]);
  }

  if (split.operator && split.terms.length > 1) {
    return {
      type: 'logical',
      operator: split.operator,
      terms: split.terms.map(parseAtomicPredicate),
    };
  }

  return {
    type: 'logical',
    operator: split.operator || 'and',
    terms: split.terms.map(parseAtomicPredicate),
  };
}

function splitQueryExpression(expression) {
  const raw = String(expression || '').trim();
  if (!raw) {
    return [];
  }
  const segments = [];
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  let current = '';
  for (let index = 0; index < raw.length; index += 1) {
    const ch = raw[index];
    const next = raw[index + 1];
    if (ch === '\\' && (inSingle || inDouble)) {
      current += ch;
      if (next !== undefined) {
        current += next;
        index += 1;
      }
      continue;
    }
    if (ch === "'") {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === '"') {
      inDouble = !inDouble;
      current += ch;
      continue;
    }
    if (!inSingle && !inDouble) {
      if (ch === '(') {
        depth += 1;
      } else if (ch === ')') {
        depth = Math.max(0, depth - 1);
      } else if (ch === '|' && !depth) {
        segments.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments.map((segment) => {
    const trimmed = segment.trim();
    if (!trimmed || trimmed === '.' || trimmed === '.[]') {
      return { type: 'identity' };
    }
    if (trimmed.startsWith('select(') && trimmed.endsWith(')')) {
      return {
        type: 'select',
        predicate: parsePredicate(trimmed.slice(7, -1)),
      };
    }
    if (trimmed === 'length') {
      return { type: 'length' };
    }
    if (trimmed.startsWith('sort_by(') && trimmed.endsWith(')')) {
      const inner = trimmed.slice(8, -1).trim();
      const sortPath = inner.startsWith('.') ? inner : `.${inner}`;
      parseQueryPath(sortPath);
      return { type: 'sort_by', path: sortPath };
    }
    if (trimmed.startsWith('.')) {
      return {
        type: 'get',
        path: trimmed,
      };
    }
    throw new Error(`Unsupported query token: ${trimmed}`);
  });
}

function compareWithOperator(actual, op, expected) {
  if (op === '==' || op === '=') {
    return actual == expected;
  }
  if (op === '!=') {
    return actual != expected;
  }
  if (op === '>') {
    return Number(actual) > Number(expected);
  }
  if (op === '>=') {
    return Number(actual) >= Number(expected);
  }
  if (op === '<') {
    return Number(actual) < Number(expected);
  }
  if (op === '<=') {
    return Number(actual) <= Number(expected);
  }
  return false;
}

function evaluatePredicate(predicate, record) {
  if (!predicate || typeof predicate !== 'object') {
    return false;
  }

  if (predicate.type === 'logical') {
    const terms = Array.isArray(predicate.terms) ? predicate.terms : [];
    if (terms.length === 0) {
      return true;
    }
    if (predicate.operator === 'or') {
      return terms.some((term) => evaluatePredicate(term, record));
    }
    return terms.every((term) => evaluatePredicate(term, record));
  }

  if (predicate.type === 'exists') {
    const value = resolveRecordPath(record, predicate.path);
    return Boolean(value);
  }

  if (predicate.type !== 'binary') {
    return false;
  }

  const value = resolveRecordPath(record, predicate.path);
  if (Array.isArray(value)) {
    return value.some((entry) => compareWithOperator(entry, predicate.op, predicate.value));
  }
  return compareWithOperator(value, predicate.op, predicate.value);
}

function executeQuery(docs, queryExpression) {
  const stages = splitQueryExpression(queryExpression);
  let current = docs;
  for (const stage of stages) {
    if (stage.type === 'identity') {
      continue;
    }
    if (stage.type === 'select') {
      current = current.filter((entry) => evaluatePredicate(stage.predicate, entry));
      continue;
    }
    if (stage.type === 'get') {
      const segments = parseQueryPath(stage.path);
      const targetRootArray = Array.isArray(current) && segments && segments.length > 0 && segments[0].type === 'root';
      const next = [];

      if (targetRootArray) {
        next.push(...mapByQueryPath(current, stage.path));
      } else if (Array.isArray(current)) {
        for (const entry of current) {
          next.push(...mapByQueryPath(entry, stage.path));
        }
      } else {
        next.push(...mapByQueryPath(current, stage.path));
      }
      current = next;
      continue;
    }
    if (stage.type === 'sort_by') {
      if (!Array.isArray(current)) {
        continue;
      }
      current = [...current].sort((left, right) => {
        const leftValues = mapByQueryPath(left, stage.path);
        const rightValues = mapByQueryPath(right, stage.path);
        const leftValue = Array.isArray(leftValues) && leftValues.length ? leftValues[0] : leftValues;
        const rightValue = Array.isArray(rightValues) && rightValues.length ? rightValues[0] : rightValues;
        if (leftValue === rightValue) {
          return 0;
        }
        if (leftValue === undefined) {
          return 1;
        }
        if (rightValue === undefined) {
          return -1;
        }
        if (Number.isFinite(Number(leftValue)) && Number.isFinite(Number(rightValue))) {
          return Number(leftValue) - Number(rightValue);
        }
        return String(leftValue).localeCompare(String(rightValue));
      });
      continue;
    }
    if (stage.type === 'length') {
      if (Array.isArray(current)) {
        current = [current.length];
      } else if (current && typeof current === 'object') {
        current = [Object.keys(current).length];
      } else if (typeof current === 'string') {
        current = [current.length];
      } else {
        current = [0];
      }
    }
  }
  return current;
}

function buildWhereExpression(whereExpr) {
  const raw = String(whereExpr || '').trim();
  if (!raw) {
    return '';
  }
  if (raw.startsWith('select(') && raw.endsWith(')')) {
    return raw;
  }
  parsePredicate(raw);
  return `select(${raw})`;
}

function buildWhereExpressionOrThrow(whereExpr) {
  try {
    return buildWhereExpression(whereExpr);
  } catch (error) {
    if (error instanceof ClassifiedError) {
      throw error;
    }
    throw new ClassifiedError({
      code: 'query/parse',
      message: `Unable to parse where-expression: ${error.message}`,
      context: { expression: String(whereExpr || '') },
      suggestedNext: [
        'Use supported syntax: status == "in-progress" and type == "slice"',
        'If needed, wrap with select(...), for example select(.status == "in-progress")',
      ],
    });
  }
}

function resolveTargetBySelector(docs, target, cwd) {
  const normalized = String(target || '').trim();
  if (!normalized) {
    throw new Error('A document id or file path is required.');
  }
  const absolute = path.resolve(cwd, normalized);
  const looksLikePath =
    normalized.includes('/')
    || normalized.includes('\\')
    || normalized.endsWith('.md')
    || path.isAbsolute(normalized);
  if (looksLikePath) {
    const direct = docs.find((entry) => entry.file === absolute || toRelative(cwd, entry.file) === normalizePath(absolute));
    if (direct) {
      return { doc: direct, source: absolute };
    }
    if (existsSync(absolute)) {
      return { doc: null, source: absolute };
    }
  }
  const matched = docs.filter((entry) => entry.data?.id === normalized);
  if (matched.length === 1) {
    return { doc: matched[0], source: matched[0].file };
  }
  if (matched.length > 1) {
    throw new Error(`Multiple documents found for id '${normalized}'.`);
  }
  if (looksLikePath) {
    throw new Error(`No document found at ${normalized}`);
  }
  throw new Error(`No document found for id '${normalized}'`);
}

async function writeDocumentFrontmatter(filePath, updater) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = matter(raw);
  const nextData = updater(parsed.data || {});
  const nextRaw = matter.stringify(parsed.content || '', nextData);
  await fs.writeFile(filePath, nextRaw, 'utf8');
}

function validateDocs(cwd, docs, issues) {
  const byId = new Map();

  for (const doc of docs) {
    const schema = getSchemaForType(doc.type);
    const parsed = schema.safeParse(doc.data);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((item) => `${item.path.join('.') || 'root'}: ${item.message}`)
        .join('; ');
      addIssue(issues, 'error', doc.file, 'schema/valid', `Document schema invalid. ${details}`, {
        type: doc.type,
      });
      continue;
    }
    doc.data = parsed.data;
    if (!doc.data.id) {
      addIssue(issues, 'error', doc.file, 'id/required', 'Missing required frontmatter field: id', { type: doc.type });
      continue;
    }
    if (byId.has(doc.data.id)) {
      addIssue(
        issues,
        'error',
        doc.file,
        'id/unique',
        `Duplicate id '${doc.data.id}' also used in ${byId.get(doc.data.id).file}`,
        { type: doc.type },
      );
    } else {
      byId.set(doc.data.id, doc);
    }
  }

  for (const doc of docs) {
    const { data } = doc;
    if (!data.id) {
      continue;
    }
    const status = String(data.status || 'proposed');
    if (['blocked'].includes(status) && !data.blocking_reason) {
      addIssue(issues, 'error', doc.file, 'workflow/blocked', 'Blocked items must include blocking_reason');
    }
    if (status === 'review' && !data.reviewer) {
      addIssue(issues, 'warning', doc.file, 'workflow/review', 'Review items should include reviewer');
    }
    if (data.type === 'slice' && ACTIVE_SLICE_STATUSES.includes(status)) {
      if (!data.initiative_id) {
        addIssue(issues, 'error', doc.file, 'slice/initiative-required', 'Slice items must reference an initiative_id.');
      }
      if (!Array.isArray(data.acceptance_criteria) || data.acceptance_criteria.length === 0) {
        addIssue(issues, 'error', doc.file, 'slice/acceptance-required', 'Slice items should have acceptance criteria while active.');
      }
      if (status !== 'idea' && (!Array.isArray(data.gears_requirements) || data.gears_requirements.length === 0)) {
        addIssue(issues, 'warning', doc.file, 'slice/gears-required', 'Slice items should include GEARS requirements for deterministic execution.');
      }
    }

    if (data.type === 'strategy-current' || data.type === 'strategic-execution-spec' || data.type === 'architecture-reference') {
      if (!ACTIVE_STRATEGY_STATUSES.includes(status)) {
        addIssue(
          issues,
          'warning',
          doc.file,
          'workflow/review',
          `Strategy docs should normally stay in ${ACTIVE_STRATEGY_STATUSES.join(' or ')}.`,
        );
      }
    }

    if (data.type === 'initiative' && ACTIVE_INITIATIVE_STATUSES.includes(status)) {
      if (!Array.isArray(data.problem_statements) || data.problem_statements.length === 0) {
        addIssue(issues, 'error', doc.file, 'initiative/problem-required', 'Active initiatives must include problem_statements');
      }
      if (!data.owner) {
        addIssue(issues, 'warning', doc.file, 'initiative/no-owner', 'Active initiatives should include owner');
      }
      if (!Array.isArray(data.theme_ids) || data.theme_ids.length === 0) {
        addIssue(issues, 'error', doc.file, 'initiative/theme-required', 'initiative.theme_ids is required and must be non-empty');
      }
      if (!data.area_id) {
        addIssue(issues, 'error', doc.file, 'initiative/area-required', 'initiative.area_id is required');
      }
    }

    if (data.type === 'task' && !data.agent_workspace) {
      addIssue(issues, 'warning', doc.file, 'task/agent-workspace', 'Task is missing `agent_workspace` for parallel execution coordination.');
    }

    if (data.type === 'task' && data.parent_id && !byId.has(data.parent_id)) {
      addIssue(issues, 'error', doc.file, 'ref/valid', `task.parent_id '${data.parent_id}' does not exist`);
    }

    if (Array.isArray(data.depends_on)) {
      for (const dep of data.depends_on) {
        if (dep && !byId.has(dep)) {
          addIssue(issues, 'warning', doc.file, 'ref/valid', `depends_on reference not found: ${dep}`);
        }
      }
    }
    if (Array.isArray(data.related_docs)) {
      for (const ref of data.related_docs) {
        if (isLikelyId(ref)) {
          if (!byId.has(ref)) {
            addIssue(issues, 'warning', doc.file, 'ref/valid', `related_docs id not found: ${ref}`);
          }
          continue;
        }
        const linked = path.resolve(cwd, ref);
        if (!(existsSync(linked))) {
          addIssue(issues, 'warning', doc.file, 'ref/path-valid', `related_docs path does not exist: ${ref}`);
        }
      }
    }
    if ((data.type === 'theme' || data.type === 'area' || data.type === 'initiative') && data.related && data.related.length) {
      for (const rel of data.related) {
        if (!byId.has(rel)) {
          addIssue(issues, 'warning', doc.file, 'ref/related', `related reference not found: ${rel}`);
        }
      }
    }
  }

  const statusCount = new Map();
  for (const doc of docs) {
    if (!doc.data || !doc.data.status) {
      continue;
    }
    statusCount.set(doc.data.status, (statusCount.get(doc.data.status) || 0) + 1);
  }
  return { byId, statusCount };
}

function splitIssues(issues) {
  return {
    errors: issues.filter((item) => item.severity === 'error'),
    warnings: issues.filter((item) => item.severity === 'warning'),
  };
}

async function runLint(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const config = await readConfig(cwd, opts.config || DEFAULT_CONFIG_NAME);
  const issues = [];
  const docs = await loadAllDocs(cwd, config, opts, issues);
  const { statusCount } = validateDocs(cwd, docs, issues);

  const split = splitIssues(issues);
  const result = {
    success: split.errors.length === 0,
    scanned: docs.length,
    errors: split.errors,
    warnings: split.warnings,
    statusCount: Object.fromEntries(statusCount),
    collectionCount: Object.fromEntries(
      Object.entries(config.collections).map(([collectionName]) => [
        collectionName,
        docs.filter((doc) => doc.collection === collectionName).length,
      ])
    ),
  };

  if (opts.json) {
    printJson(result);
    return result.success ? 0 : 1;
  }

  if (split.errors.length === 0) {
    printLine(`\n✔ Kanban lint passed (${docs.length} documents).`);
  } else {
    printLine(`\n✖ Kanban lint failed (${split.errors.length} errors, ${split.warnings.length} warnings).`);
  }
  printErrors({ errors: split.errors, warnings: split.warnings });
  printLine(`\nStatuses: ${JSON.stringify(Object.fromEntries(statusCount), null, 2)}`);
  return split.errors.length === 0 ? 0 : 1;
}

function ensureAbsoluteOutputDir(cwd, outputDir) {
  return path.resolve(cwd, outputDir || DEFAULT_OUTPUT);
}

async function writeJsonOut(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function runBuild(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const config = await readConfig(cwd, opts.config || DEFAULT_CONFIG_NAME);
  const issues = [];
  const docs = await loadAllDocs(cwd, config, opts, issues);
  const parsed = validateDocs(cwd, docs, issues);
  const split = splitIssues(issues);

  const outputDir = ensureAbsoluteOutputDir(cwd, opts.out || config.outputDir || DEFAULT_OUTPUT);
  const outByCollection = Object.create(null);
  for (const doc of docs) {
    if (!doc.data || (doc.data.status === 'archived' && !opts.includeArchived)) {
      continue;
    }
    if (!outByCollection[doc.collection]) {
      outByCollection[doc.collection] = [];
    }
    outByCollection[doc.collection].push({
      ...doc.data,
      _file: doc.rel,
      _collection: doc.collection,
      _id: doc.data.id,
    });
  }

  for (const [collectionName, collectionDocs] of Object.entries(outByCollection)) {
    const filePath = path.join(outputDir, `${collectionName}.json`);
    await writeJsonOut(filePath, collectionDocs);
  }

  const indexFile = path.join(outputDir, 'index.json');
  const payload = {
    generatedAt: new Date().toISOString(),
    documents: docs.length,
    collections: Object.fromEntries(
      Object.entries(outByCollection).map(([collectionName, collectionDocs]) => [collectionName, collectionDocs.length])
    ),
    success: split.errors.length === 0,
    warnings: split.warnings,
    errors: split.errors,
  };
  await writeJsonOut(indexFile, payload);

  if (opts.json) {
    printJson(payload);
    return split.errors.length === 0 ? 0 : 1;
  }
  if (split.errors.length > 0 || split.warnings.length > 0) {
    printErrors({ errors: split.errors, warnings: split.warnings });
  }
  if (split.errors.length === 0) {
    printLine(`Wrote compiled docs to ${path.relative(cwd, outputDir)}`);
  } else {
    printLine(
      `Build generated output but found lint issues (${split.errors.length} errors, ${split.warnings.length} warnings).`
    );
  }
  return split.errors.length === 0 ? 0 : 1;
}

function ensureRepoPath(cwd, target) {
  const absolute = path.resolve(cwd, target);
  const relative = path.relative(cwd, absolute);
  if (relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative))) {
    return absolute;
  }
  throw new Error(`Refusing to operate outside repository: ${target}`);
}

async function runEvolve(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const config = await readConfig(cwd, opts.config || DEFAULT_CONFIG_NAME);
  const issues = [];
  const docs = await loadAllDocs(cwd, config, opts, issues);
  validateDocs(cwd, docs, issues);
  const match = resolveTargetBySelector(docs, opts.target, cwd);
  if (!match.doc) {
    throw new Error(`No document found for ${opts.target}`);
  }
  const statusOrder = statusProgressionForType(config, match.doc.type);
  const current = String(match.doc.data?.status || '').trim();
  if (!statusOrder.includes(current)) {
    throw new Error(
      `Current status '${current}' is not part of known progression for type '${match.doc.type}'. Available: ${statusOrder.join(', ')}`
    );
  }

  const conflict = await checkClaimConflictsForPaths(cwd, opts, [toRelative(cwd, match.source)], { requireAgent: true });
  if (conflict && !opts.force) {
    const payload = {
      ...commandFailurePayload('Cannot evolve due to scope conflict.', 'agent/claim-conflict', []),
      ...conflict,
      errors: conflict.errors,
    };
    if (opts.json) {
      printJson(payload);
      return 1;
    }
    printLine('[ERROR] Scope lock conflict prevents evolve.');
    for (const item of conflict.errors) {
      printLine(`- ${item.message}`);
      for (const suggestion of item.suggestedNext) {
        printLine(`  - suggestedNext: ${suggestion}`);
      }
    }
    return 1;
  }

  const suggestedNext = withStatusSuggestions(statusOrder, current);

  let next = String(opts.to || '').trim();
  if (!next) {
    const nextIndex = statusOrder.indexOf(current) + 1;
    if (nextIndex >= statusOrder.length) {
      const payload = {
        success: true,
        changed: false,
        file: toRelative(cwd, match.source),
        id: match.doc.data.id,
        status: current,
        suggestedNext,
      };
      if (opts.json) {
        printJson(payload);
      } else {
        printLine(`No evolve target available. Already at terminal status '${current}'.`);
        if (suggestedNext.length > 0) {
          printLine(`suggestedNext: ${suggestedNext.join(', ')}`);
        }
      }
      return 0;
    }
    next = statusOrder[nextIndex];
  } else if (!statusOrder.includes(next)) {
    throw new Error(`Invalid target status '${next}'. Available statuses: ${statusOrder.join(', ')}`);
  }

  const now = new Date().toISOString();
  const payload = {
    success: true,
    id: match.doc.data.id,
    file: toRelative(cwd, match.source),
    type: match.doc.type,
    from: current,
    to: next,
    dryRun: opts.dryRun,
    suggestedNext: withStatusSuggestions(statusOrder, next),
  };

  if (opts.dryRun) {
    if (opts.json) {
      printJson(payload);
      return 0;
    }
    printLine(`Dry run: would evolve ${payload.id} ${current} -> ${next}`);
    if (payload.suggestedNext.length > 0) {
      printLine(`suggestedNext: ${payload.suggestedNext.join(', ')}`);
    }
    return 0;
  }

  await writeDocumentFrontmatter(match.source, (data) => ({
    ...data,
    status: next,
    lastUpdated: now,
  }));

  if (opts.json) {
    printJson(payload);
    return 0;
  }
  printLine(`Evolved ${match.doc.data.id}: ${current} -> ${next}`);
  if (payload.suggestedNext.length > 0) {
    printLine(`suggestedNext: ${payload.suggestedNext.join(', ')}`);
  }
  return 0;
}

async function runMv(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const config = await readConfig(cwd, opts.config || DEFAULT_CONFIG_NAME);
  const issues = [];
  const docs = await loadAllDocs(cwd, config, opts, issues);
  validateDocs(cwd, docs, issues);

  const source = resolveTargetBySelector(docs, opts.source, cwd).source;
  const destination = ensureRepoPath(cwd, opts.destination);
  const from = toRelative(cwd, source);
  const to = toRelative(cwd, destination);

  const payload = {
    success: true,
    from,
    to,
    destination,
    dryRun: opts.dryRun,
    suggestedNext: [`kan mv --force ${from} ${to}`],
  };

  const conflict = await checkClaimConflictsForPaths(cwd, opts, [from, to], { requireAgent: true });
  if (conflict && !opts.force) {
    const payload = {
      ...commandFailurePayload('Cannot move file due to scope conflict.', 'agent/claim-conflict', []),
      ...conflict,
      errors: conflict.errors,
    };
    if (opts.json) {
      printJson(payload);
      return 1;
    }
    printLine('[ERROR] Scope lock conflict prevents move.');
    for (const item of conflict.errors) {
      printLine(`- ${item.message}`);
      for (const suggestion of item.suggestedNext) {
        printLine(`  - suggestedNext: ${suggestion}`);
      }
    }
    return 1;
  }

  if (opts.dryRun) {
    if (opts.json) {
      printJson(payload);
      return 0;
    }
    printLine(`Dry run: move ${from} -> ${to}`);
    return 0;
  }

  if (existsSync(destination)) {
    if (!opts.force) {
      throw new Error(`Destination already exists: ${to}`);
    }
    await fs.unlink(destination);
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.rename(source, destination);
  if (opts.json) {
    printJson(payload);
    return 0;
  }
  printLine(`Moved ${from} -> ${to}`);
  return 0;
}

async function runRm(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const config = await readConfig(cwd, opts.config || DEFAULT_CONFIG_NAME);
  const issues = [];
  const docs = await loadAllDocs(cwd, config, opts, issues);
  validateDocs(cwd, docs, issues);

  const target = resolveTargetBySelector(docs, opts.target, cwd);
  if (!target.doc) {
    throw new Error(`No managed document found for ${opts.target}`);
  }
  const now = new Date().toISOString();
  const source = target.source;

  const payload = {
    success: true,
    id: target.doc.data.id,
    file: toRelative(cwd, source),
    hard: opts.hard,
    dryRun: opts.dryRun,
    status: target.doc.data.status,
  };

  const conflict = await checkClaimConflictsForPaths(cwd, opts, [toRelative(cwd, source)], { requireAgent: true });
  if (conflict && !opts.force) {
    const payloadConflict = {
      ...commandFailurePayload('Cannot remove file due to scope conflict.', 'agent/claim-conflict', []),
      ...conflict,
      errors: conflict.errors,
    };
    if (opts.json) {
      printJson(payloadConflict);
      return 1;
    }
    printLine('[ERROR] Scope lock conflict prevents removal.');
    for (const item of conflict.errors) {
      printLine(`- ${item.message}`);
      for (const suggestion of item.suggestedNext) {
        printLine(`  - suggestedNext: ${suggestion}`);
      }
    }
    return 1;
  }

  if (opts.hard) {
    if (opts.dryRun) {
      if (opts.json) {
        printJson(payload);
        return 0;
      }
      printLine(`Dry run: would delete ${payload.file}`);
      return 0;
    }
    await fs.unlink(source);
    if (opts.json) {
      printJson(payload);
      return 0;
    }
    printLine(`Deleted ${payload.file}`);
    return 0;
  }

  const next = opts.status || 'archived';
  await writeDocumentFrontmatter(source, (data) => ({
    ...data,
    status: next,
    lastUpdated: now,
  }));
  payload.nextStatus = next;
  if (opts.json) {
    printJson(payload);
    return 0;
  }
  printLine(`Archived ${payload.file} -> ${next}`);
  return 0;
}

async function runAgentStatus(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const state = buildAgentClaimsState(await readAgentClaims(cwd));
  const now = new Date().toISOString();
  const entries = state.claims.map((claim) => ({
    ...claim,
    active: !isExpiredClaim(claim),
  }));
  const filtered = opts.agent
    ? entries.filter((claim) => claim.agent === opts.agent)
    : entries;
  const activeOnly = opts.all ? filtered : filtered.filter((claim) => claim.active);
  const result = {
    generatedAt: now,
    agentCount: activeOnly.length,
    claims: activeOnly,
  };

  if (opts.json) {
    printJson(result);
    return 0;
  }

  printLine(`\nAgent claims (${activeOnly.length} shown):`);
  if (!activeOnly.length) {
    printLine('  - no claims');
    return 0;
  }
  for (const claim of activeOnly) {
    const status = claim.active ? 'active' : 'expired';
    printLine(`- ${claim.agent} [${status}] -> ${claim.scopes.join(', ')} ${claim.expiresAt ? `(expires ${claim.expiresAt})` : ''}`);
  }
  return 0;
}

async function runAgentPrune(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const original = buildAgentClaimsState(await readAgentClaims(cwd));
  const next = pruneExpiredClaims(original);

  if (opts.all && opts.agent) {
    next.claims = next.claims.filter((claim) => claim.agent !== opts.agent);
  }
  if (opts.all && !opts.agent) {
    next.claims = [];
  }

  await writeAgentClaims(cwd, next);

  const removed = original.claims.length - next.claims.length;
  const payload = {
    success: true,
    removedClaims: removed,
    remainingClaims: next.claims.length,
  };
  if (opts.json) {
    printJson(payload);
    return 0;
  }
  printLine(`Pruned ${removed} expired/removed claims.`);
  return 0;
}

async function readGitRoot(cwd) {
  try {
    const output = execWithTimeout('git rev-parse --show-toplevel', {
      cwd,
    });
    const root = String(output || '').trim();
    if (!root) {
      throw new ClassifiedError({
        code: 'git/root-not-found',
        message: 'Unable to resolve git root from this directory.',
        field: 'cwd',
        suggestedNext: ['Run in a git repository directory and retry.'],
      });
    }
    return root;
  } catch (error) {
    if (error instanceof ClassifiedError) {
      throw error;
    }
    throw new ClassifiedError({
      code: 'git/root-lookup-failed',
      message: `Git repository root lookup failed: ${error.message}`,
      field: 'cwd',
      context: { cause: error.message },
      suggestedNext: ['Run this command from a cloned git repository.'],
    });
  }
}

async function runAgentsInit(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const scriptPath = path.join(cwd, AGENTS_WORKTREE_SCRIPT_PATH);
  const workflowPath = path.join(cwd, AGENT_SCOPE_GUARD_WORKFLOW_PATH);
  const compoundWorkflowPath = path.join(cwd, AGENT_COMPOUND_AUTOPILOT_WORKFLOW_PATH);
  const starterMarkerPath = path.join(cwd, STARTER_MARKER_PATH);
  const isStarterRepo = await fileExists(starterMarkerPath);
  const scriptExists = await fileExists(scriptPath);
  const rawArgs = Array.isArray(opts.rawArgs) ? opts.rawArgs : process.argv.slice(2);
  const explicitlyEnableWorkflow = rawArgs.includes('--workflow');
  const explicitlyDisableWorkflow = rawArgs.includes('--no-workflow');
  if (explicitlyEnableWorkflow && explicitlyDisableWorkflow) {
    throw new Error('Specify either --workflow or --no-workflow, not both.');
  }

  const hasCanonicalWorkflow = await fileExists(workflowPath);
  const hasCompoundWorkflow = await fileExists(compoundWorkflowPath);
  const shouldWriteScript = opts.force || !scriptExists;
  const shouldWriteWorkflow = (() => {
    if (explicitlyEnableWorkflow) return true;
    if (explicitlyDisableWorkflow) return false;
    if (opts.force) return true;
    return !isStarterRepo && !hasCanonicalWorkflow;
  })();
  const shouldWriteCompoundWorkflow = (() => {
    if (explicitlyEnableWorkflow) return true;
    if (explicitlyDisableWorkflow) return false;
    if (opts.force) return true;
    return !isStarterRepo && !hasCompoundWorkflow;
  })();

  if (shouldWriteWorkflow && !opts.force && hasCanonicalWorkflow) {
    throw new ClassifiedError({
      code: 'agent-workflow/exists',
      message: `Agent scope workflow already exists: ${AGENT_SCOPE_GUARD_WORKFLOW_PATH}.`,
      field: AGENT_SCOPE_GUARD_WORKFLOW_PATH,
      suggestedNext: [
        'Re-run with --force to replace it intentionally.',
        'Review the file and remove if generated by an unintended source.',
      ],
    });
  }

  if (shouldWriteCompoundWorkflow && !opts.force && hasCompoundWorkflow) {
    throw new ClassifiedError({
      code: 'agent-workflow/exists',
      message: `Compound autopilot workflow already exists: ${AGENT_COMPOUND_AUTOPILOT_WORKFLOW_PATH}.`,
      field: AGENT_COMPOUND_AUTOPILOT_WORKFLOW_PATH,
      suggestedNext: [
        'Re-run with --force to replace it intentionally.',
        'If policy changed, remove the file and retry.',
      ],
    });
  }

  if (shouldWriteScript) {
    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    await fs.writeFile(scriptPath, AGENT_WORKTREE_BOOTSTRAP_SCRIPT, 'utf8');
    await fs.chmod(scriptPath, 0o755);
  }

  if (shouldWriteWorkflow) {
    await fs.mkdir(path.dirname(workflowPath), { recursive: true });
    await fs.writeFile(workflowPath, AGENT_SCOPE_GUARD_WORKFLOW, 'utf8');
  }
  if (shouldWriteCompoundWorkflow) {
    await fs.mkdir(path.dirname(compoundWorkflowPath), { recursive: true });
    await fs.writeFile(compoundWorkflowPath, AGENT_COMPOUND_AUTOPILOT_WORKFLOW, 'utf8');
  }

  const payload = {
    success: true,
    command: 'kan agent init',
    created: {
      bootstrapScript: shouldWriteScript,
      bootstrapScriptPath: path.relative(cwd, scriptPath),
      workflow: shouldWriteWorkflow,
      workflowPath: shouldWriteWorkflow
      ? path.relative(cwd, workflowPath)
      : hasCanonicalWorkflow
        ? path.relative(cwd, workflowPath)
        : null,
      compoundWorkflow: shouldWriteCompoundWorkflow,
      compoundWorkflowPath: shouldWriteCompoundWorkflow
        ? path.relative(cwd, compoundWorkflowPath)
        : hasCompoundWorkflow
          ? path.relative(cwd, compoundWorkflowPath)
          : null,
    },
  };
  if (opts.json) {
    printJson(payload);
    return 0;
  }
  printLine(`Agents bootstrap prepared at ${AGENTS_WORKTREE_SCRIPT_PATH}.`);
  if (shouldWriteScript) {
    printLine(`Run: ${AGENTS_WORKTREE_SCRIPT_PATH} <agent> [branch] [path]`);
  }
  if (shouldWriteWorkflow) {
    printLine(`Created PR scope-guard workflow at ${AGENT_SCOPE_GUARD_WORKFLOW_PATH}.`);
  }
  if (shouldWriteCompoundWorkflow) {
    printLine(`Created PR compound-autopilot workflow at ${AGENT_COMPOUND_AUTOPILOT_WORKFLOW_PATH}.`);
  } else if (explicitlyDisableWorkflow) {
    printLine('Workflow generation skipped (--no-workflow).');
  } else if (!isStarterRepo) {
    if (hasCanonicalWorkflow) {
      printLine(`Agent scope workflow already exists at ${AGENT_SCOPE_GUARD_WORKFLOW_PATH}; use --force to overwrite.`);
    }
      if (hasCompoundWorkflow) {
        printLine(
          `Compound-autopilot workflow already exists at ${AGENT_COMPOUND_AUTOPILOT_WORKFLOW_PATH}; use --force to overwrite.`,
        );
      }
      if (!hasCanonicalWorkflow && !hasCompoundWorkflow) {
        printLine('Non-starter repository detected. Workflow generation is skipped; use --workflow or --force to generate.');
      }
  } else {
    printLine('Starter initialization detected; dedicated PR scope-guard workflow is already managed by the starter workflow.');
  }
  return 0;
}

async function runAgentsWorktree(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const repoRoot = await readGitRoot(cwd);
  const agent = normalizeAgentName(
    opts.agent || process.env.KAN_AGENT_ID || process.env.USER || process.env.USERNAME,
  );
  if (!agent) {
    throw new ClassifiedError({
      code: 'agent/name-required',
      message: 'An agent name is required (--agent, KAN_AGENT_ID, or USER).',
      field: 'agent',
      suggestedNext: ['Provide --agent or set KAN_AGENT_ID.'],
    });
  }
  const branch = String(opts.branch || `agent/${agent}`).trim();
  const normalizedBranch = requireNonEmptyString(branch, 'branch');
  if (!normalizedBranch.startsWith('agent/')) {
    throw new ClassifiedError({
      code: 'agent/branch-format',
      message: `Invalid branch name '${branch}'. Expected agent-prefixed branch names.`,
      field: 'branch',
      suggestedNext: ['Use a branch in the format: agent/<name>.'],
    });
  }
  const defaultPath = path.resolve(repoRoot, '..', 'agent-worktrees', agent);
  const targetPath = opts.path ? path.resolve(cwd, opts.path) : defaultPath;

  if (await fileExists(targetPath)) {
    throw new ClassifiedError({
      code: 'agent/worktree-exists',
      message: `Worktree path already exists: ${targetPath}.`,
      field: 'path',
      suggestedNext: ['Use --path with a new target.'],
    });
  }

  const branchRef = shellArg(`refs/heads/${branch}`);
  let branchExists = false;
  try {
    execWithTimeout(`git -C ${shellArg(repoRoot)} rev-parse --verify --quiet ${branchRef}`, {
      cwd,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    branchExists = true;
  } catch {
    branchExists = false;
  }

  const addCommand = branchExists
    ? `git -C ${shellArg(repoRoot)} worktree add ${shellArg(targetPath)} ${shellArg(branch)}`
    : `git -C ${shellArg(repoRoot)} worktree add -b ${shellArg(branch)} ${shellArg(targetPath)}`;

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const addResult = execWithTimeout(addCommand, {
    cwd,
    encoding: 'utf8',
  });
  if (!addResult && !branchExists) {
    throw new ClassifiedError({
      code: 'agent/worktree-create-failed',
      message: `Failed to create worktree at ${targetPath}.`,
      field: 'path',
      suggestedNext: ['Run the command again or verify repo/worktree state.'],
    });
  }

  const payload = {
    success: true,
    agent,
    branch,
    path: path.relative(cwd, targetPath),
    repoRoot,
  };
  if (opts.json) {
    printJson(payload);
    return 0;
  }
  printLine(`Created worktree for ${agent} at ${path.relative(cwd, targetPath)}.`);
  printLine(`branch: ${branch}`);
  return 0;
}

async function resolveTaskAgentWorkspace(cwd, target, configPath = DEFAULT_CONFIG_NAME) {
  const trimmed = String(target || '').trim();
  if (!trimmed) {
    throw new Error('A task target or explicit scope is required.');
  }

  const looksLikePath =
    trimmed.includes('/')
    || trimmed.includes('\\')
    || trimmed.endsWith('.md')
    || path.isAbsolute(trimmed)
    || trimmed.startsWith('.')
    || trimmed.includes('*');

  const parseFromFile = async (filePath) => {
    const absolutePath = path.resolve(cwd, filePath);
    if (!(await fileExists(absolutePath))) {
      return null;
    }
    let parsed;
    try {
      parsed = matter(await fs.readFile(absolutePath, 'utf8'));
    } catch (error) {
      throw new Error(`Unable to parse task frontmatter at ${absolutePath}: ${error.message}`);
    }
    const data = parsed.data || {};
    if (data.type !== 'task') {
      throw new Error(`Target resolved to a non-task document: ${trimmed} (type: ${data.type || 'missing'})`);
    }
    const workspace = String(data.agent_workspace || '').trim();
    if (!workspace) {
      throw new Error(`Task ${trimmed} is missing required 'agent_workspace' in frontmatter.`);
    }
    return workspace;
  };

  if (looksLikePath) {
    const workspace = await parseFromFile(trimmed);
    if (workspace) {
      return workspace;
    }
  }

  const config = await readConfig(cwd, configPath);
  const docs = await loadAllDocs(cwd, config, {}, []);
  const targetRecord = resolveTargetBySelector(docs, trimmed, cwd);
  if (!targetRecord.doc) {
    throw new Error(`No managed task found for target: ${trimmed}`);
  }
  if (targetRecord.doc.data?.type !== 'task') {
    throw new Error(`Target ${trimmed} is not a task (type: ${targetRecord.doc.data?.type || 'missing'}).`);
  }
  const workspace = String(targetRecord.doc.data?.agent_workspace || '').trim();
  if (!workspace) {
    throw new Error(`Task ${trimmed} is missing required 'agent_workspace' in frontmatter.`);
  }
  return workspace;
}

async function runAgentClaim(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const requestedScopes = [...new Set(normalizeClaimsInputScopes(cwd, opts.scope || []))];
  if (requestedScopes.length === 0 && opts.target) {
    requestedScopes.push(await resolveTaskAgentWorkspace(cwd, opts.target, opts.config || DEFAULT_CONFIG_NAME));
  }
  if (requestedScopes.length === 0) {
    throw new ClassifiedError({
      code: 'agent/claim/input',
      message: 'Provide --scope or a task target that includes agent_workspace.',
      field: 'scope',
      suggestedNext: ['Pass --scope <path> or run `kan agent claim <task-id>` on a task with agent_workspace.'],
    });
  }
  opts.scope = requestedScopes;

  const agent = String(opts.agent || process.env.KAN_AGENT_ID || process.env.USER || process.env.USERNAME || '').trim();
  if (!agent) {
    throw new ClassifiedError({
      code: 'agent/agent-id-required',
      message: 'Agent id is required (--agent or KAN_AGENT_ID or USER).',
      field: 'agent',
      suggestedNext: ['Re-run with --agent <name>.'],
    });
  }
  const ttlHours = Number.parseFloat(opts.ttlHours);
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    throw new ClassifiedError({
      code: 'agent/claim/ttl-invalid',
      message: `Invalid TTL value '${opts.ttlHours}'. Expected positive number of hours.`,
      field: 'ttl-hours',
      context: { value: opts.ttlHours },
      suggestedNext: ['Pass a positive TTL value, for example --ttl-hours 4.'],
    });
  }
  const ttlMs = ttlHours * 60 * 60 * 1000;

  const baseState = pruneExpiredClaims(buildAgentClaimsState(await readAgentClaims(cwd)));
  const requested = [...new Set(requestedScopes)];

  const conflicts = [];
  for (const claim of baseState.claims) {
    if (claim.agent === agent) {
      continue;
    }
    for (const existingScope of claim.scopes) {
      for (const scope of requested) {
        if (scopesOverlap(scope, existingScope)) {
          conflicts.push({
            agent: claim.agent,
            fileScope: existingScope,
            requestedScope: scope,
            claimedAt: claim.claimedAt,
          });
        }
      }
    }
  }

  if (conflicts.length > 0 && !opts.force) {
    if (opts.json) {
      const errors = conflicts.map((conflict) => ({
        file: `agent-claims:${conflict.requestedScope}`,
        severity: 'error',
        ruleId: 'agent/claim-conflict',
        message: `Scope conflict: ${conflict.requestedScope} overlaps ${conflict.fileScope} (owned by ${conflict.agent})`,
        suggestedNext: suggestedNextForClaimConflict(conflict),
      }));
      printJson({
        success: false,
        agent,
        requestedScopes: requested,
        conflicts,
        errors,
        conflictCount: conflicts.length,
      });
    } else {
      printLine('[ERROR] Scope conflict with existing claims:');
      for (const conflict of conflicts) {
        printLine(`- ${conflict.requestedScope} overlaps ${conflict.fileScope} (owned by ${conflict.agent})`);
      }
      printLine('Use --force to override');
    }
    return 1;
  }

  const nextState = { ...baseState, claims: [...baseState.claims] };
  const now = new Date();
  const existingIndex = nextState.claims.findIndex((claim) => claim.agent === agent);
  if (existingIndex === -1) {
    nextState.claims.push({
      agent,
      scopes: [...requested],
      note: opts.note || '',
      claimedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      updatedBy: agent,
      updatedAt: now.toISOString(),
    });
  } else {
    const nextScopes = new Set(nextState.claims[existingIndex].scopes);
    for (const scope of requested) {
      nextScopes.add(scope);
    }
    nextState.claims[existingIndex] = {
      ...nextState.claims[existingIndex],
      note: opts.note || nextState.claims[existingIndex].note || '',
      scopes: [...nextScopes],
      claimedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      updatedAt: now.toISOString(),
      updatedBy: agent,
    };
  }

  const payload = {
    success: true,
    agent,
    scopes: requested,
    expiresAt: nextState.claims.find((claim) => claim.agent === agent)?.expiresAt,
    totalClaims: nextState.claims.length,
  };
  await writeAgentClaims(cwd, nextState);
  if (opts.json) {
    printJson(payload);
  } else {
    printLine(`Claim recorded for ${agent}: ${requested.join(', ')}`);
    if (payload.expiresAt) {
      printLine(`Expires at: ${payload.expiresAt}`);
    }
  }
  return 0;
}

async function runAgentUnclaim(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const agent = String(opts.agent || process.env.KAN_AGENT_ID || process.env.USER || process.env.USERNAME || '').trim();
  if (!agent) {
    throw new ClassifiedError({
      code: 'agent/agent-id-required',
      message: 'Agent id is required (--agent or KAN_AGENT_ID).',
      field: 'agent',
      suggestedNext: ['Re-run with --agent <name>.'],
    });
  }

  const state = pruneExpiredClaims(buildAgentClaimsState(await readAgentClaims(cwd)));
  const index = state.claims.findIndex((entry) => entry.agent === agent);
  if (index === -1) {
    if (opts.json) {
      printJson({ success: false, message: `No active claims for ${agent}` });
    } else {
      printLine(`No active claims for ${agent}`);
    }
    return 1;
  }

  if (opts.all) {
    state.claims.splice(index, 1);
  } else {
    if (!opts.scope || opts.scope.length === 0) {
      throw new ClassifiedError({
        code: 'agent/scope-required',
        message: 'Use --all to remove all claims, or pass --scope to release specific scopes.',
        field: 'scope',
        suggestedNext: ['Call with --all or --scope <path>.'],
      });
    }
    const requested = normalizeClaimsInputScopes(cwd, opts.scope);
    const requestedSet = new Set(requested);
    const remaining = state.claims[index].scopes.filter((scope) => !requestedSet.has(scope));
    if (remaining.length === state.claims[index].scopes.length) {
      if (opts.json) {
        printJson({ success: false, message: `No matching scopes for ${agent}` });
      } else {
        printLine(`No matching scopes found for ${agent}`);
      }
      return 1;
    }
    if (remaining.length === 0) {
      state.claims.splice(index, 1);
    } else {
      state.claims[index] = {
        ...state.claims[index],
        scopes: remaining,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  await writeAgentClaims(cwd, state);
  if (opts.json) {
    printJson({ success: true, removed: opts.all ? 'all' : 'selected', by: agent });
  } else {
    printLine(`Released claim(s) for ${agent}.`);
  }
  return 0;
}

async function ensureCompoundPluginEnabled(cwd, opts = {}) {
  if (opts.skipPluginCheck) {
    return;
  }
  const installed = await isPluginInstalled(cwd, 'compound-engineering');
  if (installed) {
    return;
  }
  throw new ClassifiedError({
    code: 'workflow/plugin-missing',
    message: "Loop stages require plugin 'compound-engineering'.",
    context: { plugin: 'compound-engineering' },
    suggestedNext: ['Run: kan plugin install compound-engineering.'],
  });
}

async function runPluginList(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const builtIns = [];
  const builtInEntries = await fs.readdir(PLUGIN_TEMPLATES_DIR).catch(() => []);
  for (const pluginName of builtInEntries) {
    if (!pluginName || pluginName.startsWith('.')) {
      continue;
    }
    builtIns.push(pluginName);
  }

  const registry = await readPluginRegistry(cwd);
  const installed = [];
  for (const entry of registry.installed) {
    installed.push({
      name: entry.name,
      version: entry.version || 'unknown',
      installedAt: entry.installedAt || entry.installed_at || 'unknown',
      path: entry.path || path.join(PLUGINS_ROOT, entry.name),
    });
  }

  const payload = {
    success: true,
    builtIns: builtIns.sort(),
    installed,
  };
  if (opts.json) {
    printJson(payload);
    return 0;
  }
  printLine(`Built-in plugin templates: ${payload.builtIns.length}`);
  for (const plugin of payload.builtIns) {
    printLine(`- ${plugin}`);
  }
  if (payload.installed.length > 0) {
    printLine('Installed plugins:');
    for (const entry of payload.installed) {
      printLine(`- ${entry.name} @ ${entry.version}`);
    }
  } else {
    printLine('Installed plugins: none');
  }
  return 0;
}

async function runPluginInstall(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const name = normalizePluginName(opts.name);
  if (!name) {
    throw new ClassifiedError({
      code: 'plugin/name-required',
      message: 'Plugin name is required.',
      field: 'name',
      suggestedNext: ['Run with --name or position the plugin name as argument.'],
    });
  }
  const templatePath = pluginTemplatePath(name);
  if (!(await fileExists(templatePath))) {
    throw new ClassifiedError({
      code: 'plugin/template-missing',
      message: `Unknown plugin template '${name}'.`,
      field: 'name',
      context: { template: templatePath },
      suggestedNext: [
        `Create templates/plugins/${name}/ with a manifest.json`,
        'Check template names using the available plugin templates directory.',
      ],
    });
  }

  const manifestPath = path.join(templatePath, 'manifest.json');
  if (!(await fileExists(manifestPath))) {
    throw new ClassifiedError({
      code: 'plugin/manifest-missing',
      message: `Plugin template '${name}' is missing manifest.json.`,
      field: `${name}/manifest.json`,
      suggestedNext: ['Add manifest.json to template and retry.'],
    });
  }

  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new ClassifiedError({
      code: 'plugin/manifest-parse',
      message: `Invalid JSON in plugin manifest for '${name}'.`,
      field: manifestPath,
      context: { reason: error.message },
      suggestedNext: ['Fix manifest.json syntax and retry.'],
    });
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new ClassifiedError({
      code: 'plugin/manifest-shape',
      message: `Invalid manifest format for '${name}'.`,
      field: manifestPath,
      suggestedNext: ['Use a JSON object with name/version/commands keys.'],
    });
  }
  const version = manifest.version || '1.0.0';
  const targetPath = pluginInstallPath(cwd, name);
  const exists = await fileExists(targetPath);
  if (exists && !opts.force) {
    throw new ClassifiedError({
      code: 'plugin/exists',
      message: `Plugin already installed at ${path.relative(cwd, targetPath)}.`,
      field: path.relative(cwd, targetPath),
      context: { plugin: name },
      suggestedNext: ['Re-run with --force to overwrite the plugin.', 'Use a different target directory for manual install.'],
    });
  }

  await copyDirectory(templatePath, targetPath, { force: opts.force || false });

  const registry = await readPluginRegistry(cwd);
  const manifestName = manifest.name || name;
  const nextInstalled = registry.installed.filter((entry) => normalizePluginName(entry.name) !== name);
  nextInstalled.push({
    name: manifestName,
    version,
    installedAt: new Date().toISOString(),
    path: path.relative(cwd, targetPath),
  });
  await writePluginRegistry(cwd, { ...registry, installed: nextInstalled, updatedAt: new Date().toISOString() });

  const payload = {
    success: true,
    plugin: manifestName,
    version,
    target: path.relative(cwd, targetPath),
    manifest,
    commands: manifest.commands || [],
  };
  if (opts.json) {
    printJson(payload);
    return 0;
  }
  printLine(`Installed plugin '${manifestName}' at ./${path.relative(cwd, targetPath)}.`);
  if (Array.isArray(manifest.commands) && manifest.commands.length > 0) {
    printLine(`Available plugin commands: ${manifest.commands.join(', ')}`);
  }
  return 0;
}
async function runWorkflowArtifact(opts, stage, overrideOptions = {}) {
  const cwd = path.resolve(opts.cwd || '.');
  await ensureCompoundPluginEnabled(cwd, opts);
  await ensureCompoundRoots(cwd);
  const scopeInput = Array.isArray(opts.scope) ? opts.scope : [opts.scope];
  const scope = scopeInput.map((entry) => String(entry || '').trim()).find((entry) => entry.length);
  const mergedOptions = {
    ...opts,
    ...overrideOptions,
  };
  const isAutoMode = Boolean(mergedOptions.auto);
  if (isAutoMode && !mergedOptions.objective) {
    mergedOptions.objective = `Auto ${stage} capture for ${mergedOptions.initiative || scope || 'default scope'}`;
  }
  if (isAutoMode && !mergedOptions.result) {
    mergedOptions.result = `Automatic ${stage} loop artifact produced by ${
      mergedOptions.agent || process.env.KAN_AGENT_ID || process.env.USER || process.env.USERNAME || 'agent'
    }.`;
  }
  const payload = buildCompoundPayload(
    stage,
    scope,
    opts.initiative,
    { ...mergedOptions, auto: isAutoMode },
    `kan loop --stage ${stage}`,
  );
  const artifact = await writeCompoundArtifact(cwd, payload);
  const prompts = await updateSystemPrompts(cwd, payload, {
    promote: Boolean(opts.promote),
  });
  const skill = await buildSkillArtifact(cwd, payload, {
    emitSkill: overrideOptions.emitSkill || opts.emitSkill,
    forceSkill: overrideOptions.forceSkill || opts.force,
  });
  const next = commandForNextWorkflowStep(stage, {
    initiative: payload.initiative,
    scope: payload.scope,
    auto: isAutoMode,
  });
  const result = {
    success: true,
    stage,
    initiative: payload.initiative,
    artifact,
    suggestedNext: next ? [next] : [],
    artifactCount: 1,
  };
  if (prompts) {
    result.prompts = prompts;
  }
  if (skill) {
    result.skills = [skill];
  }
  return { ...result, ...payload };
}

async function runWorkflowLoop(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  await ensureCompoundPluginEnabled(cwd, opts);
  await ensureCompoundRoots(cwd);
  const scopeInput = Array.isArray(opts.scope) ? opts.scope : [opts.scope];
  const scope = scopeInput.map((entry) => String(entry || '').trim()).find((entry) => entry.length);
  const requestedStage = String(opts.stage || 'auto').trim().toLowerCase();
  const mode = requestedStage === 'full' ? 'auto' : requestedStage;
  if (mode !== 'auto' && !WORKFLOW_STEPS.includes(mode)) {
    throw new ClassifiedError({
      code: 'workflow/stage-invalid',
      message: `Unsupported loop stage '${requestedStage}'.`,
      field: 'stage',
      context: { supported: WORKFLOW_STEPS },
      suggestedNext: ['Use plan, work, review, compound, or auto.'],
    });
  }
  const generated = [];
  const runOpts = {
    ...opts,
    scope,
    auto: Boolean(opts.auto),
  };

  const stages = mode === 'auto' ? WORKFLOW_STEPS : [mode];
  if (opts.dryRun) {
    const stageLines = stages.map((stage) =>
      [
        'kan loop',
        `--stage ${stage}`,
        scope ? `--scope ${scope}` : '',
        opts.initiative ? `--initiative ${opts.initiative}` : '',
        runOpts.auto ? '--auto' : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
    generated.push(...stageLines);
    if (opts.json) {
      printJson({
        success: true,
        mode,
        initiative: opts.initiative || '',
        artifacts: generated,
        count: generated.length,
        suggestedNext: [],
      });
      return 0;
    }
    printLine(`Pipeline preview (${mode}):`);
    for (const suggestion of generated) {
      printLine(`- ${suggestion}`);
    }
    return 0;
  }

  for (const stage of stages) {
    const item = await runWorkflowArtifact(runOpts, stage, {
      objective: `${opts.objective || `Execute ${stage} stage`} for ${opts.initiative || scope || 'default scope'}`,
      emitSkill: stage === 'compound' && opts.emitSkill ? opts.emitSkill : undefined,
      auto: runOpts.auto,
    });
    generated.push(item.artifact);
  }
  const payload = {
    success: true,
    mode,
    initiative: opts.initiative || '',
    artifacts: generated,
    count: generated.length,
    suggestedNext: [],
  };
  if (opts.json) {
    printJson(payload);
    return 0;
  }
  printLine(`Executed ${mode === 'auto' ? 'Plan→Work→Review→Compound' : mode} pipeline with ${payload.count} artifact(s).`);
  return 0;
}

async function runAgentGuard(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const agent = String(opts.agent || process.env.KAN_AGENT_ID || process.env.USER || process.env.USERNAME || '').trim();
  const state = pruneExpiredClaims(buildAgentClaimsState(await readAgentClaims(cwd)));
  const activeClaims = state.claims.filter((claim) => claim.agent !== agent);
  const changedFiles = listGitStatusFiles(cwd);
  const conflicts = [];

  for (const file of changedFiles) {
    for (const claim of activeClaims) {
      const overlapping = claim.scopes.some((scope) => fileMatchesScope(file, scope));
      if (!overlapping) {
        continue;
      }
      conflicts.push({
        file,
        claimedBy: claim.agent,
        scopes: claim.scopes.filter((scope) => fileMatchesScope(file, scope)),
      });
    }
  }

  const dedupe = new Map();
  for (const item of conflicts) {
    const key = `${item.file}::${item.claimedBy}`;
    if (!dedupe.has(key)) {
      dedupe.set(key, item);
    }
  }
  const unique = [...dedupe.values()];

  if (opts.json) {
    const payload = {
      success: unique.length === 0,
      agent,
      conflicts: unique,
      scanned: changedFiles.length,
    };
    printJson(payload);
    return unique.length === 0 ? 0 : 1;
  }

  if (unique.length === 0) {
    printLine(`No conflicts for agent ${agent}.`);
    return 0;
  }

  printLine(`Found ${unique.length} scoped conflicts for agent ${agent}:`);
  for (const item of unique) {
    const scopeText = item.scopes.join(', ');
    printLine(`- ${item.file} [claimed by ${item.claimedBy} via ${scopeText}]`);
  }
  return 1;
}

function calculateStale(days) {
  const now = Date.now();
  return now - days * 24 * 60 * 60 * 1000;
}

async function runHealth(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const config = await readConfig(cwd, opts.config || DEFAULT_CONFIG_NAME);
  const issues = [];
  const docs = await loadAllDocs(cwd, config, opts, issues);
  validateDocs(cwd, docs, issues);
  const split = splitIssues(issues);

  const byType = new Map();
  let staleCount = 0;
  const staleSince = calculateStale(config.cleanup?.staleDays || 90);
  const now = Date.now();

  for (const doc of docs) {
    byType.set(doc.type, (byType.get(doc.type) || 0) + 1);
    const updated = doc.data?.lastUpdated ? Date.parse(doc.data.lastUpdated) : now;
    if (Number.isNaN(updated) || updated < staleSince) {
      staleCount += 1;
    }
  }

  const summary = {
    total: docs.length,
    warnings: split.warnings.length,
    errors: split.errors.length,
    stale: staleCount,
    staleSinceDays: config.cleanup?.staleDays || 90,
    types: Object.fromEntries(byType),
    blocked: docs.filter((doc) => doc.data?.status === 'blocked').length,
    inProgress: docs.filter((doc) => doc.data?.status === 'in-progress').length,
  };

  if (opts.json) {
    printJson(summary);
    return summary.errors ? 1 : 0;
  }

  printLine('\nKanban Health');
  printLine(`- documents: ${summary.total}`);
  printLine(`- blocked: ${summary.blocked}`);
  printLine(`- in-progress: ${summary.inProgress}`);
  printLine(`- stale (${summary.staleSinceDays}d): ${summary.stale}`);
  printLine(`- quality: ${summary.errors ? `${summary.errors} errors` : 'ok'}, ${summary.warnings} warnings`);
  return summary.errors ? 1 : 0;
}

function startRecommendations(context) {
  const recommendations = [];
  if (!context.config.exists) {
    recommendations.push('Run `kan init --template starter` to bootstrap the starter contract.');
    return recommendations;
  }

  if (context.config.error) {
    recommendations.push(`Fix configuration at ${context.config.path} and rerun this command.`);
  }

  if (!context.hasGuardWorkflow && !context.isStarterRepo) {
    recommendations.push('Run `kan agent init --workflow` to enforce scope guard on pull requests.');
  }
  if (!context.hasCompoundWorkflow && !context.isStarterRepo) {
    recommendations.push('Run `kan agent init --workflow` to enable post-merge compound autopilot.');
  }
  if (!context.plugins.includes('compound-engineering')) {
    recommendations.push('Run `kan plugin install compound-engineering` for full autonomy loop support.');
  }

  if (context.config.isHealthy && context.collections.every((entry) => entry.exists)) {
    recommendations.push('Run `kan lint --json` for baseline validation.');
  } else {
    recommendations.push('Fix missing collection paths in kan.config.json and rerun `kan start --json`.');
  }

  return recommendations;
}

function buildStartPayload(cwd, context) {
  return {
    success: context.config.exists && context.config.isHealthy,
    timestamp: new Date().toISOString(),
    command: 'kan start',
    version,
    context: {
      cwd,
      isStarterRepo: context.isStarterRepo,
      config: {
        path: context.config.path,
        exists: context.config.exists,
        isHealthy: context.config.isHealthy,
        hasError: Boolean(context.config.error),
      },
      gitRoot: context.gitRoot || null,
      hasGitRoot: Boolean(context.gitRoot),
      collections: context.collections,
      workflows: {
        scopeGuard: context.hasGuardWorkflow,
        compoundAutopilot: context.hasCompoundWorkflow,
      },
      plugins: context.plugins,
      pluginRegistryPath: context.pluginRegistry.path,
      pluginRegistryUpdatedAt: context.pluginRegistry.updatedAt,
      governanceHints: ['single-path commands', 'agent scope locking active in multi-agent flows'],
    },
    capabilities: START_CAPABILITIES,
    recommendedNext: context.recommendedNext,
    errors: context.config.error ? [context.config.error] : [],
  };
}

async function runStart(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const configPath = opts.config || DEFAULT_CONFIG_NAME;
  const absoluteConfigPath = path.resolve(cwd, configPath);
  const isStarterRepo = await fileExists(path.join(cwd, STARTER_MARKER_PATH));

  let gitRoot = null;
  try {
    gitRoot = await readGitRoot(cwd);
  } catch (error) {
    gitRoot = null;
  }

  const pluginRegistry = await readPluginRegistry(cwd);
  const plugins = pluginRegistry.installed.map((entry) => String(entry.name || entry).trim()).filter(Boolean);
  const hasGuardWorkflow = await fileExists(path.resolve(cwd, AGENT_SCOPE_GUARD_WORKFLOW_PATH));
  const hasCompoundWorkflow = await fileExists(path.resolve(cwd, AGENT_COMPOUND_AUTOPILOT_WORKFLOW_PATH));

  const configExists = await fileExists(absoluteConfigPath);
  let configError = null;
  let config = null;
  const collections = [];

  if (configExists) {
    try {
      config = await readConfig(cwd, configPath);
      for (const [name, collection] of Object.entries(config.collections || {})) {
        const absoluteCollectionPath = path.resolve(cwd, collection.path);
        collections.push({
          name,
          path: collection.path,
          type: collection.type,
          exists: await fileExists(absoluteCollectionPath),
        });
      }
    } catch (error) {
      configError = {
        code: error.code || 'config/invalid',
        message: error.message,
      suggestedNext: error.suggestedNext || ['Fix kan.config.json and rerun `kan start --json`.'],
      };
    }
  }

  const context = {
    isStarterRepo,
    gitRoot,
    pluginRegistry,
    plugins,
    hasGuardWorkflow,
    hasCompoundWorkflow,
    config: {
      path: absoluteConfigPath,
      exists: configExists,
      isHealthy: Boolean(config),
      error: configError,
    },
    collections,
  };

  context.recommendedNext = startRecommendations(context);

  const payload = buildStartPayload(cwd, context);

  if (opts.json) {
    if (configError) {
      payload.errors = payload.errors.length ? payload.errors : [configError];
    }
    printJson(payload);
    return 0;
  }

  printLine('Kanban start context snapshot:');
  printLine(`- cwd: ${cwd}`);
  printLine(`- gitRoot: ${payload.context.gitRoot || 'not-in-git-root'}`);
  printLine(`- version: ${version}`);
  printLine(`- starter repo: ${payload.context.isStarterRepo ? 'yes' : 'no'}`);
  printLine(`- config: ${payload.context.config.path} (${payload.context.config.exists ? 'found' : 'missing'})`);
  if (context.config.error) {
    printLine(`- config error: ${context.config.error.message}`);
  }
  if (context.collections.length > 0) {
    printLine('Collections:');
    for (const entry of context.collections) {
      printLine(`- ${entry.name} (${entry.type}): ${entry.path} [${entry.exists ? 'ok' : 'missing'}]`);
    }
  }
  printLine('Capabilities for agents:');
  for (const capability of START_CAPABILITIES) {
    printLine(`- ${capability.id}: ${capability.description}`);
    printLine(`  command: ${capability.command}`);
  }
  if (payload.recommendedNext.length > 0) {
    printLine('Recommended next commands:');
    for (const recommendation of payload.recommendedNext) {
      printLine(`- ${recommendation}`);
    }
  }
  return 0;
}

async function runQuery(opts) {
  const cwd = path.resolve(opts.cwd || '.');
  const config = await readConfig(cwd, opts.config || DEFAULT_CONFIG_NAME);
  const issues = [];
  const docs = await loadAllDocs(cwd, config, opts, issues);
  validateDocs(cwd, docs, issues);
  const recordSet = docs.map(toQueryRecord);
  const selectors = [];
  if (opts.collection) {
    selectors.push(`select(.collection == ${JSON.stringify(opts.collection)})`);
  }
  if (opts.type) {
    selectors.push(`select(.type == ${JSON.stringify(opts.type)})`);
  }
  if (opts.where) {
    selectors.push(buildWhereExpressionOrThrow(opts.where));
  }
  const baseQuery = opts.expr ? String(opts.expr).trim() : '';
  const queryExpression = [baseQuery, ...selectors].filter(Boolean).join(' | ');

  let queryResults;
  try {
    queryResults = executeQuery(recordSet, queryExpression);
  } catch (error) {
    if (error instanceof ClassifiedError) {
      throw error;
    }
    throw new ClassifiedError({
      code: 'query/execute',
      message: `Unable to execute query: ${error.message}`,
      context: {
        query: queryExpression,
        collectionSize: recordSet.length,
      },
      suggestedNext: suggestedNextForIssue('query/execute', { query: queryExpression }),
    });
  }
  const split = splitIssues(issues);
  const payload = {
    success: split.errors.length === 0,
    data: queryResults,
    count: Array.isArray(queryResults) ? queryResults.length : 0,
    errors: split.errors,
    warnings: split.warnings,
    query: queryExpression,
  };

  if (opts.json) {
    printJson(payload);
    return payload.success ? 0 : 1;
  }

  if (!queryResults || queryResults.length === 0) {
    printLine('No matching documents.');
    return payload.success ? 0 : 1;
  }
  if (Array.isArray(queryResults) && queryResults.length > 0 && typeof queryResults[0] === 'object' && queryResults[0] !== null) {
    printLine(`Found ${queryResults.length} matching documents:`);
    for (const item of queryResults) {
      const file = item.file || item._file || '';
      const id = item.id || '';
      const status = item.status || '';
      const type = item.type || item._type || '';
      const collection = item.collection || item._collection || '';
      if (id || type || collection) {
        printLine(`- [${status}] ${id} (${type} in ${collection}) :: ${file}`);
      } else {
        printLine(`- ${JSON.stringify(item)}`);
      }
    }
    return payload.success ? 0 : 1;
  }

  if (Array.isArray(queryResults)) {
    for (const item of queryResults) {
      printLine(`- ${item}`);
    }
    return payload.success ? 0 : 1;
  }

  printLine(`Result: ${queryResults}`);
  return payload.success ? 0 : 1;
}

export async function run(argv = process.argv) {
  const program = new Command();
  program
    .name('kan')
    .description('Kanban-as-Code starter CLI')
    .version(version);

  program
    .command('init')
    .description('Initialize a starter kanban+docs workspace from a template')
    .option('--skeleton', 'create only empty kanban/docs skeleton folders with agents.md placeholders')
    .option('--template <name>', 'template name to use', 'starter')
    .option('--root <path>', 'target root directory', '.')
    .option('--force', 'overwrite existing files')
    .action(async (options) => {
      try {
        await runInit(options);
      } catch (error) {
        printLine(`[ERROR] ${error.message}`);
        process.exitCode = 1;
      }
    });

  program
    .command('start')
    .description('Emit context snapshot and capability inventory for agent sessions')
    .option('--config <path>', 'config file', DEFAULT_CONFIG_NAME)
    .option('--cwd <path>', 'working directory', '.')
    .option('--json', 'json output')
    .action(async (options) => {
      try {
        process.exitCode = await runStart(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayloadFromError(error, 'cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
        process.exitCode = 1;
      }
    });

  program
    .command('lint')
    .description('Validate all documents for schema and reference health')
    .option('--config <path>', 'config file', DEFAULT_CONFIG_NAME)
    .option('--cwd <path>', 'working directory', '.')
    .option('--json', 'json output')
    .action(async (options) => {
      try {
        process.exitCode = await runLint(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayloadFromError(error, 'cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
        process.exitCode = 1;
      }
    });

  program
    .command('build')
    .description('Compile validated markdown documents into JSON')
    .option('--config <path>', 'config file', DEFAULT_CONFIG_NAME)
    .option('--cwd <path>', 'working directory', '.')
    .option('--out <path>', 'output directory')
    .option('--json', 'json output')
    .option('--include-archived', 'include archived documents')
    .action(async (options) => {
      try {
        process.exitCode = await runBuild(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayloadFromError(error, 'cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
        process.exitCode = 1;
      }
    });

  program
    .command('health')
    .description('Summarize health metrics for the current repository')
    .option('--config <path>', 'config file', DEFAULT_CONFIG_NAME)
    .option('--cwd <path>', 'working directory', '.')
    .option('--json', 'json output')
    .action(async (options) => {
      try {
        process.exitCode = await runHealth(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayloadFromError(error, 'cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
        process.exitCode = 1;
      }
    });

  program
    .command('query [expr]')
    .description('Run jq-style queries against loaded documents')
    .option('--config <path>', 'config file', DEFAULT_CONFIG_NAME)
    .option('--cwd <path>', 'working directory', '.')
    .option('--collection <name>', 'filter by collection')
    .option('--type <type>', 'filter by type')
    .option('--where <expr>', 'simple filter, e.g. status=in-progress or status == "in-progress"')
    .option('--json', 'json output')
    .action(async (expr, options) => {
      options.expr = expr;
      try {
        process.exitCode = await runQuery(options);
      } catch (error) {
        const isQueryParse = error instanceof ClassifiedError && error.code === 'query/parse';
        const payload = commandFailurePayloadFromError(error, isQueryParse ? 'query/parse' : 'query/execute');
        if (!payload.errors[0].suggestedNext || payload.errors[0].suggestedNext.length === 0) {
          payload.errors[0].suggestedNext = isQueryParse
            ? suggestedNextForIssue('query/parse')
            : suggestedNextForIssue('query/execute');
        }
        if (options.json) {
          printJson(payload);
        } else {
          printLine(`[ERROR] ${payload.errors[0].message}`);
          for (const suggestion of payload.errors[0].suggestedNext) {
            printLine(`suggestedNext: ${suggestion}`);
          }
        }
        process.exitCode = 1;
      }
    });

  program
    .command('evolve <target>')
    .description('Advance a document status in a stable progression')
    .option('--to <status>', 'explicit status to set')
    .option('--agent <name>', 'agent id used for claim enforcement')
    .option('--force', 'bypass active scope conflict checks')
    .option('--dry-run', 'preview evolution without writing')
    .option('--config <path>', 'config file', DEFAULT_CONFIG_NAME)
    .option('--cwd <path>', 'working directory', '.')
    .option('--json', 'json output')
    .action(async (target, options) => {
      options.target = target;
      try {
        process.exitCode = await runEvolve(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayloadFromError(error, 'cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
        process.exitCode = 1;
      }
    });

  program
    .command('mv <source> <destination>')
    .description('Move a document safely across workspace paths')
    .option('--agent <name>', 'agent id used for claim enforcement')
    .option('--dry-run', 'preview move without writing')
    .option('--force', 'overwrite destination path')
    .option('--config <path>', 'config file', DEFAULT_CONFIG_NAME)
    .option('--cwd <path>', 'working directory', '.')
    .option('--json', 'json output')
    .action(async (source, destination, options) => {
      options.source = source;
      options.destination = destination;
      try {
        process.exitCode = await runMv(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayloadFromError(error, 'cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
        process.exitCode = 1;
      }
    });

  program
    .command('rm <target>')
    .description('Archive a document by default, or delete with --hard')
    .option('--agent <name>', 'agent id used for claim enforcement')
    .option('--hard', 'delete file instead of archiving')
    .option('--status <status>', 'archive status when not hard deleting')
    .option('--dry-run', 'preview removal without writing')
    .option('--config <path>', 'config file', DEFAULT_CONFIG_NAME)
    .option('--cwd <path>', 'working directory', '.')
    .option('--json', 'json output')
    .action(async (target, options) => {
      options.target = target;
      try {
        process.exitCode = await runRm(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayloadFromError(error, 'cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
        process.exitCode = 1;
      }
    });

  const agentCommand = program.command('agent').description('Coordinate workspace ownership when multiple agents work in parallel');
  agentCommand
    .command('status')
    .description('List active and past claim records')
    .option('--config <path>', 'config file', DEFAULT_CONFIG_NAME)
    .option('--cwd <path>', 'working directory', '.')
    .option('--agent <name>', 'filter by agent')
    .option('--all', 'include expired claims')
    .option('--json', 'json output')
    .action(async (options) => {
      try {
        await runAgentStatus(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayloadFromError(error, 'agent-cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
      }
    });

  agentCommand
    .command('claim [target]')
    .description('Claim scoped ownership of paths from a task target or explicit scope')
    .option('--agent <name>', 'agent name')
    .option('--scope <path>', 'path prefix to claim (repeatable)', collectArg, [])
    .option('--ttl-hours <hours>', 'claim TTL in hours', `${DEFAULT_AGENT_TTL_HOURS}`)
    .option('--note <text>', 'optional note')
    .option('--force', 'override overlap conflicts (team agreement required)')
    .option('--config <path>', 'config file', DEFAULT_CONFIG_NAME)
    .option('--cwd <path>', 'working directory', '.')
    .option('--json', 'json output')
    .action(async (target, options) => {
      options.target = target;
      try {
        await runAgentClaim(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayloadFromError(error, 'agent-cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
      }
    });

  agentCommand
    .command('unclaim')
    .description('Release scoped ownership')
    .option('--agent <name>', 'agent name')
    .option('--all', 'release all scopes for agent')
    .option('--scope <path>', 'scope to release (repeatable)', collectArg, [])
    .option('--config <path>', 'config file', DEFAULT_CONFIG_NAME)
    .option('--cwd <path>', 'working directory', '.')
    .option('--json', 'json output')
    .action(async (options) => {
      try {
        await runAgentUnclaim(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayloadFromError(error, 'agent-cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
      }
    });

  agentCommand
    .command('guard')
    .description('Check git-local changes against active claims from other agents')
    .option('--agent <name>', 'agent name')
    .option('--config <path>', 'config file', DEFAULT_CONFIG_NAME)
    .option('--cwd <path>', 'working directory', '.')
    .option('--json', 'json output')
    .action(async (options) => {
      try {
        process.exitCode = await runAgentGuard(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayloadFromError(error, 'agent-cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
        process.exitCode = 1;
      }
    });

  agentCommand
    .command('prune')
    .description('Remove expired entries, optionally for one agent')
    .option('--agent <name>', 'limit by agent')
    .option('--all', 'remove all claims entirely')
    .option('--config <path>', 'config file', DEFAULT_CONFIG_NAME)
    .option('--cwd <path>', 'working directory', '.')
    .option('--json', 'json output')
    .action(async (options) => {
      try {
        process.exitCode = await runAgentPrune(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayloadFromError(error, 'agent-cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
        process.exitCode = 1;
      }
    });

  agentCommand
    .command('init')
  .description('Generate local agent bootstrap script and PR workflow files')
    .option('--workflow', 'force creation of the PR scope-guard workflow file')
    .option('--force', 'overwrite bootstrap files if they already exist')
    .option('--no-workflow', 'skip PR scope-guard workflow generation')
    .option('--cwd <path>', 'working directory', '.')
    .option('--json', 'json output')
    .action(async (options) => {
      options.rawArgs = process.argv.slice(2);
      try {
        process.exitCode = await runAgentsInit(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayloadFromError(error, 'agent-cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
        process.exitCode = 1;
      }
    });

  agentCommand
    .command('worktree [agent]')
    .description('Create a git worktree for one agent')
    .option('--agent <name>', 'agent name')
    .option('--branch <name>', 'branch name')
    .option('--path <path>', 'explicit path for new worktree')
    .option('--cwd <path>', 'working directory', '.')
    .option('--json', 'json output')
    .action(async (agentArg, options) => {
      options.agent = options.agent || agentArg;
      try {
        process.exitCode = await runAgentsWorktree(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayloadFromError(error, 'agent-cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
        process.exitCode = 1;
      }
    });

  const addLoopOptions = (command, includeArtifactOptions = true) => {
    command
      .option('--stage <stage>', 'run a single stage (plan|work|review|compound) or auto/full for complete loop')
      .option('--initiative <id>', 'initiative id for this loop record')
      .option('--scope <path>', 'scope path for coordination');
  if (includeArtifactOptions) {
    command
      .option('--objective <text>', 'high-level objective for the stage')
      .option('--result <text>', 'stage outcome or implementation summary')
      .option('--auto', 'run in automated mode')
      .option('--note <text>', 'note entry', collectArg, [])
      .option('--evidence <text>', 'evidence entry', collectArg, [])
      .option('--tag <tag>', 'tag to attach', collectArg, [])
      .option('--status <status>', 'artifact status')
      .option('--promote', 'append learnings to docs/brainstorms/system-prompts.md')
      .option('--emit-skill [name]', 'emit reusable agent skill file')
      .option('--force-skill', 'replace existing emitted skill file')
      .option('--skip-plugin-check', 'run loop without plugin installed')
      .option('--dry-run', 'capture without writing files');
  }
  command.option('--cwd <path>', 'working directory', '.').option('--json', 'json output');
  return command;
};

  addLoopOptions(program.command('loop'), true)
    .description('Run the full Plan→Work→Review→Compound flow (or a single stage)')
    .action(async (options) => {
      try {
        process.exitCode = await runWorkflowLoop(options);
      } catch (error) {
        const payload = commandFailurePayloadFromError(error, 'workflow-cmd/failure');
        if (!payload.errors[0].suggestedNext || payload.errors[0].suggestedNext.length === 0) {
          payload.errors[0].suggestedNext = ['Run kan plugin install compound-engineering'];
        }
        if (options.json) {
          printJson(payload);
        } else {
          printLine(`[ERROR] ${payload.errors[0].message}`);
          for (const suggestion of payload.errors[0].suggestedNext) {
            printLine(`suggestedNext: ${suggestion}`);
          }
        }
        process.exitCode = 1;
      }
    });

  const pluginCommand = program
    .command('plugin')
    .description('Install and inspect kan plugins');
  pluginCommand
    .command('list')
    .description('List built-in and installed kan plugins')
    .option('--cwd <path>', 'working directory', '.')
    .option('--json', 'json output')
    .action(async (options) => {
      try {
        process.exitCode = await runPluginList(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayload(error.message, 'plugin-cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
        process.exitCode = 1;
      }
    });

  pluginCommand
  .command('install <name>')
    .description('Install a local plugin')
    .option('--force', 'overwrite existing plugin files')
    .option('--cwd <path>', 'working directory', '.')
    .option('--json', 'json output')
    .action(async (name, options) => {
      options.name = name;
      try {
        process.exitCode = await runPluginInstall(options);
      } catch (error) {
        if (options.json) {
          printJson(commandFailurePayload(error.message, 'plugin-cmd/failure'));
        } else {
          printLine(`[ERROR] ${error.message}`);
        }
        process.exitCode = 1;
      }
    });

  await program.parseAsync(argv);
}
