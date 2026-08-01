import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';

export type McpCapability = 'read_only' | 'execute';

export interface McpKey {
    id: string;
    user_id: string;
    label: string;
    capability: McpCapability;
    scope_all: boolean;
    allowed_host_ids: string[];
    allowed_group_ids: string[];
    token_prefix: string;
    created_at: string;
    last_used_at: string | null;
    expires_at: string | null;
    oauth_client_id: string | null;
}

interface KeyInput {
    label?: string;
    capability?: McpCapability;
    scopeAll?: boolean;
    allowedHostIds?: string[];
    allowedGroupIds?: string[];
    expiresInDays?: number | null;
}

export interface OAuthScope {
    capability: McpCapability;
    scopeAll: boolean;
    allowedHostIds: string[];
    allowedGroupIds: string[];
}

const PUBLIC_COLUMNS =
    'id, user_id, label, capability, scope_all, allowed_host_ids, allowed_group_ids, token_prefix, created_at, last_used_at, expires_at, oauth_client_id';

// OAuth-issued keys: access tokens are short-lived, refresh tokens renew them silently.
export const OAUTH_ACCESS_TOKEN_TTL_DAYS = 30;
export const OAUTH_REFRESH_TOKEN_TTL_DAYS = 90;

@Injectable()
export class McpTokenService {
    constructor(private db: DatabaseService) { }

    private hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    private newToken() {
        const token = `ssk_${crypto.randomBytes(32).toString('base64url')}`;
        return { token, tokenHash: this.hashToken(token), tokenPrefix: token.slice(0, 12) };
    }

    private newRefreshToken() {
        const token = `ssr_${crypto.randomBytes(32).toString('base64url')}`;
        return { token, tokenHash: this.hashToken(token) };
    }

    private normalizeScope(input: KeyInput) {
        // Fail closed: only an explicit 'execute' grants command execution; anything else is read-only.
        const capability: McpCapability = input.capability === 'execute' ? 'execute' : 'read_only';
        const allowedHostIds = Array.isArray(input.allowedHostIds) ? input.allowedHostIds : [];
        const allowedGroupIds = Array.isArray(input.allowedGroupIds) ? input.allowedGroupIds : [];
        // scope_all defaults to true only when the caller neither opts out nor names any scope.
        const scopeAll = input.scopeAll === true
            || (input.scopeAll === undefined && allowedHostIds.length === 0 && allowedGroupIds.length === 0);
        return { capability, scopeAll, allowedHostIds, allowedGroupIds };
    }

    /** Null means "never expires" — the default for manually-created keys unless a TTL is chosen. */
    private computeExpiresAt(days?: number | null): Date | null {
        const n = Number(days);
        if (!n || n <= 0) return null;
        return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
    }

