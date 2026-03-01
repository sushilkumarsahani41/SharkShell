#!/bin/sh
set -e

# ─────────────────────────────────────────────
# SharkShell Docker Entrypoint
# Auto-generates secrets if not provided
# ─────────────────────────────────────────────

SECRETS_DIR="/app/secrets"
mkdir -p "$SECRETS_DIR"

# ── JWT RSA Key Pair ──────────────────────────
JWT_KEY_FILE="${SECRETS_DIR}/jwt.key"
JWT_PUB_FILE="${SECRETS_DIR}/jwt.pub"

if [ ! -f "$JWT_KEY_FILE" ]; then
    echo "🔑 Generating RSA key pair for JWT..."
    openssl genrsa -out "$JWT_KEY_FILE" 2048 2>/dev/null
    openssl rsa -in "$JWT_KEY_FILE" -pubout -out "$JWT_PUB_FILE" 2>/dev/null
    chmod 600 "$JWT_KEY_FILE"
    echo "   ✅ JWT keys generated at ${SECRETS_DIR}/"
fi

export JWT_KEY_FILE
export JWT_PUB_FILE

# ── Encryption Key ────────────────────────────
if [ -z "$ENCRYPTION_KEY" ]; then
    ENC_KEY_FILE="${SECRETS_DIR}/encryption.key"
    if [ ! -f "$ENC_KEY_FILE" ]; then
        echo "🔐 Generating AES-256 encryption key..."
        openssl rand -hex 32 > "$ENC_KEY_FILE"
        chmod 600 "$ENC_KEY_FILE"
        echo "   ✅ Encryption key saved at ${ENC_KEY_FILE}"
    fi
    export ENCRYPTION_KEY=$(cat "$ENC_KEY_FILE")
fi

# ── Database Password ─────────────────────────
# If user provides DB_EXTERNAL=true, skip internal DB password generation
if [ "$DB_EXTERNAL" != "true" ] && [ -z "$DB_PASSWORD" ]; then
    DB_PASS_FILE="${SECRETS_DIR}/db.pass"
    if [ ! -f "$DB_PASS_FILE" ]; then
        echo "🗄️  Generating strong database password..."
        openssl rand -base64 32 | tr -d '\n' > "$DB_PASS_FILE"
        chmod 600 "$DB_PASS_FILE"
        echo "   ✅ DB password saved at ${DB_PASS_FILE}"
    fi
    export DB_PASSWORD=$(cat "$DB_PASS_FILE")
fi

echo ""
echo "  🦈 SharkShell Backend starting..."
echo "     DB: ${DB_HOST:-localhost}:${DB_PORT:-5432}/${DB_NAME:-sharkshell}"
echo ""

# Execute the main command
exec "$@"
