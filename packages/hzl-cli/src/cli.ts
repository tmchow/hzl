#!/usr/bin/env node
// packages/hzl-cli/src/cli.ts
import { run } from './index.js';

run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
