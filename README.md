# HZL

<img src="./assets/hzl.png" alt="HZL mascot" width="320" />

## Shared Task Ledger for OpenClaw

HZL is a durable shared task ledger for OpenClaw and other multi-agent systems.

Each agent wake is a fresh session. HZL preserves continuity across those wakes so agents can:
- resume in-progress work safely,
- hand off with durable context,
- coordinate through shared project pools,
- and recover from stalled sessions.

## Install

### npm

```bash
npm install -g hzl-cli
hzl init
```

### Homebrew (macOS/Linux)

```bash
brew tap tmchow/hzl
brew install hzl
hzl init
```

## Stateless Agent Loop (Quick Example)

```bash
# 1) Session start: resume existing work or claim next
hzl workflow run start --agent clara --project writing

# 2) Record durable progress while working
hzl task checkpoint <task-id> "Draft complete, revising CTA section"

# 3) Handoff to a project pool (unassigned follow-on)
hzl workflow run handoff \
  --from <task-id> \
  --title "Schedule approved copy" \
  --project marketing

# 4) Host runtime drains completion hooks on a schedule
hzl hook drain
```

## Documentation

- [Get Started](https://www.hzl-tasks.com/getting-started/)
- [Workflows](https://www.hzl-tasks.com/workflows/)
- [Installation & OpenClaw Setup](https://www.hzl-tasks.com/getting-started/installation/)
- [CLI Reference](https://www.hzl-tasks.com/reference/cli/)
- [Concepts](https://www.hzl-tasks.com/concepts/)

Local preview:

```bash
pnpm install
pnpm docs:dev
```

## Packages

- [`hzl-cli`](https://www.npmjs.com/package/hzl-cli)
- [`hzl-core`](https://www.npmjs.com/package/hzl-core)
- [`hzl-web`](https://www.npmjs.com/package/hzl-web)

## Additional Resources

- [Experimental integrations](https://www.hzl-tasks.com/experimental-integrations/)
- [Contributing](./CONTRIBUTING.md)
- [Changelog](./CHANGELOG.md)
- [Manual Release Process](./docs/release-process.md)

## License

MIT
