import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ssh_client',
    });
  }

  async query(text: string, params?: any[]) {
    const client = await this.pool.connect();
    try {
      return await client.query(text, params);
    } finally {
      client.release();
    }
  }

  async initDB() {
    let retries = 5;
    while (retries > 0) {
      try {
        await this.query(`
          CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        break; // Connection successful
      } catch (err) {
        console.log(`Database connection failed. Retries left: ${retries - 1}`);
        retries -= 1;
        if (retries === 0) throw err;
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    await this.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(20) NOT NULL,
        color VARCHAR(7) DEFAULT '#6366f1',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS ssh_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        public_key TEXT NOT NULL,
        private_key_encrypted TEXT NOT NULL,
        iv VARCHAR(64) NOT NULL,
        auth_tag VARCHAR(64) NOT NULL,
        key_type VARCHAR(50) DEFAULT 'rsa',
        fingerprint VARCHAR(255),
        passphrase_encrypted TEXT,
        passphrase_iv VARCHAR(64),
        passphrase_auth_tag VARCHAR(64),
        group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS hosts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        hostname VARCHAR(255) NOT NULL,
        port INTEGER DEFAULT 22,
        username VARCHAR(255) NOT NULL,
        auth_type VARCHAR(50) DEFAULT 'key',
        ssh_key_id UUID,
        password_encrypted TEXT,
        password_iv VARCHAR(64),
        password_auth_tag VARCHAR(64),
        group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS mcp_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) UNIQUE NOT NULL,
        token_prefix VARCHAR(16) NOT NULL,
        label VARCHAR(255) NOT NULL DEFAULT 'Default',
        capability VARCHAR(20) NOT NULL DEFAULT 'execute',
        scope_all BOOLEAN NOT NULL DEFAULT true,
        allowed_host_ids UUID[] NOT NULL DEFAULT '{}',
        allowed_group_ids UUID[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        last_used_at TIMESTAMP
      )
    `);

    // Migrate mcp_tokens: single-key-per-user -> multiple scoped keys
    const mcpAlters = [
      "ALTER TABLE mcp_tokens DROP CONSTRAINT IF EXISTS mcp_tokens_user_id_key",
      "ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS label VARCHAR(255) NOT NULL DEFAULT 'Default'",
      "ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS capability VARCHAR(20) NOT NULL DEFAULT 'execute'",
      "ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS scope_all BOOLEAN NOT NULL DEFAULT true",
      "ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS allowed_host_ids UUID[] NOT NULL DEFAULT '{}'",
      "ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS allowed_group_ids UUID[] NOT NULL DEFAULT '{}'",
    ];
    for (const q of mcpAlters) {
      try { await this.query(q); } catch { }
    }

    await this.query(`
      CREATE TABLE IF NOT EXISTS mcp_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_id UUID REFERENCES mcp_tokens(id) ON DELETE SET NULL,
        token_label VARCHAR(255),
        tool_name VARCHAR(64) NOT NULL,
        host_id UUID,
        host_name VARCHAR(255),
        command TEXT,
        status VARCHAR(20) NOT NULL,
        detail TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    try {
      await this.query('CREATE INDEX IF NOT EXISTS idx_mcp_audit_user ON mcp_audit_log (user_id, created_at DESC)');
    } catch { }

    // ─── Multi-user: organizations, roles, password resets, app settings ───

    await this.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL DEFAULT 'My Organization',
        owner_user_id UUID,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const userAlters = [
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member'",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false",
      // TOTP two-factor auth (secret AES-256-GCM encrypted; recovery codes stored as SHA-256 hashes)
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_iv VARCHAR(64)",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_auth_tag VARCHAR(64)",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery_codes TEXT[] NOT NULL DEFAULT '{}'",
    ];
    for (const q of userAlters) {
      try { await this.query(q); } catch { }
    }

    // Backfill: existing solo install becomes an org owned by the earliest user (idempotent)
    try {
      const orphans = await this.query('SELECT COUNT(*) FROM users WHERE org_id IS NULL');
      if (parseInt(orphans.rows[0].count, 10) > 0) {
        let orgId: string;
        const existingOrg = await this.query('SELECT id FROM organizations ORDER BY created_at LIMIT 1');
        if (existingOrg.rows.length > 0) {
          orgId = existingOrg.rows[0].id;
        } else {
          const oldest = await this.query('SELECT id FROM users ORDER BY created_at LIMIT 1');
          const ownerId = oldest.rows[0].id;
          const org = await this.query(
            "INSERT INTO organizations (name, owner_user_id) VALUES ('My Organization', $1) RETURNING id",
            [ownerId],
          );
          orgId = org.rows[0].id;
          await this.query("UPDATE users SET role = 'admin' WHERE id = $1", [ownerId]);
        }
        await this.query('UPDATE users SET org_id = $1 WHERE org_id IS NULL', [orgId]);
      }
      // The org owner is always an admin
      await this.query(`
        UPDATE users SET role = 'admin'
        WHERE role <> 'admin' AND id IN (SELECT owner_user_id FROM organizations)
      `);
    } catch (err) {
      console.error('Org backfill failed:', err);
    }

    await this.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(64) PRIMARY KEY,
        value TEXT,
        iv VARCHAR(64),
        auth_tag VARCHAR(64),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Fix foreign key constraint
    try {
      await this.query(`ALTER TABLE hosts DROP CONSTRAINT IF EXISTS hosts_ssh_key_id_fkey`);
      await this.query(`ALTER TABLE hosts ADD CONSTRAINT hosts_ssh_key_id_fkey FOREIGN KEY (ssh_key_id) REFERENCES ssh_keys(id) ON DELETE SET NULL`);
    } catch (err) {
      // Ignore
    }

    // Add columns if they don't exist
    const alterQueries = [
      "ALTER TABLE hosts ADD COLUMN IF NOT EXISTS password_encrypted TEXT",
      "ALTER TABLE hosts ADD COLUMN IF NOT EXISTS password_iv VARCHAR(64)",
      "ALTER TABLE hosts ADD COLUMN IF NOT EXISTS password_auth_tag VARCHAR(64)",
      "ALTER TABLE ssh_keys ADD COLUMN IF NOT EXISTS passphrase_encrypted TEXT",
      "ALTER TABLE ssh_keys ADD COLUMN IF NOT EXISTS passphrase_iv VARCHAR(64)",
      "ALTER TABLE ssh_keys ADD COLUMN IF NOT EXISTS passphrase_auth_tag VARCHAR(64)",
      "ALTER TABLE hosts ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL",
      "ALTER TABLE ssh_keys ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL",
    ];
    for (const q of alterQueries) {
      try { await this.query(q); } catch { }
    }

    console.log('  ✅ Database tables initialized');
  }

  getPool(): Pool {
    return this.pool;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
