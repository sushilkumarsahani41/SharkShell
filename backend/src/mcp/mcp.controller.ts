import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { McpTokenService, McpKey } from './mcp-token.service';
import { McpService } from './mcp.service';

const PROTOCOL_VERSION = '2025-03-26';

@Controller('mcp')
export class McpController {
    constructor(
        private mcpTokenService: McpTokenService,
        private mcpService: McpService,
    ) { }

    @Get()
    streamNotSupported(@Res() res: Response) {
        return res.status(405).json({ error: 'SSE streaming is not supported. Send JSON-RPC messages via POST.' });
    }

    @Post()
    async handle(@Req() req: Request, @Res() res: Response) {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
        const key = await this.mcpTokenService.validate(token);
        if (!key) {
            return res.status(401).json({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32001, message: 'Unauthorized: invalid or missing MCP access key' },
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
            case 'initialize':
                return {
                    protocolVersion: params.protocolVersion || PROTOCOL_VERSION,
                    capabilities: { tools: {} },
                    serverInfo: { name: 'SharkShell', version: '1.5.0' },
                };
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
