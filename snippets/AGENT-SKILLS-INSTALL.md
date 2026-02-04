### Claude Code skill (optional)

HZL includes a Claude Code skill that helps agents work effectively with HZL.

```bash
/plugin marketplace add tmchow/hzl
/plugin install hzl@hzl
```

<details>
<summary>Migrating from older versions?</summary>

If you previously installed `hzl@hzl-marketplace`, uninstall it first:

```bash
/plugin uninstall hzl@hzl-marketplace
/plugin marketplace remove hzl-marketplace
```

Then install the new version using the commands above.
</details>

### OpenAI Codex skill (optional)

HZL also supports [OpenAI Codex CLI](https://github.com/openai/codex). The skill uses the same `SKILL.md` format.

**Option A: Quick install (prompt injection)**

Tell Codex:
> Fetch and follow instructions from https://raw.githubusercontent.com/tmchow/hzl/main/.codex/INSTALL.md

Codex will download the skill and ask whether to add HZL guidance user-wide or project-specific.

**Security note:** This uses prompt injection—Codex will modify files on your system. Review [`.codex/INSTALL.md`](https://github.com/tmchow/hzl/blob/main/.codex/INSTALL.md) to see exactly what steps Codex will follow, or use Option B for manual control.

**Option B: Manual install**

Follow the steps in [`.codex/INSTALL.md`](https://github.com/tmchow/hzl/blob/main/.codex/INSTALL.md) yourself.
