const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DIST_ENTRY = path.resolve(__dirname, '..', 'packages', 'hzl-cli', 'dist', 'index.js');

function normalizeOption(option) {
  return {
    flags: option.flags,
    short: option.short || null,
    long: option.long || null,
    required: Boolean(option.required),
    mandatory: Boolean(option.mandatory),
    optional: Boolean(option.optional),
    defaultValue:
      option.defaultValue === undefined || option.defaultValue === null
        ? null
        : option.defaultValue,
    description: option.description || '',
  };
}

function normalizeArgument(argument) {
  return {
    name: argument.name(),
    required: Boolean(argument.required),
    variadic: Boolean(argument.variadic),
    defaultValue:
      argument.defaultValue === undefined || argument.defaultValue === null
        ? null
        : argument.defaultValue,
  };
}

function commandPathStartsWith(pathValue, prefix) {
  return pathValue === prefix || pathValue.startsWith(`${prefix} `);
}

async function loadCliProgram() {
  if (!fs.existsSync(DIST_ENTRY)) {
    throw new Error(
      `CLI build artifact not found at ${DIST_ENTRY}. Run: pnpm --filter hzl-cli build`
    );
  }

  const cliModule = await import(pathToFileURL(DIST_ENTRY).href);
  if (!cliModule || typeof cliModule.createProgram !== 'function') {
    throw new Error('Unable to load createProgram from hzl-cli dist entry');
  }

  return cliModule.createProgram();
}

async function generateCliManifest() {
  const root = await loadCliProgram();
  const rootName = root.name();

  const commands = [];
  const walk = (command, parentTokens) => {
    for (const child of command.commands) {
      const pathTokens = [...parentTokens, child.name()];
      const pathValue = pathTokens.join(' ');
      const entry = {
        path: pathValue,
        description: child.description() || '',
        arguments: child.registeredArguments.map(normalizeArgument),
        options: child.options.map(normalizeOption),
        hasSubcommands: child.commands.length > 0,
      };
      commands.push(entry);
      walk(child, pathTokens);
    }
  };
  walk(root, [rootName]);

  commands.sort((a, b) => a.path.localeCompare(b.path));

  const leafCommands = commands
    .filter((command) => !commands.some((other) => other.path !== command.path && commandPathStartsWith(other.path, command.path)))
    .map((command) => command.path)
    .sort((a, b) => a.localeCompare(b));

  return {
    schema_version: 1,
    root: rootName,
    global_options: root.options.map(normalizeOption),
    commands,
    leaf_commands: leafCommands,
  };
}

module.exports = {
  DIST_ENTRY,
  generateCliManifest,
};
