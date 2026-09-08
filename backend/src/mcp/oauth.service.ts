import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { McpTokenService, McpCapability, OAuthScope } from './mcp-token.service';
import { CimdService, isCimdClientId } from './cimd.service';
import { resourceMatches } from './mcp-origin.util';

const CODE_TTL_MS = 5 * 60 * 1000;

interface OAuthClient {
    client_id: string;
    client_name: string | null;
    redirect_uris: string[];
}

/**
 * RFC 8252 §7.3 loopback-redirect matching: for `http://localhost` / `127.0.0.1` / `[::1]`
 * the port is chosen at runtime by the native client, so it must be ignored when matching.
 * Everything else is compared exactly (open-redirection defense).
 */
export function redirectUriAllowed(registered: string[], candidate: string): boolean {
    if (registered.includes(candidate)) return true;
    let c: URL;
    try { c = new URL(candidate); } catch { return false; }
    const isLoopback = (u: URL) =>
        u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(u.hostname);
    if (!isLoopback(c)) return false;
    return registered.some((r) => {
        try {
            const ru = new URL(r);
            return isLoopback(ru) && ru.hostname === c.hostname && ru.pathname === c.pathname;
        } catch {
            return false;
        }
    });
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
        private cimd: CimdService,
    ) { }

    private hash(value: string): string {
        return crypto.createHash('sha256').update(value).digest('hex');
    }

    /**
     * Resolve a client by any of the three MCP registration mechanisms:
     * a URL client_id is a Client ID Metadata Document (fetched + validated + cached in
     * `oauth_clients`); anything else is a DCR / pre-registered client looked up in the DB.
     */
    async resolveClient(clientId: string): Promise<OAuthClient | null> {
        if (!clientId) return null;
        if (isCimdClientId(clientId)) {
            const meta = await this.cimd.resolve(clientId);
            await this.db.query(
                `INSERT INTO oauth_clients (client_id, client_name, redirect_uris, is_cimd, metadata_fetched_at)
                 VALUES ($1, $2, $3, true, NOW())
                 ON CONFLICT (client_id) DO UPDATE
                   SET client_name = EXCLUDED.client_name,
                       redirect_uris = EXCLUDED.redirect_uris,
                       is_cimd = true,
                       metadata_fetched_at = NOW()`,
                [meta.client_id, meta.client_name, meta.redirect_uris],
            );
            return { client_id: meta.client_id, client_name: meta.client_name, redirect_uris: meta.redirect_uris };
        }
        return this.getClient(clientId);
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
        resource?: string; canonicalResource: string;
    }): Promise<OAuthClient> {
        const client = await this.resolveClient(params.clientId);
        if (!client) throw new OAuthError('invalid_client', 'Unknown client_id — register the client first');
        if (!redirectUriAllowed(client.redirect_uris, params.redirectUri)) {
            throw new OAuthError('invalid_request', 'redirect_uri does not match a registered redirect URI for this client');
        }
        if (!params.codeChallenge) {
            throw new OAuthError('invalid_request', 'code_challenge is required (PKCE)');
        }
        if (params.codeChallengeMethod && params.codeChallengeMethod !== 'S256') {
            throw new OAuthError('invalid_request', 'Only the S256 code_challenge_method is supported');
        }
        // RFC 8707: the token can only be minted for this MCP server. Absent is tolerated
        // (older clients); a mismatched resource is rejected outright.
        if (params.resource && !resourceMatches(params.resource, params.canonicalResource)) {
            throw new OAuthError('invalid_target', `resource must be ${params.canonicalResource}`);
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
        resource?: string | null;
        scopeStr?: string | null;
    }): Promise<string> {
        const code = `mcpg_${crypto.randomBytes(32).toString('base64url')}`;
        const expiresAt = new Date(Date.now() + CODE_TTL_MS);
        await this.db.query(
            `INSERT INTO oauth_codes (
                code_hash, client_id, user_id, redirect_uri, code_challenge,
                capability, scope_all, allowed_host_ids, allowed_group_ids, resource, scope, expires_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
                this.hash(code), params.clientId, params.userId, params.redirectUri, params.codeChallenge,
                params.scope.capability, params.scope.scopeAll, params.scope.allowedHostIds, params.scope.allowedGroupIds,
                params.resource ?? null, params.scopeStr ?? null, expiresAt,
            ],
        );
        return code;
    }

    /** grant_type=authorization_code — verifies PKCE, consumes the code, mints an mcp_tokens row. */
    async exchangeAuthorizationCode(params: {
        clientId: string; code: string; redirectUri: string; codeVerifier: string;
        resource?: string; canonicalResource: string;
    }) {
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

        // RFC 8707: token request's resource must be consistent with the authorization request's.
        if (params.resource && !resourceMatches(params.resource, params.canonicalResource)) {
            throw new OAuthError('invalid_target', `resource must be ${params.canonicalResource}`);
        }

        const client = await this.getClient(row.client_id);
        const scope: OAuthScope = {
            capability: row.capability as McpCapability,
            scopeAll: row.scope_all,
            allowedHostIds: row.allowed_host_ids || [],
            allowedGroupIds: row.allowed_group_ids || [],
            resource: row.resource || params.canonicalResource,
            scopeStr: row.scope || 'mcp',
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
