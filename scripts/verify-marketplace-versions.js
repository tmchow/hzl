#!/usr/bin/env node
/**
 * Verifies that all marketplace/plugin JSON files have consistent versions.
 * Run this after sync-versions.js to catch regressions.
 *
 * Usage: node scripts/verify-marketplace-versions.js [expected-version]
 *
 * If expected-version is provided, all files must match it.
 * If not provided, all files must match each other.
 */
const fs = require('fs');

const marketplaceFiles = [
  { path: './.claude-plugin/marketplace.json', versionPath: 'metadata.version' },
  { path: './packages/hzl-marketplace/.claude-plugin/marketplace.json', versionPath: 'metadata.version' },
  { path: './packages/hzl-marketplace/plugins/hzl/.claude-plugin/plugin.json', versionPath: 'version' }
];

const expectedVersion = process.argv[2];
const versions = [];
let hasError = false;

for (const { path: filePath, versionPath } of marketplaceFiles) {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: File not found: ${filePath}`);
    hasError = true;
    continue;
  }

  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const version = versionPath.split('.').reduce((obj, key) => obj?.[key], json);

  if (!version) {
    console.error(`ERROR: No version found at ${versionPath} in ${filePath}`);
    hasError = true;
    continue;
  }

  versions.push({ filePath, version });
  console.log(`${filePath}: ${version}`);
}

// Also check plugin versions in marketplace files
for (const { path: filePath } of marketplaceFiles.slice(0, 2)) {
  if (!fs.existsSync(filePath)) continue;

  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (json.plugins) {
    for (const plugin of json.plugins) {
      versions.push({ filePath: `${filePath} -> plugins[${plugin.name}]`, version: plugin.version });
      console.log(`${filePath} -> plugins[${plugin.name}]: ${plugin.version}`);
    }
  }
}

if (hasError) {
  process.exit(1);
}

// Verify all versions match
const uniqueVersions = [...new Set(versions.map(v => v.version))];

if (expectedVersion) {
  const mismatches = versions.filter(v => v.version !== expectedVersion);
  if (mismatches.length > 0) {
    console.error(`\nERROR: Expected version ${expectedVersion}, but found mismatches:`);
    for (const { filePath, version } of mismatches) {
      console.error(`  ${filePath}: ${version}`);
    }
    process.exit(1);
  }
  console.log(`\nAll versions match expected: ${expectedVersion}`);
} else if (uniqueVersions.length > 1) {
  console.error(`\nERROR: Version mismatch detected. Found versions: ${uniqueVersions.join(', ')}`);
  process.exit(1);
} else {
  console.log(`\nAll versions consistent: ${uniqueVersions[0]}`);
}
