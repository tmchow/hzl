#!/usr/bin/env node
const fs = require('fs');
const version = process.argv[2];

if (!version) {
  console.error('Usage: node sync-versions.js <version>');
  process.exit(1);
}

// Note: workspace:* dependencies are handled by pnpm publish natively.
// @anolilab/semantic-release-pnpm uses pnpm publish which automatically
// replaces workspace:* with actual version numbers at publish time.

// Copy root README to hzl-cli package for npm
fs.copyFileSync('./README.md', './packages/hzl-cli/README.md');
console.log('Copied README.md to packages/hzl-cli/');