    async list(userId: string): Promise<McpKey[]> {
        const result = await this.db.query(
            `SELECT ${PUBLIC_COLUMNS} FROM mcp_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId],
        );
        return result.rows;
    }

    async create(userId: string, input: KeyInput) {
        const { token, tokenHash, tokenPrefix } = this.newToken();
        const { capability, scopeAll, allowedHostIds, allowedGroupIds } = this.normalizeScope(input);
        const expiresAt = this.computeExpiresAt(input.expiresInDays);
        const label = (input.label || '').trim() || 'Untitled key';
        const result = await this.db.query(
            `INSERT INTO mcp_tokens (user_id, token_hash, token_prefix, label, capability, scope_all, allowed_host_ids, allowed_group_ids, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING ${PUBLIC_COLUMNS}`,
            [userId, tokenHash, tokenPrefix, label, capability, scopeAll, allowedHostIds, allowedGroupIds, expiresAt],
        );
        return { token, key: result.rows[0] as McpKey };
    }

    async update(userId: string, id: string, input: KeyInput): Promise<McpKey | null> {
        const { capability, scopeAll, allowedHostIds, allowedGroupIds } = this.normalizeScope(input);
        const expiresAt = this.computeExpiresAt(input.expiresInDays);
        const label = (input.label || '').trim() || 'Untitled key';
        const result = await this.db.query(
            `UPDATE mcp_tokens
               SET label = $1, capability = $2, scope_all = $3, allowed_host_ids = $4, allowed_group_ids = $5, expires_at = $6
             WHERE id = $7 AND user_id = $8
             RETURNING ${PUBLIC_COLUMNS}`,
            [label, capability, scopeAll, allowedHostIds, allowedGroupIds, expiresAt, id, userId],
        );
        return (result.rows[0] as McpKey) || null;
    }

    /** OAuth authorization_code exchange: creates a scoped key exactly like a manual one, but time-boxed with a refresh token. */
    async createOAuthGrant(userId: string, oauthClientId: string, clientLabel: string, scope: OAuthScope) {
        const { token, tokenHash, tokenPrefix } = this.newToken();
        const { token: refreshToken, tokenHash: refreshTokenHash } = this.newRefreshToken();
        const expiresAt = this.computeExpiresAt(OAUTH_ACCESS_TOKEN_TTL_DAYS);
        const refreshExpiresAt = this.computeExpiresAt(OAUTH_REFRESH_TOKEN_TTL_DAYS);
        const result = await this.db.query(
            `INSERT INTO mcp_tokens (
                user_id, token_hash, token_prefix, label, capability, scope_all, allowed_host_ids, allowed_group_ids,
                expires_at, oauth_client_id, refresh_token_hash, refresh_token_expires_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING ${PUBLIC_COLUMNS}`,
            [
                userId, tokenHash, tokenPrefix, clientLabel, scope.capability, scope.scopeAll,
                scope.allowedHostIds, scope.allowedGroupIds, expiresAt, oauthClientId, refreshTokenHash, refreshExpiresAt,
            ],
        );
        return { token, refreshToken, key: result.rows[0] as McpKey };
    }

    /** OAuth refresh_token grant: single-use rotation of both tokens on the same key row. */
    async rotateOAuthGrant(refreshToken: string) {
        const refreshHash = this.hashToken(refreshToken);
        const { token, tokenHash, tokenPrefix } = this.newToken();
        const { token: newRefreshToken, tokenHash: newRefreshHash } = this.newRefreshToken();
        const expiresAt = this.computeExpiresAt(OAUTH_ACCESS_TOKEN_TTL_DAYS);
        const refreshExpiresAt = this.computeExpiresAt(OAUTH_REFRESH_TOKEN_TTL_DAYS);
        const result = await this.db.query(
            `UPDATE mcp_tokens
               SET token_hash = $1, token_prefix = $2, expires_at = $3, refresh_token_hash = $4, refresh_token_expires_at = $5
             WHERE refresh_token_hash = $6 AND refresh_token_expires_at > NOW()
             RETURNING ${PUBLIC_COLUMNS}`,
            [tokenHash, tokenPrefix, expiresAt, newRefreshHash, refreshExpiresAt, refreshHash],
        );
        if (!result.rows[0]) return null;
        return { token, refreshToken: newRefreshToken, key: result.rows[0] as McpKey };
    }

    async reset(userId: string, id: string): Promise<{ token: string; key: McpKey } | null> {
        const { token, tokenHash, tokenPrefix } = this.newToken();
        const result = await this.db.query(
            `UPDATE mcp_tokens
               SET token_hash = $1, token_prefix = $2, created_at = NOW(), last_used_at = NULL
             WHERE id = $3 AND user_id = $4
             RETURNING ${PUBLIC_COLUMNS}`,
            [tokenHash, tokenPrefix, id, userId],
        );
        if (!result.rows[0]) return null;
        return { token, key: result.rows[0] as McpKey };
    }

    async revoke(userId: string, id: string): Promise<boolean> {
        const result = await this.db.query(
            'DELETE FROM mcp_tokens WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId],
        );
        return result.rows.length > 0;
    }

    async validate(token: string): Promise<McpKey | null> {
        if (!token || !token.startsWith('ssk_')) return null;
        const tokenHash = this.hashToken(token);
        const result = await this.db.query(
            `UPDATE mcp_tokens SET last_used_at = NOW()
             WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > NOW())
             RETURNING ${PUBLIC_COLUMNS}`,
            [tokenHash],
        );
        return (result.rows[0] as McpKey) || null;
    }

    /** A host is reachable by a key when the key is unscoped, or the host's id/group is on the allowlist. */
    isHostAllowed(key: McpKey, host: { id: string; group_id?: string | null }): boolean {
        if (key.scope_all) return true;
        if (key.allowed_host_ids?.includes(host.id)) return true;
        if (host.group_id && key.allowed_group_ids?.includes(host.group_id)) return true;
        return false;
    }

    async logAudit(entry: {
        userId: string;
        tokenId: string;
        tokenLabel: string;
        toolName: string;
        hostId?: string | null;
        hostName?: string | null;
        command?: string | null;
        status: 'success' | 'error' | 'denied';
        detail?: string | null;
    }) {
        try {
            await this.db.query(
                `INSERT INTO mcp_audit_log (user_id, token_id, token_label, tool_name, host_id, host_name, command, status, detail)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    entry.userId, entry.tokenId, entry.tokenLabel, entry.toolName,
                    entry.hostId || null, entry.hostName || null,
                    entry.command ? entry.command.slice(0, 4000) : null,
                    entry.status, entry.detail ? entry.detail.slice(0, 2000) : null,
                ],
            );
        } catch (err) {
            // Audit logging must never break a tool call.
            console.error('MCP audit log write failed:', (err as Error).message);
        }
    }

    async listAudit(userId: string, limit = 100) {
        const capped = Math.min(Math.max(Number(limit) || 100, 1), 500);
        const result = await this.db.query(
            `SELECT id, token_id, token_label, tool_name, host_id, host_name, command, status, detail, created_at
             FROM mcp_audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
            [userId, capped],
        );
        return result.rows;
    }
}
