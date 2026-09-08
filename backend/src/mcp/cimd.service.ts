import { Injectable } from '@nestjs/common';
import { isIP } from 'net';
import { lookup } from 'dns/promises';
import { OAuthError } from './oauth.service';

export interface CimdMetadata {
    client_id: string;
    client_name: string;
    redirect_uris: string[];
}

const FETCH_TIMEOUT_MS = 5000;
const MAX_DOC_BYTES = 64 * 1024;
const CACHE_TTL_MS = 10 * 60 * 1000;

/** A client_id is a Client ID Metadata Document reference when it's an https URL with a path. */
export function isCimdClientId(clientId: string): boolean {
    try {
        const u = new URL(clientId);
        return u.protocol === 'https:' && u.pathname.length > 1;
    } catch {
        return false;
    }
}

function isPrivateAddress(ip: string): boolean {
    if (isIP(ip) === 4) {
        const [a, b] = ip.split('.').map(Number);
        return (
            a === 0 || a === 10 || a === 127 ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 100 && b >= 64 && b <= 127) // CGNAT
        );
    }
    const s = ip.toLowerCase();
    return (
        s === '::1' || s === '::' ||
        s.startsWith('fe80:') || s.startsWith('fc') || s.startsWith('fd') ||
        s.startsWith('::ffff:127.') || s.startsWith('::ffff:10.') || s.startsWith('::ffff:192.168.')
    );
}

/**
 * OAuth Client ID Metadata Documents (draft-ietf-oauth-client-id-metadata-document-00).
 * Lets an MCP client (e.g. Claude Code) identify itself with an HTTPS URL instead of
 * registering via DCR. We fetch that URL, validate it, and cache the result.
 */
@Injectable()
export class CimdService {
    private cache = new Map<string, { doc: CimdMetadata; at: number }>();

    async resolve(clientIdUrl: string): Promise<CimdMetadata> {
        const cached = this.cache.get(clientIdUrl);
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.doc;

        const doc = await this.fetchAndValidate(clientIdUrl);
        this.cache.set(clientIdUrl, { doc, at: Date.now() });
        return doc;
    }

    private async fetchAndValidate(clientIdUrl: string): Promise<CimdMetadata> {
        let url: URL;
        try {
            url = new URL(clientIdUrl);
        } catch {
            throw new OAuthError('invalid_client', 'client_id is not a valid URL');
        }
        if (url.protocol !== 'https:') {
            throw new OAuthError('invalid_client', 'A URL client_id must use https');
        }

        // SSRF guard: refuse to fetch loopback / private / link-local targets.
        const host = url.hostname.toLowerCase();
        if (host === 'localhost' || host.endsWith('.local') || (isIP(host) && isPrivateAddress(host))) {
            throw new OAuthError('invalid_client', 'client_id host is not permitted');
        }
        if (!isIP(host)) {
            try {
                const records = await lookup(host, { all: true });
                if (records.some((r) => isPrivateAddress(r.address))) {
                    throw new OAuthError('invalid_client', 'client_id host resolves to a private address');
                }
            } catch (err) {
                if (err instanceof OAuthError) throw err;
                throw new OAuthError('invalid_client', 'client_id host could not be resolved');
            }
        }

        let res: Response;
        try {
            res = await fetch(url, {
                redirect: 'error',
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                headers: { Accept: 'application/json' },
            });
        } catch {
            throw new OAuthError('invalid_client', 'Could not fetch the Client ID Metadata Document');
        }
        if (!res.ok) {
            throw new OAuthError('invalid_client', `Client ID Metadata Document returned HTTP ${res.status}`);
        }

        const buf = await res.arrayBuffer();
        if (buf.byteLength > MAX_DOC_BYTES) {
            throw new OAuthError('invalid_client', 'Client ID Metadata Document is too large');
        }

        let doc: any;
        try {
            doc = JSON.parse(Buffer.from(buf).toString('utf-8'));
        } catch {
            throw new OAuthError('invalid_client', 'Client ID Metadata Document is not valid JSON');
        }

        if (doc.client_id !== clientIdUrl) {
            throw new OAuthError('invalid_client', 'client_id in the metadata document does not match its URL');
        }
        const redirectUris: string[] = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter((u: any) => typeof u === 'string') : [];
        if (redirectUris.length === 0) {
            throw new OAuthError('invalid_client', 'Client ID Metadata Document has no redirect_uris');
        }

        return {
            client_id: clientIdUrl,
            client_name: (typeof doc.client_name === 'string' && doc.client_name.trim().slice(0, 255)) || 'MCP Client',
            redirect_uris: redirectUris,
        };
    }
}
