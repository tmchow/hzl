#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { generateCliManifest } = require('./cli-manifest-lib');

const DOC_PATH = path.resolve(__dirname, '..', 'docs-site', 'reference', 'cli.md');

function extractCommandLines(markdown) {
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('hzl '));
}

function hasCommandPrefix(line, commandPath) {
  return (
    line === commandPath ||
    line.startsWith(`${commandPath} `) ||
    line.startsWith(`${commandPath}\t`)
  );
}

async function main() {
  if (!fs.existsSync(DOC_PATH)) {
    console.error(`CLI docs file not found: ${DOC_PATH}`);
    process.exit(1);
  }

  const markdown = fs.readFileSync(DOC_PATH, 'utf8');
  const commandLines = extractCommandLines(markdown);
  const manifest = await generateCliManifest();
  const leafCommands = manifest.leaf_commands;
  const allCommands = manifest.commands.map((command) => command.path);
  const missing = [];
  const unknown = [];

  for (const leafCommand of leafCommands) {
    const documented = commandLines.some((line) => hasCommandPrefix(line, leafCommand));
    if (!documented) {
      missing.push(leafCommand);
    }
  }

  for (const line of commandLines) {
    if (line.startsWith('hzl --')) continue; // global option examples
    const recognized = allCommands.some((commandPath) => hasCommandPrefix(line, commandPath));
    if (!recognized) {
      unknown.push(line);
    }
  }

  const requiredGlobalLongOptions = manifest.global_options
    .map((option) => option.long)
    .filter((longFlag) => typeof longFlag === 'string' && longFlag.length > 0);
  const missingGlobalOptions = requiredGlobalLongOptions.filter(
    (flag) => !markdown.includes(flag)
  );

  if (missing.length > 0 || unknown.length > 0 || missingGlobalOptions.length > 0) {
    if (missing.length > 0) {
      console.error('Missing commands in docs-site/reference/cli.md:');
      for (const commandPath of missing) {
        console.error(`  - ${commandPath}`);
      }
      console.error('');
    }

    if (unknown.length > 0) {
      console.error('Unknown/undocumented command examples in docs-site/reference/cli.md:');
      for (const line of unknown) {
        console.error(`  - ${line}`);
      }
      console.error('');
    }

    if (missingGlobalOptions.length > 0) {
      console.error('Missing global options in docs-site/reference/cli.md:');
      for (const flag of missingGlobalOptions) {
        console.error(`  - ${flag}`);
      }
      console.error('');
    }

    console.error('CLI/docs parity check failed.');
    console.error('Update docs-site/reference/cli.md to match the current CLI command surface.');
    process.exit(1);
  }

  console.log('CLI/docs parity check passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
