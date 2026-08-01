import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { McpTokenService, McpCapability, OAuthScope } from './mcp-token.service';

const CODE_TTL_MS = 5 * 60 * 1000;

interface OAuthClient {
    client_id: string;
    client_name: string | null;
    redirect_uris: string[];
}

/** Thrown for spec-defined OAuth error codes so the controller can shape a proper error response. */
export class OAuthError extends Error {
    constructor(public code: string, message: string) {
        super(message);
    }
}

@Injectable()
export class OAuthService {
    constructor(
        private db: DatabaseService,
        private tokens: McpTokenService,
    ) { }

    private hash(value: string): string {
        return crypto.createHash('sha256').update(value).digest('hex');
    }

    private isValidRedirectUri(uri: string): boolean {
        try {
            const u = new URL(uri);
            // Loopback (native/desktop clients) or any https target the registering client names.
            return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
        } catch {
            return false;
        }
    }

    /** RFC 7591 Dynamic Client Registration — open to any caller, like every public MCP server's /register. */
    async registerClient(input: { redirect_uris?: string[]; client_name?: string }): Promise<OAuthClient> {
        const redirectUris = Array.isArray(input.redirect_uris) ? input.redirect_uris.filter(Boolean) : [];
        if (redirectUris.length === 0 || !redirectUris.every((u) => this.isValidRedirectUri(u))) {
            throw new OAuthError('invalid_redirect_uri', 'redirect_uris must be a non-empty array of https:// or loopback URLs');
        }
        const clientId = `mcpc_${crypto.randomBytes(16).toString('hex')}`;
        const clientName = (input.client_name || '').trim().slice(0, 255) || 'MCP Client';
        const result = await this.db.query(
            `INSERT INTO oauth_clients (client_id, client_name, redirect_uris)
             VALUES ($1, $2, $3)
             RETURNING client_id, client_name, redirect_uris`,
            [clientId, clientName, redirectUris],
        );
        return result.rows[0];
    }

    async getClient(clientId: string): Promise<OAuthClient | null> {
        if (!clientId) return null;
        const result = await this.db.query(
            'SELECT client_id, client_name, redirect_uris FROM oauth_clients WHERE client_id = $1',
            [clientId],
        );
        return result.rows[0] || null;
    }

    /** Validates the client/redirect pair the browser lands on before showing the consent screen. */
    async resolveAuthorizeRequest(params: {
        clientId: string; redirectUri: string; codeChallenge: string; codeChallengeMethod?: string;
    }): Promise<OAuthClient> {
        const client = await this.getClient(params.clientId);
        if (!client) throw new OAuthError('invalid_client', 'Unknown client_id — register the client first');
        if (!client.redirect_uris.includes(params.redirectUri)) {
            throw new OAuthError('invalid_request', 'redirect_uri does not match a registered redirect URI for this client');
        }
        if (!params.codeChallenge) {
            throw new OAuthError('invalid_request', 'code_challenge is required (PKCE)');
        }
        if (params.codeChallengeMethod && params.codeChallengeMethod !== 'S256') {
            throw new OAuthError('invalid_request', 'Only the S256 code_challenge_method is supported');
        }
        return client;
    }

    /** Called after the user approves in the SharkShell consent UI — issues the single-use authorization code. */
    async issueCode(params: {
        clientId: string;
        userId: string;
        redirectUri: string;
        codeChallenge: string;
        scope: OAuthScope;
    }): Promise<string> {
        const code = `mcpg_${crypto.randomBytes(32).toString('base64url')}`;
        const expiresAt = new Date(Date.now() + CODE_TTL_MS);
        await this.db.query(
            `INSERT INTO oauth_codes (
                code_hash, client_id, user_id, redirect_uri, code_challenge,
                capability, scope_all, allowed_host_ids, allowed_group_ids, expires_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                this.hash(code), params.clientId, params.userId, params.redirectUri, params.codeChallenge,
                params.scope.capability, params.scope.scopeAll, params.scope.allowedHostIds, params.scope.allowedGroupIds, expiresAt,
            ],
        );
        return code;
    }

    /** grant_type=authorization_code — verifies PKCE, consumes the code, mints an mcp_tokens row. */
    async exchangeAuthorizationCode(params: { clientId: string; code: string; redirectUri: string; codeVerifier: string }) {
        if (!params.code || !params.codeVerifier) {
            throw new OAuthError('invalid_request', 'code and code_verifier are required');
        }
        const result = await this.db.query(
            `UPDATE oauth_codes SET used_at = NOW()
             WHERE code_hash = $1 AND used_at IS NULL AND expires_at > NOW()
             RETURNING *`,
            [this.hash(params.code)],
        );
        const row = result.rows[0];
        if (!row) throw new OAuthError('invalid_grant', 'Authorization code is invalid, expired, or already used');
        if (row.client_id !== params.clientId || row.redirect_uri !== params.redirectUri) {
            throw new OAuthError('invalid_grant', 'code was not issued to this client/redirect_uri');
        }

        const expectedChallenge = crypto.createHash('sha256').update(params.codeVerifier).digest('base64url');
        if (expectedChallenge !== row.code_challenge) {
            throw new OAuthError('invalid_grant', 'PKCE verification failed');
        }

        const client = await this.getClient(row.client_id);
        const scope: OAuthScope = {
            capability: row.capability as McpCapability,
            scopeAll: row.scope_all,
            allowedHostIds: row.allowed_host_ids || [],
            allowedGroupIds: row.allowed_group_ids || [],
        };
        const grant = await this.tokens.createOAuthGrant(row.user_id, row.client_id, client?.client_name || 'MCP Client', scope);
        return grant;
    }

    /** grant_type=refresh_token — rotates both tokens; fails closed if the refresh token is unknown/expired. */
    async refreshGrant(refreshToken: string) {
        if (!refreshToken || !refreshToken.startsWith('ssr_')) {
            throw new OAuthError('invalid_grant', 'Invalid refresh token');
        }
        const grant = await this.tokens.rotateOAuthGrant(refreshToken);
        if (!grant) throw new OAuthError('invalid_grant', 'Refresh token is invalid, expired, or revoked');
        return grant;
    }
}
