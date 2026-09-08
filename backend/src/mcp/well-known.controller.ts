import { Controller, Get, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { baseUrl } from './mcp-origin.util';

/**
 * OAuth discovery documents (RFC 8414 / RFC 9728). These must live at fixed root-level
 * paths, so main.ts excludes them from the global "api" prefix and nginx.conf proxies
 * /.well-known/ straight to this backend.
 */
@Controller('.well-known')
export class WellKnownController {
    /** RFC 9728 Protected Resource Metadata — the MCP endpoint is the protected resource. */
    private protectedResourceDoc(req: Request) {
        const origin = baseUrl(req);
        return {
            resource: `${origin}/api/mcp`,
            authorization_servers: [origin],
            scopes_supported: ['mcp'],
            bearer_methods_supported: ['header'],
            resource_documentation: `${origin}/`,
        };
    }

    @Get('oauth-protected-resource')
    protectedResource(@Req() req: Request, @Res() res: Response) {
        return res.json(this.protectedResourceDoc(req));
    }

    // RFC 9728 path-insertion form — clients probe this before the bare path when the
    // MCP endpoint has a path component (Claude tries /.well-known/oauth-protected-resource/api/mcp first).
    @Get('oauth-protected-resource/api/mcp')
    protectedResourcePathScoped(@Req() req: Request, @Res() res: Response) {
        return res.json(this.protectedResourceDoc(req));
    }

    @Get('oauth-authorization-server')
    authorizationServer(@Req() req: Request, @Res() res: Response) {
        const origin = baseUrl(req);
        return res.json({
            issuer: origin,
            authorization_endpoint: `${origin}/oauth/authorize`,
            token_endpoint: `${origin}/api/oauth/token`,
            registration_endpoint: `${origin}/api/oauth/register`,
            response_types_supported: ['code'],
            response_modes_supported: ['query'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['none'],
            scopes_supported: ['mcp', 'offline_access'],
            // Advertised so Claude (and other MCP clients) identify with a Client ID
            // Metadata Document instead of registering a fresh client per connection.
            client_id_metadata_document_supported: true,
            service_documentation: `${origin}/`,
        });
    }
}
