#!/usr/bin/env bash
set -euo pipefail

# HZL Installer
# Usage:
#   Install:   curl -fsSL "https://raw.githubusercontent.com/tmchow/hzl/main/scripts/install.sh?$(date +%s)" | bash
#   Uninstall: curl -fsSL "https://raw.githubusercontent.com/tmchow/hzl/main/scripts/install.sh?$(date +%s)" | bash -s -- --uninstall

# --- Constants ---
VERSION="1.0.0"
SKILL_URL="https://raw.githubusercontent.com/tmchow/hzl/main/skills/hzl/SKILL.md"
SNIPPET_URL="https://raw.githubusercontent.com/tmchow/hzl/main/snippets/AGENT-POLICY.md"
MIN_NODE_VERSION="22.14.0"
MAX_RETRIES=3
RETRY_DELAY=2

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# --- State ---
UNINSTALL=false
LAST_DOWNLOAD_ERROR=""

# --- Utility functions ---

log_info() {
    echo -e "${BLUE}[hzl]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}✓${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1" >&2
}

log_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

print_details() {
    local output="$1"
    echo -e "  ${YELLOW}→${NC} Details:" >&2
    while IFS= read -r line; do
        echo "    $line" >&2
    done <<< "$output"
}

die() {
    log_error "$1"
    exit 1
}

# Resolve the hzl binary, preferring npm's global bin.
resolve_hzl_bin() {
    local npm_bin
    npm_bin=$(npm bin -g 2>/dev/null || true)
    if [ -n "$npm_bin" ] && [ -x "$npm_bin/hzl" ]; then
        echo "$npm_bin/hzl"
        return 0
    fi
    if command -v hzl &>/dev/null; then
        command -v hzl
        return 0
    fi
    return 1
}

# Compare semver versions: returns 0 if $1 >= $2
version_gte() {
    local v1="$1" v2="$2"
    # Split into arrays
    IFS='.' read -ra v1_parts <<< "$v1"
    IFS='.' read -ra v2_parts <<< "$v2"

    for i in 0 1 2; do
        local p1="${v1_parts[$i]:-0}"
        local p2="${v2_parts[$i]:-0}"
        # Remove any non-numeric suffix (e.g., "22" from "22.14.0")
        p1="${p1%%[!0-9]*}"
        p2="${p2%%[!0-9]*}"
        if (( p1 > p2 )); then
            return 0
        elif (( p1 < p2 )); then
            return 1
        fi
    done
    return 0
}

download_with_retry() {
    local url="$1"
    local dest="$2"
    local attempt=1

    LAST_DOWNLOAD_ERROR=""
    while [ $attempt -le $MAX_RETRIES ]; do
        local output
        if output=$(curl -fsSL -S "$url" -o "$dest" 2>&1); then
            return 0
        fi
        LAST_DOWNLOAD_ERROR="$output"
        if [ $attempt -lt $MAX_RETRIES ]; then
            log_warn "Download failed, retrying in ${RETRY_DELAY}s... (attempt $attempt/$MAX_RETRIES)"
            sleep $RETRY_DELAY
        fi
        ((attempt++))
    done
    return 1
}

# --- Core functions ---

print_banner() {
    echo -e "${BOLD}${BLUE}"
    echo "╔════════════════════════════════════════╗"
    echo "║           HZL Installer                ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check for Node.js
    if ! command -v node &>/dev/null; then
        die "Node.js not found. Install Node.js ${MIN_NODE_VERSION}+ from https://nodejs.org or run 'brew install node'"
    fi

    # Check Node.js version
    local node_version
    node_version=$(node --version | sed 's/^v//')

    if ! version_gte "$node_version" "$MIN_NODE_VERSION"; then
        die "Node.js ${MIN_NODE_VERSION}+ required (found: v${node_version}). Update via https://nodejs.org or 'brew upgrade node'"
    fi

    log_success "Node.js v${node_version}"

    # Check for npm
    if ! command -v npm &>/dev/null; then
        die "npm not found. It should come with Node.js - try reinstalling Node.js"
    fi
}

