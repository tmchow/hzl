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

// Copy root README to hzl-cli package for npm
fs.copyFileSync('./README.md', './packages/hzl-cli/README.md');
console.log('Copied README.md to packages/hzl-cli/');

// Update marketplace plugin versions
const marketplaceFiles = [
  './.claude-plugin/marketplace.json',
  './packages/hzl-marketplace/.claude-plugin/marketplace.json',
  './packages/hzl-marketplace/plugins/hzl/.claude-plugin/plugin.json'
];

for (const filePath of marketplaceFiles) {
  if (fs.existsSync(filePath)) {
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Update top-level version
    if (json.version) {
      json.version = version;
    }
    if (json.metadata?.version) {
      json.metadata.version = version;
    }

    // Update plugin versions in marketplace files
    if (json.plugins) {
      for (const plugin of json.plugins) {
        plugin.version = version;
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n');
    console.log(`Updated ${filePath} to ${version}`);
  }
}
