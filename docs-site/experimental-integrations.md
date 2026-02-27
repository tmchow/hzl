---
layout: doc
title: Experimental Integrations
nav_exclude: true
---

# Experimental Integrations

This page covers non-primary integrations like Codex, Claude Code, and Gemini.

## Positioning

HZL is optimized for OpenClaw and similar multi-agent runtimes that need shared, durable task state.

For coding harnesses with native task tracking, HZL should be introduced selectively.

## When an experiment is reasonable

- Shared task state across multiple independent runtimes
- Durable coordination outside a single harness context window
- Mixed model providers requiring one neutral task ledger

## Safety guidelines

1. Keep native tracking as default.
2. Add HZL only for cross-agent/cross-runtime coordination.
3. Start with primitives (`task add`, `task list`, `task claim`, `task checkpoint`, `task complete`).
4. Add wrappers/intents only after primitive flow is stable.
