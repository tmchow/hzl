#!/usr/bin/env bash
# Shared guardrail for blocking access to production HZL XDG paths.
# Supports:
# - Claude hook mode (JSON from stdin): --stdin-json
# - Manual mode for other runtimes/tools:
#   --tool Bash --command "<cmd>"
#   --tool Write --file-path "<path>"

set -euo pipefail

TOOL=""
CMD=""
FILE_PATH=""

usage() {
  cat <<'USAGE' >&2
Usage:
  guard-production-hzl-data.sh --stdin-json
  guard-production-hzl-data.sh --tool <Bash|Edit|Write|Read> [--command "<cmd>"] [--file-path "<path>"]
USAGE
}

parse_stdin_json() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "BLOCKED: jq is required for hook JSON parsing but was not found." >&2
    exit 2
  fi

  local input
  input=$(cat)

  {
    read -r -d '' TOOL
    read -r -d '' CMD
    read -r -d '' FILE_PATH
  } < <(
    printf '%s' "$input" | jq -j \
      '(.tool_name // ""), "\u0000", (.tool_input.command // ""), "\u0000", (.tool_input.file_path // ""), "\u0000"'
  )
}

parse_args() {
  if [[ $# -eq 0 ]]; then
    usage
    exit 2
  fi

  if [[ "$1" == "--stdin-json" ]]; then
    parse_stdin_json
    return
  fi

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tool)
        TOOL="${2:-}"
        shift 2
        ;;
      --command)
        CMD="${2:-}"
        shift 2
        ;;
      --file-path)
        FILE_PATH="${2:-}"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown arg: $1" >&2
        usage
        exit 2
        ;;
    esac
  done
}

normalize_path() {
  local path="$1"
  local result=""
  local IFS='/'

  if [[ "$path" == /* ]]; then
    result="/"
  fi

  read -ra components <<< "$path"
  local stack=()

  for component in "${components[@]}"; do
    case "$component" in
      ""|".")
        continue
        ;;
      "..")
        if [[ ${#stack[@]} -gt 0 ]]; then
          unset 'stack[-1]'
        fi
        ;;
      *)
        stack+=("$component")
        ;;
    esac
  done

  if [[ "$result" == "/" ]]; then
    result="/"
    local first=true
    for c in "${stack[@]}"; do
      if $first; then
        result="/$c"
        first=false
      else
        result="$result/$c"
      fi
    done
  else
    local first=true
    for c in "${stack[@]}"; do
      if $first; then
        result="$c"
        first=false
      else
        result="$result/$c"
      fi
    done
  fi

  printf '%s\n' "$result"
}

canonicalize_path() {
  local path="$1"
  path="${path/#\~/$HOME}"

  local normalized
  normalized=$(normalize_path "$path")

  if [[ -e "$normalized" ]]; then
    local resolved
    resolved=$(cd "$(dirname "$normalized")" 2>/dev/null && pwd -P)/$(basename "$normalized")
    if [[ -L "$normalized" ]]; then
      resolved=$(cd "$normalized" 2>/dev/null && pwd -P) || resolved="$normalized"
    fi
    printf '%s\n' "$resolved"
    return
  fi

  local current="$normalized"
  local suffix=""
  while [[ ! -e "$current" && "$current" != "/" ]]; do
    suffix="/$(basename "$current")$suffix"
    current=$(dirname "$current")
  done

  if [[ -e "$current" && -d "$current" ]]; then
    local canonical_prefix
    canonical_prefix=$(cd "$current" && pwd -P 2>/dev/null) || canonical_prefix="$current"
    if [[ "$canonical_prefix" == "/" ]]; then
      printf '%s\n' "${suffix}"
    else
      printf '%s\n' "${canonical_prefix}${suffix}"
    fi
  else
    printf '%s\n' "$normalized"
  fi
}

declare -a PROTECTED_PATHS=()
declare -a LITERAL_PROTECTED_PATTERNS=(
  "~/.local/share/hzl"
  "~/.config/hzl"
)

add_protected_path() {
  local path="$1"
  path="${path/#\~/$HOME}"
  local parent
  parent=$(dirname "$path")

  if [[ -d "$parent" ]]; then
    local canonical_parent
    canonical_parent=$(cd "$parent" && pwd -P 2>/dev/null) || canonical_parent="$parent"
    PROTECTED_PATHS+=("$canonical_parent/$(basename "$path")")
  else
    PROTECTED_PATHS+=("$path")
  fi
}

check_path() {
  local path="$1"
  local canonical_path
  canonical_path=$(canonicalize_path "$path")

  for protected in "${PROTECTED_PATHS[@]}"; do
    if [[ "$canonical_path" == "$protected"* ]]; then
      echo "BLOCKED: Cannot modify production hzl data at $protected" >&2
      echo "Use the dev mode paths in .local/hzl/ instead (automatic when running from source)" >&2
      exit 2
    fi
  done
}

check_command() {
  local cmd="$1"

  for pattern in "${LITERAL_PROTECTED_PATTERNS[@]}"; do
    if [[ "$cmd" == *"$pattern"* ]]; then
      echo "BLOCKED: Bash command references production hzl data at $pattern" >&2
      echo "Use the dev mode paths in .local/hzl/ instead" >&2
      exit 2
    fi
  done

  for protected in "${PROTECTED_PATHS[@]}"; do
    if [[ "$cmd" == *"$protected"* ]]; then
      echo "BLOCKED: Bash command references production hzl data at $protected" >&2
      echo "Use the dev mode paths in .local/hzl/ instead" >&2
      exit 2
    fi
  done
}

main() {
  parse_args "$@"

  local xdg_data="${XDG_DATA_HOME:-$HOME/.local/share}"
  local xdg_config="${XDG_CONFIG_HOME:-$HOME/.config}"
  add_protected_path "$xdg_data/hzl"
  add_protected_path "$xdg_config/hzl"

  case "$TOOL" in
    Bash)
      check_command "$CMD"
      ;;
    Edit|Write|Read)
      if [[ -n "$FILE_PATH" ]]; then
        check_path "$FILE_PATH"
      fi
      ;;
    "")
      echo "BLOCKED: Missing tool context for production-data guard." >&2
      exit 2
      ;;
  esac
}

main "$@"
