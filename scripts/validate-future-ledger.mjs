#!/usr/bin/env node
/**
 * Strict validator + machine-triage report for future-ledger.json.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const schema = require('../future-ledger.schema.json');
const ledger = require('../future-ledger.json');
const args = new Set(process.argv.slice(2));

const emitJson = args.has('--json');
const emitTriage = args.has('--triage');

function isObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDateTime(value) {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function failIf(condition, errors, path, field, message, code = 'ledger/validation') {
  if (!condition) {
    errors.push({ code, path, field, message });
  }
}

function hasAllowedKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value || {})) {
    if (!allowed.includes(key)) {
      errors.push({
        code: 'schema/unexpected-key',
        path,
        field: key,
        message: `Unexpected key ${key}`,
      });
    }
  }
}

function validate() {
  const errors = [];
  const summary = {
    totalItems: 0,
    openItems: 0,
    byKind: {},
    byStatus: {},
    byPriority: {},
    byOwner: {},
  };
  const result = {
    code: 'ledger/ok',
    success: true,
    message: 'Future ledger validated.',
    summary,
  };

  if (!isObject(ledger)) {
    failIf(false, errors, 'root', null, 'Ledger must be a JSON object.');
    return {
      ...result,
      success: false,
      code: 'ledger/invalid',
      message: 'Future ledger validation failed with 1 error.',
      errors,
    };
  }

  const rootSchema = schema?.properties || {};
  const itemSchema = schema?.$defs?.ledgerItem?.properties || {};
  const itemRequired = new Set(schema?.$defs?.ledgerItem?.required || []);
  const itemKeys = Object.keys(itemSchema);
  const itemEnums = {
    kind: itemSchema.kind?.enum || [],
    status: itemSchema.status?.enum || [],
    priority: itemSchema.priority?.enum || [],
    impact: itemSchema.impact?.enum || [],
    complexity: itemSchema.complexity?.enum || [],
    risk: itemSchema.risk?.enum || [],
    severity: itemSchema.severity?.enum || [],
    estimatedEffort: itemSchema.estimatedEffort?.enum || [],
  };
  const idPattern = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;

  hasAllowedKeys(ledger, ['schemaVersion', 'generatedAt', 'metadata', 'items'], 'root', errors);
  failIf(
    isNonEmptyString(ledger.schemaVersion)
      && ledger.schemaVersion === rootSchema.schemaVersion?.enum?.[0],
    errors,
    'root.schemaVersion',
    'schemaVersion',
    'schemaVersion missing or invalid.',
    'ledger/schema-version',
  );
  failIf(isDateTime(ledger.generatedAt), errors, 'root.generatedAt', 'generatedAt', 'generatedAt must be ISO date-time.', 'ledger/generated-at');

  const metadata = ledger.metadata;
  failIf(isObject(metadata), errors, 'root.metadata', 'metadata', 'metadata is required.');
  if (isObject(metadata)) {
    hasAllowedKeys(metadata, Object.keys(schema?.properties?.metadata?.properties || {}), 'root.metadata', errors);
    failIf(isNonEmptyString(metadata.source), errors, 'root.metadata.source', 'source', 'metadata.source is required.', 'ledger/metadata-source');
    failIf(isNonEmptyString(metadata.updatedBy), errors, 'root.metadata.updatedBy', 'updatedBy', 'metadata.updatedBy is required.', 'ledger/metadata-updatedBy');
    failIf(isNonEmptyString(metadata.createdBy), errors, 'root.metadata.createdBy', 'createdBy', 'metadata.createdBy is required.', 'ledger/metadata-createdBy');
    failIf(isNonEmptyString(metadata.generatedWith), errors, 'root.metadata.generatedWith', 'generatedWith', 'metadata.generatedWith is required.', 'ledger/metadata-generatedWith');
  }

  const items = ledger.items;
  failIf(Array.isArray(items), errors, 'root.items', 'items', 'items must be an array.');
  if (!Array.isArray(items)) {
    return {
      ...result,
      success: false,
      code: 'ledger/invalid',
      message: `Future ledger validation failed with ${errors.length} error(s).`,
      errors,
    };
  }

  summary.totalItems = items.length;
  const itemIds = new Set();
  const duplicateIds = new Set();
  const dependencyIds = new Set();

  for (let index = 0; index < items.length; index += 1) {
    const path = `items[${index}]`;
    const item = items[index];
    failIf(isObject(item), errors, path, null, 'Each ledger item must be an object.');
    if (!isObject(item)) {
      continue;
    }

    hasAllowedKeys(item, itemKeys, path, errors);
    for (const key of itemRequired) {
      failIf(item[key] !== undefined, errors, `${path}.${key}`, key, `${key} is required.`);
    }
    failIf(typeof item.id === 'string' && idPattern.test(item.id), errors, `${path}.id`, 'id', `id format invalid: ${item.id}`);
    if (typeof item.id === 'string') {
      if (itemIds.has(item.id)) {
        duplicateIds.add(item.id);
      } else {
        itemIds.add(item.id);
      }
    }
    failIf(itemSchema.kind?.enum?.includes(item.kind), errors, `${path}.kind`, 'kind', `kind must be one of ${itemEnums.kind.join(', ')}`);
    failIf(itemSchema.status?.enum?.includes(item.status), errors, `${path}.status`, 'status', `status must be one of ${itemEnums.status.join(', ')}`);
    failIf(itemSchema.priority?.enum?.includes(item.priority), errors, `${path}.priority`, 'priority', `priority must be one of ${itemEnums.priority.join(', ')}`);
    failIf(itemSchema.impact?.enum?.includes(item.impact), errors, `${path}.impact`, 'impact', `impact must be one of ${itemEnums.impact.join(', ')}`);
    failIf(itemSchema.complexity?.enum?.includes(item.complexity), errors, `${path}.complexity`, 'complexity', `complexity must be one of ${itemEnums.complexity.join(', ')}`);
    failIf(itemSchema.risk?.enum?.includes(item.risk), errors, `${path}.risk`, 'risk', `risk must be one of ${itemEnums.risk.join(', ')}`);
    failIf(isNonEmptyString(item.estimatedEffort) && itemSchema.estimatedEffort?.enum?.includes(item.estimatedEffort), errors, `${path}.estimatedEffort`, 'estimatedEffort', `estimatedEffort must be one of ${itemEnums.estimatedEffort.join(', ')}`);
    failIf(Array.isArray(item.fileHints) && item.fileHints.length > 0, errors, `${path}.fileHints`, 'fileHints', 'fileHints is required.');
    if (Array.isArray(item.fileHints)) {
      for (let i = 0; i < item.fileHints.length; i += 1) {
        failIf(isNonEmptyString(item.fileHints[i]), errors, `${path}.fileHints[${i}]`, 'fileHints', `fileHints[${i}] must be non-empty.`);
      }
    }
    failIf(Array.isArray(item.dependsOn), errors, `${path}.dependsOn`, 'dependsOn', 'dependsOn must be an array.');
    if (Array.isArray(item.dependsOn)) {
      for (let i = 0; i < item.dependsOn.length; i += 1) {
        const dep = item.dependsOn[i];
        failIf(typeof dep === 'string' && idPattern.test(dep), errors, `${path}.dependsOn[${i}]`, 'dependsOn', `Invalid dependency id: ${dep}`);
        if (typeof dep === 'string' && isNonEmptyString(dep)) {
          dependencyIds.add(dep);
        }
      }
    }
    failIf(isObject(item.source), errors, `${path}.source`, 'source', 'source is required.');
    if (isObject(item.source)) {
      failIf(isNonEmptyString(item.source.path), errors, `${path}.source.path`, 'source.path', 'source.path is required.');
      failIf(isNonEmptyString(item.source.anchor), errors, `${path}.source.anchor`, 'source.anchor', 'source.anchor is required.');
      failIf(isNonEmptyString(item.source.commit), errors, `${path}.source.commit`, 'source.commit', 'source.commit is required.');
    }
    failIf(Array.isArray(item.acceptanceCriteria) && item.acceptanceCriteria.length > 0, errors, `${path}.acceptanceCriteria`, 'acceptanceCriteria', 'acceptanceCriteria is required.');
    failIf(Array.isArray(item.nextActions) && item.nextActions.length > 0, errors, `${path}.nextActions`, 'nextActions', 'nextActions is required.');
    failIf(isDateTime(item.createdAt), errors, `${path}.createdAt`, 'createdAt', 'createdAt must be ISO date-time.');
    failIf(isDateTime(item.updatedAt), errors, `${path}.updatedAt`, 'updatedAt', 'updatedAt must be ISO date-time.');
    failIf(isNonEmptyString(item.title) && item.title.trim().length >= 5, errors, `${path}.title`, 'title', 'title is too short.');
    failIf(isNonEmptyString(item.rationale), errors, `${path}.rationale`, 'rationale', 'rationale is required.');
    if (item.severity !== undefined) {
      failIf(itemSchema.severity?.enum?.includes(item.severity), errors, `${path}.severity`, 'severity', `severity must be one of ${itemEnums.severity.join(', ')}`);
    }
    if (item.tags !== undefined) {
      failIf(Array.isArray(item.tags) && item.tags.length > 0, errors, `${path}.tags`, 'tags', 'tags cannot be empty when present.');
      if (Array.isArray(item.tags)) {
        for (let i = 0; i < item.tags.length; i += 1) {
          failIf(isNonEmptyString(item.tags[i]), errors, `${path}.tags[${i}]`, 'tags', `tag[${i}] must be non-empty.`);
        }
      }
    }

    if (item.status === 'open') {
      summary.openItems += 1;
    }
    if (item.kind) {
      summary.byKind[item.kind] = (summary.byKind[item.kind] || 0) + 1;
    }
    if (item.status) {
      summary.byStatus[item.status] = (summary.byStatus[item.status] || 0) + 1;
    }
    if (item.priority) {
      summary.byPriority[item.priority] = (summary.byPriority[item.priority] || 0) + 1;
    }
    if (item.owner) {
      summary.byOwner[item.owner] = (summary.byOwner[item.owner] || 0) + 1;
    }
  }

  for (const dep of dependencyIds) {
    if (!itemIds.has(dep)) {
      failIf(false, errors, 'root.items[*].dependsOn', 'dependsOn', `Unknown dependency: ${dep}`);
    }
  }
  for (const duplicateId of duplicateIds) {
    failIf(false, errors, 'root.items.id', 'id', `Duplicate id: ${duplicateId}`);
  }

  if (errors.length > 0) {
    return {
      ...result,
      code: 'ledger/invalid',
      success: false,
      message: `Future ledger validation failed with ${errors.length} error(s).`,
      errors,
    };
  }

  if (emitTriage) {
    const openItems = items.filter((item) => item.status === 'open').map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      priority: item.priority,
      owner: item.owner,
      nextActions: item.nextActions,
      fileHint: item.fileHints?.[0] || null,
    }));
    const topOpenByPriority = Object.entries(summary.byPriority).sort(([, a], [, b]) => b - a);
    return {
      ...result,
      triage: { openItems, topOpenByPriority },
    };
  }

  return result;
}

const result = validate();

if (emitJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  if (result.success) {
    console.log(result.message);
    if (emitTriage && result.triage) {
      console.log(`Open items: ${result.triage.openItems.length}`);
      for (const item of result.triage.openItems) {
        console.log(`- ${item.id} (${item.kind}) [${item.priority}]`);
      }
    }
  } else {
    console.error(result.message);
    for (const error of result.errors) {
      const at = `${error.path}${error.field ? `.${error.field}` : ''}`;
      console.error(`- ${error.code} (${at}): ${error.message}`);
    }
  }
}

if (!result.success) {
  process.exitCode = 1;
}
