#!/usr/bin/env bash
# Claude hook entrypoint. Delegates to shared guard logic used across runtimes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

exec "$REPO_ROOT/scripts/guard-production-hzl-data.sh" --stdin-json
