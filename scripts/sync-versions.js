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

// Update Claude Code plugin version
const pluginJsonPath = './.claude-plugin/plugin.json';
if (fs.existsSync(pluginJsonPath)) {
  const json = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
  json.version = version;
  fs.writeFileSync(pluginJsonPath, JSON.stringify(json, null, 2) + '\n');
  console.log(`Updated ${pluginJsonPath} to ${version}`);
}

// Update marketplace.json plugin version
const marketplaceJsonPath = './.claude-plugin/marketplace.json';
if (fs.existsSync(marketplaceJsonPath)) {
  const json = JSON.parse(fs.readFileSync(marketplaceJsonPath, 'utf8'));
  if (json.plugins && json.plugins.length > 0) {
    json.plugins[0].version = version;
    fs.writeFileSync(marketplaceJsonPath, JSON.stringify(json, null, 2) + '\n');
    console.log(`Updated ${marketplaceJsonPath} plugin version to ${version}`);
  }
}
