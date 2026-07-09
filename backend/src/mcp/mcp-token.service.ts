import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class McpTokenService {
    constructor(private db: DatabaseService) { }

    private hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    async createOrReset(userId: string) {
        const token = `ssk_${crypto.randomBytes(32).toString('base64url')}`;
        const tokenHash = this.hashToken(token);
        const tokenPrefix = token.slice(0, 12);
        const result = await this.db.query(
            `INSERT INTO mcp_tokens (user_id, token_hash, token_prefix)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE
               SET token_hash = EXCLUDED.token_hash,
                   token_prefix = EXCLUDED.token_prefix,
                   created_at = NOW(),
                   last_used_at = NULL
             RETURNING token_prefix, created_at`,
            [userId, tokenHash, tokenPrefix],
        );
        return { token, tokenPrefix: result.rows[0].token_prefix, createdAt: result.rows[0].created_at };
    }

    async getStatus(userId: string) {
        const result = await this.db.query(
            'SELECT token_prefix, created_at, last_used_at FROM mcp_tokens WHERE user_id = $1',
            [userId],
        );
        if (result.rows.length === 0) return { active: false };
        const row = result.rows[0];
        return { active: true, tokenPrefix: row.token_prefix, createdAt: row.created_at, lastUsedAt: row.last_used_at };
    }

    async revoke(userId: string) {
        const result = await this.db.query(
            'DELETE FROM mcp_tokens WHERE user_id = $1 RETURNING id',
            [userId],
        );
        return result.rows.length > 0;
    }

    async validate(token: string): Promise<{ userId: string } | null> {
        if (!token || !token.startsWith('ssk_')) return null;
        const tokenHash = this.hashToken(token);
        const result = await this.db.query(
            'UPDATE mcp_tokens SET last_used_at = NOW() WHERE token_hash = $1 RETURNING user_id',
            [tokenHash],
        );
        return result.rows[0] ? { userId: result.rows[0].user_id } : null;
    }
}
