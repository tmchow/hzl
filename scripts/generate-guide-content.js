#!/usr/bin/env node

/**
 * Generate guide content from snippets/AGENT-POLICY.md
 *
 * This script reads the AGENT-POLICY.md snippet and generates a TypeScript
 * file that can be imported by the hzl guide command.
 *
 * Run during build: node scripts/generate-guide-content.js
 */

const fs = require('fs');
const path = require('path');

const SNIPPET_PATH = path.join(__dirname, '..', 'snippets', 'AGENT-POLICY.md');
const OUTPUT_PATH = path.join(__dirname, '..', 'packages', 'hzl-cli', 'src', 'commands', 'guide-content.ts');

function main() {
  if (!fs.existsSync(SNIPPET_PATH)) {
    console.error(`ERROR: Snippet not found: ${SNIPPET_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(SNIPPET_PATH, 'utf8').trim();

  // Escape backticks and ${} for template literal
  const escaped = content
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');

  const output = `// Auto-generated from snippets/AGENT-POLICY.md
// Do not edit directly - edit the source snippet instead

export const GUIDE_CONTENT = \`${escaped}\`;
`;

  fs.writeFileSync(OUTPUT_PATH, output);
  console.log(`Generated: ${OUTPUT_PATH}`);
}

main();
