/**
 * @fileoverview Future work and technical debt ledger source wrapper.
 *
 * Source-of-truth for implementation priorities is now machine-readable JSON in
 * `future-ledger.json` and validated with `future-ledger.schema.json`.
 *
 * This module exists for local code discovery and optional programmatic imports.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const futureLedger = require('../future-ledger.json');

/**
 * Canonical ledger export for tooling that prefers JS imports.
 *
 * @returns canonical future/debt registry entries.
 */
export const ledger = futureLedger;

/** @type {typeof futureLedger.items} */
export const futureItems = futureLedger.items.filter((entry) => entry.kind === 'future');

/** @type {typeof futureLedger.items} */
export const technicalDebtItems = futureLedger.items.filter((entry) => entry.kind === 'technicalDebt');
