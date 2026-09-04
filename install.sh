#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# SharkShell one-liner installer
#
#   curl -fsSL https://raw.githubusercontent.com/sushilkumarsahani41/SharkShell/main/install.sh | sudo bash
#
# Downloads deploy.sh and runs it. deploy.sh then handles
# everything: packages, git clone, build, PostgreSQL, nginx,
# service install, health check.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Please run as root: curl -fsSL <url> | sudo bash" >&2; exit 1; }

REPO_RAW="https://raw.githubusercontent.com/sushilkumarsahani41/SharkShell/main"
WORK_DIR="$(mktemp -d /tmp/sharkshell-install.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }

echo "Downloading deploy.sh..."
curl -fsSL "$REPO_RAW/deploy.sh" -o "$WORK_DIR/deploy.sh"
chmod +x "$WORK_DIR/deploy.sh"

exec bash "$WORK_DIR/deploy.sh" "$@"
