import { Request } from 'express';

/**
 * The externally-visible origin of this SharkShell instance. `APP_URL` is authoritative
 * (set it in production — behind nginx `req.protocol` is `http` and the discovery docs
 * MUST advertise `https://`). Falls back to the forwarded host when `trust proxy` is on.
 */
export function baseUrl(req: Request): string {
    return (process.env.APP_URL || (req.headers.origin as string) || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

/** RFC 8707 canonical resource URI for the MCP endpoint — the value tokens are audience-bound to. */
export function canonicalMcpResource(req: Request): string {
    return `${baseUrl(req)}/api/mcp`;
}

/**
 * Compare two resource identifiers per MCP auth spec: scheme + host are case-insensitive,
 * a trailing slash is not significant, the path is compared as-is.
 */
export function resourceMatches(a: string, b: string): boolean {
    const norm = (s: string) => {
        try {
            const u = new URL(s);
            return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${u.pathname.replace(/\/$/, '')}${u.search}`;
        } catch {
            return s.trim().replace(/\/$/, '');
        }
    };
    return norm(a) === norm(b);
}
