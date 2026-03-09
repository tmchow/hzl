const { execFileSync } = require('node:child_process');

const STAGED_TS_PATTERN = /\.(?:ts|mts|cts)$/;

function runGit(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function getUpstreamRef() {
  try {
    return runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  } catch {
    try {
      runGit(['rev-parse', '--verify', 'origin/main']);
      return 'origin/main';
    } catch {
      return null;
    }
  }
}

function getDiffFiles(args) {
  const output = runGit(args);
  if (output.length === 0) {
    return [];
  }

  return output
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
}

function getCandidateFiles() {
  const args = process.argv.slice(2);

  if (args.length === 1 && args[0] === '--cached') {
    return getDiffFiles(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
  }

  if (args.length === 1 && args[0] === '--since-upstream') {
    const upstreamRef = getUpstreamRef();
    if (!upstreamRef) {
      return [];
    }

    return getDiffFiles(['diff', '--name-only', '--diff-filter=ACMR', `${upstreamRef}...HEAD`]);
  }

  if (args.length > 0) {
    return args;
  }

  return getDiffFiles(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
}

function shouldRestageFiles() {
  return process.argv.length === 3 && process.argv[2] === '--cached';
}

const files = Array.from(
  new Set(getCandidateFiles().filter((file) => STAGED_TS_PATTERN.test(file))),
);

if (files.length === 0) {
  process.exit(0);
}

execFileSync('pnpm', ['exec', 'eslint', '--fix', ...files], {
  stdio: 'inherit',
});

if (shouldRestageFiles()) {
  execFileSync('git', ['add', ...files], {
    stdio: 'inherit',
  });
}