install_hzl_cli() {
    log_info "Installing hzl-cli..."

    if ! npm install -g hzl-cli 2>&1; then
        die "Failed to install hzl-cli. Check npm permissions or try 'sudo npm install -g hzl-cli'"
    fi

    local hzl_bin
    if ! hzl_bin=$(resolve_hzl_bin); then
        die "hzl binary not found after install. Check your npm global bin path"
    fi

    local version
    version=$("$hzl_bin" --version 2>/dev/null || echo "unknown")
    log_success "Installed hzl-cli v${version}"
}

init_database() {
    log_info "Initializing database..."

    # hzl init is idempotent - safe to run if database exists
    local hzl_bin
    if ! hzl_bin=$(resolve_hzl_bin); then
        die "hzl binary not found. Check your npm global bin path"
    fi

    if ! "$hzl_bin" init 2>&1; then
        die "Failed to initialize HZL database"
    fi

    log_success "Database ready"
}

install_claude_plugin() {
    log_info "Installing Claude Code plugin..."

    if ! command -v claude &>/dev/null; then
        log_warn "Claude Code CLI not found, skipping plugin install"
        echo -e "  ${YELLOW}→${NC} After installing Claude Code, re-run this script to add the plugin" >&2
        return 0
    fi

    # Add marketplace (idempotent; may return non-zero if already added)
    local marketplace_output
    if ! marketplace_output=$(claude plugin marketplace add tmchow/tmc-marketplace 2>&1); then
        log_warn "Failed to add tmc-marketplace (may already exist), continuing"
        print_details "$marketplace_output"
    fi

    # Install plugin (idempotent - reinstalls/updates if exists)
    local install_output
    if ! install_output=$(claude plugin install iterative-engineering@tmc-marketplace 2>&1); then
        log_warn "Failed to install iterative-engineering plugin"
        print_details "$install_output"
        return 0
    fi

    log_success "Installed iterative-engineering@tmc-marketplace plugin"
}

install_codex_skill() {
    log_info "Installing Codex skill..."

    local codex_home="${CODEX_HOME:-$HOME/.codex}"
    local skills_dir="${codex_home}/skills/hzl"

    if [ ! -d "$codex_home" ]; then
        log_warn "Codex not detected (~/.codex/ not found), skipping skill install"
        echo -e "  ${YELLOW}→${NC} After installing Codex, re-run this script to add the skill" >&2
        return 0
    fi

    mkdir -p "$skills_dir"

    local tmp_file
    tmp_file=$(mktemp)

    if ! download_with_retry "$SKILL_URL" "$tmp_file"; then
        rm -f "$tmp_file"
        log_warn "Failed to download Codex skill after $MAX_RETRIES attempts"
        if [ -n "$LAST_DOWNLOAD_ERROR" ]; then
            print_details "$LAST_DOWNLOAD_ERROR"
        fi
        return 0
    fi

    mv "$tmp_file" "${skills_dir}/SKILL.md"
    log_success "Installed skill to ${skills_dir}/"
}

# Check if HZL policy snippet is present in a file
# Returns 0 if both fingerprint phrases are found, 1 otherwise
detect_hzl_snippet() {
    local file="$1"

    if [ ! -f "$file" ]; then
        return 1
    fi

    # Both phrases must be present
    if grep -q "HZL task ledger" "$file" 2>/dev/null && \
       grep -q "This project uses HZL" "$file" 2>/dev/null; then
        return 0
    fi

    return 1
}

# Check common agent instruction files for HZL snippet
# Sets SNIPPET_FOUND_IN to the filename if found, empty otherwise
check_agent_files() {
    SNIPPET_FOUND_IN=""

    for file in AGENTS.md CLAUDE.md GEMINI.md CODEX.md; do
        if detect_hzl_snippet "$file"; then
            SNIPPET_FOUND_IN="$file"
            return 0
        fi
    done

    return 1
}

print_agents_snippet() {
    # Check if snippet is already present
    if check_agent_files; then
        log_success "HZL policy found in $SNIPPET_FOUND_IN"
        return 0
    fi

    local snippet
    snippet=$(curl -fsSL "$SNIPPET_URL" 2>/dev/null || echo "")

    echo ""
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}Add this to your AGENTS.md, CLAUDE.md, or GEMINI.md:${NC}"
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo ""

    if [ -n "$snippet" ]; then
        echo "$snippet"
    else
        # Fallback if fetch fails
        cat << 'SNIPPET'
