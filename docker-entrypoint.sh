#!/bin/bash
set -e

echo "🦈 SharkShell Entrypoint"

# 1. JWT and Security Auto-Generation
if [ -z "$JWT_SECRET" ]; then
    export JWT_SECRET=$(openssl rand -hex 32)
    echo "ℹ️  Auto-generated JWT_SECRET."
fi

if [ -z "$ENCRYPTION_KEY" ]; then
    export ENCRYPTION_KEY=$(openssl rand -hex 32)
    echo "ℹ️  Auto-generated ENCRYPTION_KEY."
fi

# 2. Database Validation
DB_VARS_COUNT=0
[ -n "$DB_HOST" ] && DB_VARS_COUNT=$((DB_VARS_COUNT+1))
[ -n "$DB_USER" ] && DB_VARS_COUNT=$((DB_VARS_COUNT+1))
[ -n "$DB_PASSWORD" ] && DB_VARS_COUNT=$((DB_VARS_COUNT+1))
[ -n "$DB_NAME" ] && DB_VARS_COUNT=$((DB_VARS_COUNT+1))

if [ "$DB_VARS_COUNT" -gt 0 ] && [ "$DB_VARS_COUNT" -lt 4 ]; then
    echo "❌ Error: Incomplete database variables."
    echo "If you want to use an external database, you must provide ALL of: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME."
    exit 1
fi

if [ "$DB_VARS_COUNT" -eq 0 ]; then
    echo "ℹ️  No external database provided. Booting internal PostgreSQL..."
    
    export DB_HOST="127.0.0.1"
    export DB_PORT="5432"
    export DB_USER="sharkshell"
    export DB_NAME="sharkshell"
    export DB_PASSWORD="internal_secure_db_password_123"

    PGDATA=/app/pgdata
    mkdir -p "$PGDATA"
    chown -R postgres:postgres "$PGDATA"
    mkdir -p /run/postgresql
    chown -R postgres:postgres /run/postgresql

    if [ -z "$(ls -A "$PGDATA" 2>/dev/null)" ]; then
        echo "Initializing local database..."
        su-exec postgres initdb -D "$PGDATA"
        
        echo "Starting PostgreSQL..."
        su-exec postgres pg_ctl start -D "$PGDATA" -w -o "-c listen_addresses='localhost'"
        
        echo "Configuring PostgreSQL user and Database..."
        su-exec postgres psql postgres -c "CREATE USER sharkshell WITH PASSWORD '${DB_PASSWORD}';"
        su-exec postgres psql postgres -c "CREATE DATABASE sharkshell OWNER sharkshell;"
    else
        echo "Existing internal database found. Starting..."
        su-exec postgres pg_ctl start -D "$PGDATA" -w -o "-c listen_addresses='localhost'"
    fi
fi

echo "🚀 Starting SharkShell Backend..."
exec "$@"
