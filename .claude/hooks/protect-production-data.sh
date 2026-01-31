#!/bin/bash
# Protects user's production hzl data from accidental modification
# This hook blocks operations that target ~/.local/share/hzl/ or ~/.config/hzl/

set -e

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo "WARNING: jq not installed, skipping production data protection check" >&2
  exit 0
fi

# Read JSON input from stdin and parse once
INPUT=$(cat)

# Parse JSON once and extract all needed fields in a single jq call
# Using null-delimited output for safety with special characters
{
  read -r -d '' TOOL
  read -r -d '' CMD
  read -r -d '' FILE_PATH
} < <(echo "$INPUT" | jq -j '(.tool_name // ""), "\u0000", (.tool_input.command // ""), "\u0000", (.tool_input.file_path // ""), "\u0000"')

# Build protected paths list with canonicalization
# Start with default XDG paths
XDG_DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
XDG_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}"

# Protected path patterns (canonical paths)
PROTECTED_PATHS=()

# Add canonical versions of protected directories
add_protected_path() {
  local path="$1"
  # Expand ~ if present
  path="${path/#\~/$HOME}"
  # Only add if the parent directory exists (so we can canonicalize)
  local parent
  parent=$(dirname "$path")
  if [[ -d "$parent" ]]; then
    # Canonicalize the parent and append the basename
    local canonical_parent
    canonical_parent=$(cd "$parent" && pwd -P 2>/dev/null) || canonical_parent="$parent"
    PROTECTED_PATHS+=("$canonical_parent/$(basename "$path")")
  else
    # Parent doesn't exist, just add the expanded path
    PROTECTED_PATHS+=("$path")
  fi
}

# Add standard locations
add_protected_path "$XDG_DATA/hzl"
add_protected_path "$XDG_CONFIG/hzl"

# Also protect literal ~ paths that might appear in commands
LITERAL_PROTECTED_PATTERNS=(
  "~/.local/share/hzl"
  "~/.config/hzl"
)

# Normalize a path by resolving . and .. components (pure bash, no realpath needed)
normalize_path() {
  local path="$1"
  local result=""
  local IFS='/'

  # Handle absolute vs relative paths
  if [[ "$path" == /* ]]; then
    result="/"
  fi

  # Split path into components and process
  read -ra components <<< "$path"
  local stack=()

  for component in "${components[@]}"; do
    case "$component" in
      ""|".")
        # Skip empty components and current dir
        continue
        ;;
      "..")
        # Go up one directory if possible
        if [[ ${#stack[@]} -gt 0 ]]; then
          unset 'stack[-1]'
        fi
        ;;
      *)
        # Normal component, add to stack
        stack+=("$component")
        ;;
    esac
  done

  # Rebuild path
  if [[ "$result" == "/" ]]; then
    result="/${stack[*]}"
    result="${result// //}"  # Join with /
    # Proper join
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

  echo "$result"
}

# Canonicalize a path for comparison
canonicalize_path() {
  local path="$1"
  # Expand ~ if present
  path="${path/#\~/$HOME}"

  # Normalize the path to resolve . and ..
  local normalized
  normalized=$(normalize_path "$path")

  # Try to resolve symlinks for the existing portion
  if [[ -e "$normalized" ]]; then
    # Path exists, try to resolve symlinks
    local resolved
    resolved=$(cd "$(dirname "$normalized")" 2>/dev/null && pwd -P)/$(basename "$normalized")
    if [[ -L "$normalized" ]]; then
      # It's a symlink, fully resolve it
      resolved=$(cd "$normalized" 2>/dev/null && pwd -P) || resolved="$normalized"
    fi
    echo "$resolved"
  else
    # Path doesn't exist, try to canonicalize the longest existing prefix
    local current="$normalized"
    local suffix=""
    while [[ ! -e "$current" && "$current" != "/" ]]; do
      suffix="/$(basename "$current")$suffix"
      current=$(dirname "$current")
    done
    if [[ -e "$current" && -d "$current" ]]; then
      local canonical_prefix
      canonical_prefix=$(cd "$current" && pwd -P 2>/dev/null) || canonical_prefix="$current"
      # Avoid double slash when prefix is /
      if [[ "$canonical_prefix" == "/" ]]; then
        echo "${suffix}"
      else
        echo "${canonical_prefix}${suffix}"
      fi
    else
      echo "$normalized"
    fi
  fi
}

check_path() {
  local path="$1"
  local canonical_path
  canonical_path=$(canonicalize_path "$path")

  for protected in "${PROTECTED_PATHS[@]}"; do
    if [[ "$canonical_path" == "$protected"* ]]; then
      echo "BLOCKED: Cannot modify production hzl data at $protected"
      echo "Use the dev mode paths in .local/hzl/ instead (automatic when running from source)"
      exit 2
    fi
  done
}

check_command() {
  local cmd="$1"

  # Check for literal ~ patterns in command
  for pattern in "${LITERAL_PROTECTED_PATTERNS[@]}"; do
    if [[ "$cmd" == *"$pattern"* ]]; then
      echo "BLOCKED: Bash command references production hzl data at $pattern"
      echo "Use the dev mode paths in .local/hzl/ instead"
      exit 2
    fi
  done

  # Check for expanded paths in command
  for protected in "${PROTECTED_PATHS[@]}"; do
    if [[ "$cmd" == *"$protected"* ]]; then
      echo "BLOCKED: Bash command references production hzl data at $protected"
      echo "Use the dev mode paths in .local/hzl/ instead"
      exit 2
    fi
  done
}

case "$TOOL" in
  Bash)
    check_command "$CMD"
    ;;
  Edit|Write|Read)
    if [[ -n "$FILE_PATH" ]]; then
      check_path "$FILE_PATH"
    fi
    ;;
esac

# Allow the operation
exit 0
