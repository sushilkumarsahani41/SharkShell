import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { McpTokenService } from './mcp-token.service';

@Controller('mcp')
@UseGuards(AuthGuard)
export class McpTokenController {
    constructor(private mcpTokenService: McpTokenService) { }

    @Get('token')
    async list(@Req() req: any) {
        const keys = await this.mcpTokenService.list(req.user.id);
        return { keys };
    }

    @Post('token')
    async create(@Req() req: any, @Body() body: any) {
        const { token, key } = await this.mcpTokenService.create(req.user.id, body);
        return { token, key };
    }

    @Patch('token/:id')
    async update(@Req() req: any, @Param('id') id: string, @Body() body: any, @Res() res: Response) {
        const key = await this.mcpTokenService.update(req.user.id, id, body);
        if (!key) return res.status(404).json({ error: 'Key not found' });
        return res.json({ key });
    }

    @Post('token/:id/reset')
    async reset(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
        const result = await this.mcpTokenService.reset(req.user.id, id);
        if (!result) return res.status(404).json({ error: 'Key not found' });
        return res.json(result);
    }

    @Delete('token/:id')
    async revoke(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
        const ok = await this.mcpTokenService.revoke(req.user.id, id);
        if (!ok) return res.status(404).json({ error: 'Key not found' });
        return res.json({ message: 'MCP access key revoked' });
    }

    @Get('audit')
    async audit(@Req() req: any, @Query('limit') limit?: string) {
        const entries = await this.mcpTokenService.listAudit(req.user.id, limit ? parseInt(limit, 10) : 100);
        return { entries };
    }
}
