import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { OAuthService, OAuthError } from './oauth.service';
import { OAUTH_ACCESS_TOKEN_TTL_DAYS, McpCapability } from './mcp-token.service';

/** Public-facing OAuth 2.1 + Dynamic Client Registration for MCP clients (e.g. Claude connecting by URL). */
@Controller('oauth')
export class OAuthController {
    constructor(private oauth: OAuthService) { }

    @Post('register')
    async register(@Body() body: any, @Res() res: Response) {
        try {
            const client = await this.oauth.registerClient(body || {});
            return res.status(201).json({
                client_id: client.client_id,
                client_name: client.client_name,
                redirect_uris: client.redirect_uris,
                token_endpoint_auth_method: 'none',
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                client_id_issued_at: Math.floor(Date.now() / 1000),
            });
        } catch (err) {
            return this.oauthError(res, err);
        }
    }

    // Consent screen data — called by the frontend /oauth/authorize page once the user is signed in.
    @Get('authorize-info')
    @UseGuards(AuthGuard)
    async authorizeInfo(@Query() q: any, @Res() res: Response) {
        try {
            const client = await this.oauth.resolveAuthorizeRequest({
                clientId: q.client_id,
                redirectUri: q.redirect_uri,
                codeChallenge: q.code_challenge,
                codeChallengeMethod: q.code_challenge_method,
            });
            return res.json({ client_id: client.client_id, client_name: client.client_name });
        } catch (err) {
            return this.oauthError(res, err);
        }
    }

    // The user's approve/deny decision from the consent screen.
    @Post('authorize-info')
    @UseGuards(AuthGuard)
    async decide(@Req() req: any, @Body() body: any, @Res() res: Response) {
        const { clientId, redirectUri, codeChallenge, codeChallengeMethod, state, approve } = body || {};
        try {
            await this.oauth.resolveAuthorizeRequest({ clientId, redirectUri, codeChallenge, codeChallengeMethod });
        } catch (err) {
            return this.oauthError(res, err);
        }

        if (!approve) {
            const denied = new URL(redirectUri);
            denied.searchParams.set('error', 'access_denied');
            if (state) denied.searchParams.set('state', state);
            return res.json({ redirectUrl: denied.toString() });
        }

        const capability: McpCapability = body.capability === 'execute' ? 'execute' : 'read_only';
        const allowedHostIds = Array.isArray(body.allowedHostIds) ? body.allowedHostIds : [];
        const allowedGroupIds = Array.isArray(body.allowedGroupIds) ? body.allowedGroupIds : [];
        const scopeAll = body.scopeAll === true || (allowedHostIds.length === 0 && allowedGroupIds.length === 0);

        const code = await this.oauth.issueCode({
            clientId, userId: req.user.id, redirectUri, codeChallenge,
            scope: { capability, scopeAll, allowedHostIds, allowedGroupIds },
        });

        const approved = new URL(redirectUri);
        approved.searchParams.set('code', code);
        if (state) approved.searchParams.set('state', state);
        return res.json({ redirectUrl: approved.toString() });
    }

    @Post('token')
    async token(@Body() body: any, @Res() res: Response) {
        try {
            let grant: { token: string; refreshToken: string };
            if (body?.grant_type === 'authorization_code') {
                grant = await this.oauth.exchangeAuthorizationCode({
                    clientId: body.client_id, code: body.code, redirectUri: body.redirect_uri, codeVerifier: body.code_verifier,
                });
            } else if (body?.grant_type === 'refresh_token') {
                grant = await this.oauth.refreshGrant(body.refresh_token);
            } else {
                throw new OAuthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
            }
            return res.json({
                access_token: grant.token,
                token_type: 'Bearer',
                expires_in: OAUTH_ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60,
                refresh_token: grant.refreshToken,
            });
        } catch (err) {
            return this.oauthError(res, err);
        }
    }

    private oauthError(res: Response, err: any) {
        if (err instanceof OAuthError) {
            return res.status(400).json({ error: err.code, error_description: err.message });
        }
        console.error('OAuth error:', err);
        return res.status(500).json({ error: 'server_error', error_description: 'Internal error' });
    }
}
