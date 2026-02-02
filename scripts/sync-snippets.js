#!/usr/bin/env node

/**
 * Sync documentation snippets into target files.
 *
 * NOTE: This script uses only Node.js stdlib (fs, path) - no npm install needed.
 * This is intentional to keep the GitHub Actions workflow simple.
 *
 * Scans specific paths for marker comments and fills them with snippet content.
 *
 * Markers:
 *   <!-- START docs/snippets/foo.md -->
 *   <!-- END docs/snippets/foo.md -->
 *
 * With code fence wrapper (for showing snippet as copyable code):
 *   <!-- START [code:md] docs/snippets/foo.md -->
 *   <!-- END [code:md] docs/snippets/foo.md -->
 *
 * Usage:
 *   node scripts/sync-snippets.js [--check]
 *
 * Options:
 *   --check  Exit with code 1 if files would change (for CI validation)
 */

const fs = require('fs');
const path = require('path');

// Root-level files to scan
const ROOT_FILES = [
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'CODEX.md',
];

// Directories to scan recursively for .md files
const SCAN_DIRS = ['docs'];

// Marker patterns
const START_MARKER = /<!--\s*START\s*(\[code:(\w+)\])?\s*(docs\/snippets\/[\w\-\/]+\.md)\s*-->/;
const END_MARKER = /<!--\s*END\s*(\[code:\w+\])?\s*(docs\/snippets\/[\w\-\/]+\.md)\s*-->/;

function findMarkdownFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden directories and node_modules
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        findMarkdownFiles(fullPath, files);
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function findTargetFiles() {
  const files = [];

  // Add root-level files that exist
  for (const file of ROOT_FILES) {
    if (fs.existsSync(file)) {
      files.push(file);
    }
  }

  // Scan directories for .md files
  for (const dir of SCAN_DIRS) {
    findMarkdownFiles(dir, files);
  }

  return files;
}

function processFile(filePath, snippetCache, checkOnly) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const output = [];
  let changed = false;
  let i = 0;
  let inCodeFence = false;

  while (i < lines.length) {
    const line = lines[i];

    // Track code fence state (``` or ~~~)
    if (/^```|^~~~/.test(line.trim())) {
      inCodeFence = !inCodeFence;
    }

    const startMatch = line.match(START_MARKER);

    // Only process markers outside of code fences
    if (startMatch && !inCodeFence) {
      const codeFenceType = startMatch[2]; // e.g., 'md', 'txt', or undefined
      const snippetPath = startMatch[3]; // e.g., 'docs/snippets/agent-policy.md'

      // Find the corresponding END marker
      let endIndex = i + 1;
      while (endIndex < lines.length) {
        if (END_MARKER.test(lines[endIndex])) {
          break;
        }
        endIndex++;
      }

      if (endIndex >= lines.length) {
        console.error(`ERROR: No END marker found for ${snippetPath} in ${filePath}`);
        process.exit(1);
      }

      // Load snippet content
      if (!snippetCache[snippetPath]) {
        if (!fs.existsSync(snippetPath)) {
          console.error(`ERROR: Snippet not found: ${snippetPath} (referenced in ${filePath})`);
          process.exit(1);
        }
        snippetCache[snippetPath] = fs.readFileSync(snippetPath, 'utf8').trim();
      }
      const snippetContent = snippetCache[snippetPath];

      // Build the new content between markers
      // If [code:X] modifier present, wrap in code fence
      const warningLine = `<!-- ⚠️ DO NOT EDIT - Auto-generated from ${snippetPath} -->`;
      const snippetBody = codeFenceType
        ? `\`\`\`${codeFenceType}\n${snippetContent}\n\`\`\``
        : snippetContent;
      const newContent = `${warningLine}\n${snippetBody}`;

      // Check if content changed
      const oldContent = lines.slice(i + 1, endIndex).join('\n');
      if (oldContent !== newContent) {
        changed = true;
      }

      // Output: start marker, warning + content, end marker
      output.push(line); // START marker
      output.push(newContent); // includes warning line + snippet body
      output.push(lines[endIndex]); // END marker

      i = endIndex + 1;
    } else {
      output.push(line);
      i++;
    }
  }

  const newFileContent = output.join('\n');

  if (changed) {
    if (checkOnly) {
      console.log(`CHANGED: ${filePath}`);
    } else {
      fs.writeFileSync(filePath, newFileContent);
      console.log(`Updated: ${filePath}`);
    }
  }

  return changed;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const files = findTargetFiles();
  const snippetCache = {};
  let anyChanged = false;

  console.log(`Scanning ${files.length} files for snippet markers...`);

  for (const file of files) {
    const changed = processFile(file, snippetCache, checkOnly);
    if (changed) anyChanged = true;
  }

  if (checkOnly && anyChanged) {
    console.error('\nSnippets out of sync. Run: node scripts/sync-snippets.js');
    process.exit(1);
  }

  if (!anyChanged) {
    console.log('All snippets up to date.');
  }
}

main();
