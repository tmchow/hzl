# HZL Skills

Claude Code skills for AI agents using HZL task tracking.

## Installation

```bash
# Add the HZL marketplace
/plugin marketplace add tmchow/hzl

# Install the HZL plugin
/plugin install hzl@hzl-marketplace
```

## Skills

### hzl-task-management

Teaches effective HZL usage through scenario-based patterns:

- **Setting up** - Initialize HZL, create projects with stable identifiers
- **Breaking down work** - Decompose problems into tasks with dependencies
- **Working on tasks** - The claim → checkpoint → complete workflow
- **Multi-agent coordination** - Atomic claiming, leases, stuck recovery
- **Human oversight** - Monitoring progress, providing steering comments

The skill focuses on *when* and *how* to use HZL commands, not exhaustive documentation. For complete command options, use `hzl <command> --help`.

## Usage

Once installed, Claude Code automatically loads this skill when:
- Working on a project that uses HZL
- Breaking down work into tasks
- Claiming, checkpointing, or completing tasks
- Coordinating work across multiple agents

## License

MIT
