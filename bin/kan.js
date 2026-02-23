#!/usr/bin/env node
import { run } from '../src/cli.js';

run(process.argv).catch((error) => {
  process.stderr.write(`[ERROR] ${error.message}\n`);
  process.exitCode = 1;
});
