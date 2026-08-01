import { Controller, Get, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

function baseUrl(req: Request): string {
    return (process.env.APP_URL || (req.headers.origin as string) || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

/**
 * OAuth discovery documents (RFC 8414 / RFC 9728). These must live at fixed root-level
 * paths, so main.ts excludes them from the global "api" prefix and nginx.conf proxies
 * /.well-known/ straight to this backend.
 */
@Controller('.well-known')
export class WellKnownController {
    @Get('oauth-protected-resource')
    protectedResource(@Req() req: Request, @Res() res: Response) {
        const origin = baseUrl(req);
        return res.json({
            resource: `${origin}/api/mcp`,
            authorization_servers: [origin],
        });
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
            grant_types_supported: ['authorization_code', 'refresh_token'],
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['none'],
        });
    }
}
