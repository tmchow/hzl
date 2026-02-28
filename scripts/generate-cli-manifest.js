#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { generateCliManifest } = require('./cli-manifest-lib');

const DEFAULT_OUTPUT = path.resolve(__dirname, '..', 'docs', 'metadata', 'cli-manifest.json');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    output: DEFAULT_OUTPUT,
    check: false,
    stdout: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--check') {
      options.check = true;
      continue;
    }
    if (token === '--stdout') {
      options.stdout = true;
      continue;
    }
    if (token === '--output') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('--output requires a value');
      }
      options.output = path.resolve(process.cwd(), value);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

async function main() {
  const options = parseArgs();
  const manifest = await generateCliManifest();
  const json = `${JSON.stringify(manifest, null, 2)}\n`;

  if (options.stdout) {
    process.stdout.write(json);
  }

  const outputDir = path.dirname(options.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (options.check) {
    if (!fs.existsSync(options.output)) {
      console.error(`CLI manifest file missing: ${options.output}`);
      console.error('Run: node scripts/generate-cli-manifest.js');
      process.exit(1);
    }
    const existing = fs.readFileSync(options.output, 'utf8');
    if (existing !== json) {
      console.error(`CLI manifest out of date: ${options.output}`);
      console.error('Run: node scripts/generate-cli-manifest.js');
      process.exit(1);
    }
    console.log(`CLI manifest is up to date: ${options.output}`);
    return;
  }

  fs.writeFileSync(options.output, json);
  console.log(`Wrote CLI manifest: ${options.output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
