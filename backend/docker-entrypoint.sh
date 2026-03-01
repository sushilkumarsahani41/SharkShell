#!/bin/sh
set -e

# ─────────────────────────────────────────────
# SharkShell Backend — Docker Entrypoint
# Generates secrets if not provided by user
# ─────────────────────────────────────────────

SECRETS_DIR="/app/secrets"
mkdir -p "$SECRETS_DIR"

echo ""
echo "  🦈 SharkShell Backend Setup"
echo "  ───────────────────────────"

# ── JWT Secret ────────────────────────────────
# If user provides JWT_SECRET → use it
# Otherwise generate a strong 256-bit key
if [ -z "$JWT_SECRET" ]; then
    JWT_FILE="${SECRETS_DIR}/jwt.secret"
    if [ ! -f "$JWT_FILE" ]; then
        echo "  🔑 Generating 256-bit JWT secret..."
        openssl rand -hex 32 > "$JWT_FILE"
        chmod 600 "$JWT_FILE"
    fi
    export JWT_SECRET=$(cat "$JWT_FILE")
    echo "  ✅ JWT secret loaded (auto-generated)"
else
    echo "  ✅ JWT secret loaded (user-provided)"
fi

# ── Encryption Key ────────────────────────────
# If user provides ENCRYPTION_KEY → use it
# Otherwise generate AES-256 key
if [ -z "$ENCRYPTION_KEY" ]; then
    ENC_FILE="${SECRETS_DIR}/encryption.key"
    if [ ! -f "$ENC_FILE" ]; then
        echo "  🔐 Generating AES-256 encryption key..."
        openssl rand -hex 32 > "$ENC_FILE"
        chmod 600 "$ENC_FILE"
    fi
    export ENCRYPTION_KEY=$(cat "$ENC_FILE")
    echo "  ✅ Encryption key loaded (auto-generated)"
else
    echo "  ✅ Encryption key loaded (user-provided)"
fi

echo ""
echo "  🚀 Starting backend..."
echo "     DB: ${DB_HOST:-localhost}:${DB_PORT:-5432}/${DB_NAME:-sharkshell}"
echo ""

exec "$@"
