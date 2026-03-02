---
layout: doc
title: Uninstall
---

# Uninstall HZL

HZL uninstall is intentionally narrow: remove the binary, then optionally remove data.

## 1) Remove the binary

Use whichever package manager you installed with:

```bash
# npm
npm uninstall -g hzl-cli

# Homebrew
brew uninstall hzl
```

## 2) Optionally remove data and config

Typical default locations:

| Component | Default path |
|-----------|-------------|
| Data (events, cache) | `$XDG_DATA_HOME/hzl` (or `~/.local/share/hzl`) |
| Config | `$XDG_CONFIG_HOME/hzl` (or `~/.config/hzl`) |

```bash
rm -rf ~/.local/share/hzl
rm -rf ~/.config/hzl
```

In repository dev mode, HZL uses local `.local/hzl` and `.config/hzl` paths instead.

## 3) Remove OpenClaw integration (if applicable)

If you set up the OpenClaw integration, follow the [Teardown checklist](/getting-started/installation#teardown-checklist-manual-reverse-order) in the installation guide to remove scheduled jobs, HEARTBEAT blocks, and hook configuration.
