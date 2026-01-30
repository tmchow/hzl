#!/usr/bin/env node
const fs = require('fs');
const version = process.argv[2];

if (!version) {
  console.error('Usage: node sync-versions.js <version>');
  process.exit(1);
}

// Update hzl-cli's dependency on hzl-core
const cliPkgPath = './packages/hzl-cli/package.json';
const pkg = JSON.parse(fs.readFileSync(cliPkgPath, 'utf8'));
pkg.dependencies['hzl-core'] = `^${version}`;
fs.writeFileSync(cliPkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`Updated hzl-cli's hzl-core dependency to ^${version}`);
