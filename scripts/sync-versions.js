#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const version = process.argv[2];

if (!version) {
  console.error('Usage: node sync-versions.js <version>');
  process.exit(1);
}

// Replace workspace:* dependencies with actual version numbers
// This is required because @semantic-release/npm uses npm publish internally,
// and npm doesn't understand pnpm's workspace:* protocol
const packages = ['hzl-core', 'hzl-cli', 'hzl-web'];

for (const pkg of packages) {
  const pkgJsonPath = path.join('./packages', pkg, 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

  let modified = false;

  // Check dependencies
  if (pkgJson.dependencies) {
    for (const [dep, ver] of Object.entries(pkgJson.dependencies)) {
      if (ver === 'workspace:*' && packages.includes(dep)) {
        pkgJson.dependencies[dep] = version;
        modified = true;
      }
    }
  }

  // Check devDependencies
  if (pkgJson.devDependencies) {
    for (const [dep, ver] of Object.entries(pkgJson.devDependencies)) {
      if (ver === 'workspace:*' && packages.includes(dep)) {
        pkgJson.devDependencies[dep] = version;
        modified = true;
      }
    }
  }

  if (modified) {
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
    console.log(`Replaced workspace:* deps in ${pkgJsonPath}`);
  }
}

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
