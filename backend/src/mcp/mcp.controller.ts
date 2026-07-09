import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { McpTokenService } from './mcp-token.service';
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
        const auth = await this.mcpTokenService.validate(token);
        if (!auth) {
            return res.status(401).json({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32001, message: 'Unauthorized: invalid or missing MCP access key' },
            });
        }

        const body = req.body;
        if (Array.isArray(body)) {
            const responses = (await Promise.all(body.map((m) => this.handleMessage(auth.userId, m))))
                .filter((r) => r !== null);
            if (responses.length === 0) return res.status(202).send();
            return res.json(responses);
        }

        const response = await this.handleMessage(auth.userId, body);
        if (response === null) return res.status(202).send();
        return res.json(response);
    }

    private async handleMessage(userId: string, msg: any): Promise<any | null> {
        if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
            // Responses from the client (results/errors) need no reply
            if (msg && msg.jsonrpc === '2.0' && msg.id !== undefined) return null;
            return { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
        }

        // Notifications get no response
        if (msg.id === undefined || msg.id === null) return null;

        try {
            const result = await this.dispatch(userId, msg.method, msg.params || {});
            return { jsonrpc: '2.0', id: msg.id, result };
        } catch (err: any) {
            return {
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: err?.rpcCode ?? -32603, message: err?.message || 'Internal error' },
            };
        }
    }

    private async dispatch(userId: string, method: string, params: any) {
        switch (method) {
            case 'initialize':
                return {
                    protocolVersion: params.protocolVersion || PROTOCOL_VERSION,
                    capabilities: { tools: {} },
                    serverInfo: { name: 'SharkShell', version: '1.4.0' },
                };
            case 'ping':
                return {};
            case 'tools/list':
                return { tools: this.mcpService.listTools() };
            case 'tools/call':
                return this.mcpService.callTool(userId, params.name, params.arguments || {});
            default: {
                const err: any = new Error(`Method not found: ${method}`);
                err.rpcCode = -32601;
                throw err;
            }
        }
    }
}
