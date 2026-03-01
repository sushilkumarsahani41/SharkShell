#!/bin/bash
# ─────────────────────────────────────────────
# SharkShell — Setup Wizard
# Configures your deployment stack interactively
# ─────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

echo ""
echo "  🦈 Welcome to SharkShell Setup!"
echo "  ───────────────────────────────"
echo ""

if [ -f "$ENV_FILE" ]; then
    echo "  ⚠️  An existing .env file was found."
    read -p "  Do you want to overwrite it? (y/N): " overwrite_choice
    case "$overwrite_choice" in 
        y|Y ) echo "  Proceeding with setup...";;
        * ) echo "  Setup aborted."; exit 0;;
    esac
    echo ""
fi

# 1. Database Configuration
echo "  📦 Database Configuration"
read -p "  Do you want to run the built-in PostgreSQL container? (Y/n): " use_builtin_db
use_builtin_db=${use_builtin_db:-Y}

if [[ "$use_builtin_db" =~ ^[Yy]$ ]]; then
    DB_HOST="postgres"
    DB_PORT="5432"
    DB_USER="sharkshell"
    DB_NAME="sharkshell"
    
    read -p "  Enter a DB password [Press Enter to auto-generate]: " input_db_pass
    if [ -z "$input_db_pass" ]; then
        DB_PASS=$(openssl rand -base64 24 | tr -d '\n/+=')
        echo "  ✅ Generated strong DB password."
    else
        DB_PASS="$input_db_pass"
    fi
    COMPOSE_CMD="docker compose --profile db -f docker-compose.prod.yml up -d"
else
    echo "  Please provide your external PostgreSQL credentials:"
    read -p "  DB Host (e.g., db.example.com): " DB_HOST
    read -p "  DB Port [5432]: " DB_PORT
    DB_PORT=${DB_PORT:-5432}
    read -p "  DB User: " DB_USER
    read -s -p "  DB Password: " DB_PASS
    echo ""
    read -p "  DB Name: " DB_NAME
    COMPOSE_CMD="docker compose -f docker-compose.prod.yml up -d"
fi

echo ""

# 2. JWT and Security Config
echo "  🔐 Security Configuration"
read -p "  Enter a JWT Secret [Press Enter to auto-generate a strong 256-bit token]: " input_jwt
if [ -z "$input_jwt" ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    echo "  ✅ Generated strong 256-bit JWT secret."
else
    JWT_SECRET="$input_jwt"
fi

read -p "  Enter an Encryption Key [Press Enter to auto-generate 256-bit key]: " input_enc
if [ -z "$input_enc" ]; then
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    echo "  ✅ Generated strong 256-bit Encryption Key."
else
    ENCRYPTION_KEY="$input_enc"
fi

# Write .env file
cat > "$ENV_FILE" <<EOF
# ─── SharkShell Config ───
# Generated on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Database Configuration
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
DB_NAME=${DB_NAME}

# Security Configuration
ENCRYPTION_KEY=${ENCRYPTION_KEY}
JWT_SECRET=${JWT_SECRET}

# Ports
PORT=3002
COMPOSE_PORT=8080
EOF

echo ""
echo "  ✅ Setup Complete! Your configuration has been saved to .env."
echo ""
echo "  Next, start SharkShell bypassing this command:"
echo "  $COMPOSE_CMD"
echo ""
echo "  Open: http://localhost:8080"
echo ""
