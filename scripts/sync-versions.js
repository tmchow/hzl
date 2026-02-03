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
