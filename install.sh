#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# SharkShell one-liner installer
#
#   curl -fsSL https://sharkshell.in/get | sudo bash
#
# Downloads deploy.sh and runs it. deploy.sh then handles
# everything: packages, source download, build, PostgreSQL,
# nginx, service install, health check.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

[ "$(id -u)" -eq 0 ] || {
    echo "Please run as root:  curl -fsSL https://sharkshell.in/get | sudo bash" >&2
    exit 1
}

command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }

# Primary: sharkshell.in (redirects to the repo). Fallback: GitHub raw.
DEPLOY_URL="${SHARKSHELL_DEPLOY_URL:-https://sharkshell.in/deploy.sh}"
FALLBACK_URL="https://raw.githubusercontent.com/sushilkumarsahani41/SharkShell/main/deploy.sh"

WORK_DIR="$(mktemp -d /tmp/sharkshell-install.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "🦈 Downloading SharkShell installer..."
if ! curl -fsSL "$DEPLOY_URL" -o "$WORK_DIR/deploy.sh"; then
    echo "   (primary source unreachable, falling back to GitHub)"
    curl -fsSL "$FALLBACK_URL" -o "$WORK_DIR/deploy.sh"
fi

# Sanity check: make sure we got a script, not an HTML error page
head -n 1 "$WORK_DIR/deploy.sh" | grep -q '^#!' || {
    echo "Downloaded file is not a shell script — aborting." >&2
    exit 1
}

chmod +x "$WORK_DIR/deploy.sh"
exec bash "$WORK_DIR/deploy.sh" "$@"
