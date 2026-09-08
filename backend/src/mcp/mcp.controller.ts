import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { McpTokenService, McpKey } from './mcp-token.service';
import { McpService, SERVER_INSTRUCTIONS } from './mcp.service';
import { baseUrl } from './mcp-origin.util';

// Newest first. `initialize` echoes the client's version when we support it, else negotiates down to LATEST.
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];
// Per the Streamable HTTP spec, a request without MCP-Protocol-Version is assumed to be this.
const ASSUMED_PROTOCOL_VERSION = '2025-03-26';

@Controller('mcp')
export class McpController {
    constructor(
        private mcpTokenService: McpTokenService,
        private mcpService: McpService,
    ) { }

    /**
     * Streamable HTTP transport requires servers to reject requests with an untrusted `Origin`
     * (DNS-rebinding defense) — MCP 2025-11-25 makes this a 403. Server-to-server callers
     * (e.g. Claude's backend) send no Origin and pass through.
     */
    private originRejected(req: Request, res: Response): boolean {
        const origin = req.headers.origin as string | undefined;
        if (!origin) return false;
        const allowed = new Set<string>();
        const self = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
        allowed.add(self);
        if (req.headers.host) allowed.add(`https://${req.headers.host}`).add(`http://${req.headers.host}`);
        for (const o of (process.env.MCP_ALLOWED_ORIGINS || '').split(',')) {
            const trimmed = o.trim().replace(/\/$/, '');
            if (trimmed) allowed.add(trimmed);
        }
        if (allowed.has(origin.replace(/\/$/, ''))) return false;
        res.status(403).json({ error: 'Forbidden: Origin not allowed' });
        return true;
    }

    /** Reject an explicit MCP-Protocol-Version header we don't speak; absent header is fine. */
    private protocolVersionRejected(req: Request, res: Response): boolean {
        const header = req.headers['mcp-protocol-version'] as string | undefined;
        if (header === undefined) return false;
        if (SUPPORTED_PROTOCOL_VERSIONS.includes(header) || header === ASSUMED_PROTOCOL_VERSION) return false;
        res.status(400).json({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32600, message: `Unsupported MCP-Protocol-Version: ${header}` },
        });
        return true;
    }

    @Get()
    streamNotSupported(@Req() req: Request, @Res() res: Response) {
        if (this.originRejected(req, res)) return;
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'SSE streaming is not supported. Send JSON-RPC messages via POST.' });
    }

    @Post()
    async handle(@Req() req: Request, @Res() res: Response) {
        if (this.originRejected(req, res)) return;
        if (this.protocolVersionRejected(req, res)) return;

        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
        const key = await this.mcpTokenService.validate(token);
        if (!key) {
            const origin = baseUrl(req);
            res.setHeader(
                'WWW-Authenticate',
                `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="mcp", error="invalid_token"`,
            );
            return res.status(401).json({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32001, message: 'Unauthorized: invalid, expired, or missing MCP access key' },
            });
        }

        const body = req.body;
        if (Array.isArray(body)) {
            const responses = (await Promise.all(body.map((m) => this.handleMessage(key, m))))
                .filter((r) => r !== null);
            if (responses.length === 0) return res.status(202).send();
            return res.json(responses);
        }

        const response = await this.handleMessage(key, body);
        if (response === null) return res.status(202).send();
        return res.json(response);
    }

    private async handleMessage(key: McpKey, msg: any): Promise<any | null> {
        if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
            // Responses from the client (results/errors) need no reply
            if (msg && msg.jsonrpc === '2.0' && msg.id !== undefined) return null;
            return { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
        }

        // Notifications get no response
        if (msg.id === undefined || msg.id === null) return null;

        try {
            const result = await this.dispatch(key, msg.method, msg.params || {});
            return { jsonrpc: '2.0', id: msg.id, result };
        } catch (err: any) {
            return {
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: err?.rpcCode ?? -32603, message: err?.message || 'Internal error' },
            };
        }
    }

    private async dispatch(key: McpKey, method: string, params: any) {
        switch (method) {
            case 'initialize': {
                const requested = params.protocolVersion;
                const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
                    ? requested
                    : LATEST_PROTOCOL_VERSION;
                return {
                    protocolVersion,
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: { name: 'SharkShell', title: 'SharkShell', version: '2.3.0' },
                    instructions: SERVER_INSTRUCTIONS,
                };
            }
            case 'ping':
                return {};
            case 'tools/list':
                return { tools: this.mcpService.listTools(key) };
            case 'tools/call':
                return this.mcpService.callTool(key, params.name, params.arguments || {});
            default: {
                const err: any = new Error(`Method not found: ${method}`);
                err.rpcCode = -32601;
                throw err;
            }
        }
    }
}