### HZL task ledger

This project uses HZL for task tracking.

**IMPORTANT - Task tracking:** When starting work that is multi-step, may span sessions, or needs coordination, run `hzl guide` to learn how this project tracks tasks.

**When delegating to sub-agents:** Include "use HZL for task tracking" in the sub-agent's instructions.

**Use HZL when:**
- Work has multiple steps or may not finish this session
- Durable record of progress or ownership needed
- Handoff or review expected
- Task is non-trivial (~30+ min or risky changes)

**Skip HZL when:**
- Small, clearly scoped work completed immediately
- Quick one-off answer or tiny change

**Rule of thumb:** If you're tempted to make a multi-step plan, use HZL.
SNIPPET
    fi

    echo ""
    echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
    echo -e "Source: ${BLUE}${SNIPPET_URL}${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}${BOLD}Done!${NC} Run 'hzl --help' to get started."
}

# --- Uninstall functions ---

do_uninstall() {
    log_info "Uninstalling HZL..."
    echo ""

    # Uninstall npm package
    log_info "Removing hzl-cli..."
    if npm uninstall -g hzl-cli 2>&1; then
        log_success "Uninstalled hzl-cli"
    else
        log_warn "Failed to uninstall hzl-cli"
    fi

    # Remove Claude Code plugin
    if command -v claude &>/dev/null; then
        log_info "Removing Claude Code plugin..."

        # Try to uninstall plugin (may fail if not installed)
        local uninstall_output
        if uninstall_output=$(claude plugin uninstall iterative-engineering@tmc-marketplace 2>&1); then
            log_success "Removed Claude Code plugin"
        else
            log_warn "Claude Code plugin not found or failed to remove"
            print_details "$uninstall_output"
        fi

        # Try to remove marketplace (only if no other plugins from it)
        local remove_marketplace_output
        if remove_marketplace_output=$(claude plugin marketplace remove tmchow/tmc-marketplace 2>&1); then
            log_success "Removed tmc-marketplace"
        else
            log_warn "tmc-marketplace not found or failed to remove"
            print_details "$remove_marketplace_output"
        fi
    fi

    # Remove Codex skill
    local codex_home="${CODEX_HOME:-$HOME/.codex}"
    local skills_dir="${codex_home}/skills/hzl"

    if [ -d "$skills_dir" ]; then
        log_info "Removing Codex skill..."
        rm -rf "$skills_dir"
        log_success "Removed Codex skill"
    fi

    # Database preservation message
    echo ""
    echo -e "${BOLD}Your HZL database was preserved at ~/.local/share/hzl/${NC}"
    echo "  - To remove it: rm -rf ~/.local/share/hzl/"
    echo "  - Reinstalling HZL can reuse this database"
    echo ""
}

# --- Argument parsing ---

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --uninstall)
                UNINSTALL=true
                shift
                ;;
            --help|-h)
                echo "HZL Installer v${VERSION}"
                echo ""
                echo "Usage:"
                echo "  Install:   curl -fsSL \"https://raw.githubusercontent.com/tmchow/hzl/main/scripts/install.sh?\$(date +%s)\" | bash"
                echo "  Uninstall: curl -fsSL \"https://raw.githubusercontent.com/tmchow/hzl/main/scripts/install.sh?\$(date +%s)\" | bash -s -- --uninstall"
                echo ""
                echo "Options:"
                echo "  --uninstall    Remove HZL CLI, plugins, and skills (preserves database)"
                echo "  --help, -h     Show this help message"
                exit 0
                ;;
            *)
                die "Unknown option: $1. Use --help for usage."
                ;;
        esac
    done
}

# --- Main ---

main() {
    parse_args "$@"
    print_banner

    if [[ "$UNINSTALL" == "true" ]]; then
        do_uninstall
    else
        check_prerequisites
        install_hzl_cli
        init_database
        install_claude_plugin
        install_codex_skill
        print_agents_snippet
        print_success
    fi
}

main "$@"
