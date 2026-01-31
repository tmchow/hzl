# CLAUDE.md

This package is a Claude Code marketplace containing plugins and skills for HZL.

## Structure

```
hzl-marketplace/
├── .claude-plugin/
│   └── marketplace.json    # Marketplace manifest - lists all plugins
├── plugins/
│   └── <plugin-name>/
│       ├── .claude-plugin/
│       │   └── plugin.json # Plugin manifest
│       ├── skills/         # Skill directories
│       │   └── <skill>/
│       │       └── SKILL.md
│       └── README.md
└── README.md
```

## Adding a New Plugin

1. Create directory: `plugins/<plugin-name>/`
2. Add `.claude-plugin/plugin.json` with required `name` field
3. Add `skills/` directory with skill subdirectories
4. Add `README.md`
5. Register in `marketplace.json` under `plugins` array

## Creating Skills

Each skill is a directory containing `SKILL.md` with YAML frontmatter:

```yaml
---
name: skill-name
description: When to use this skill
---

# Skill content here
```

## Conventions

- Plugin names: kebab-case, prefixed with `hzl-`
- Skill names: kebab-case, descriptive of the workflow
- Keep skills focused but comprehensive - avoid micro-skills
