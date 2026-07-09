import { Controller, Get, Post, Delete, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { McpTokenService } from './mcp-token.service';

@Controller('mcp/token')
@UseGuards(AuthGuard)
export class McpTokenController {
    constructor(private mcpTokenService: McpTokenService) { }

    @Get()
    async status(@Req() req: any) {
        return this.mcpTokenService.getStatus(req.user.id);
    }

    @Post()
    async create(@Req() req: any) {
        return this.mcpTokenService.createOrReset(req.user.id);
    }

    @Delete()
    async revoke(@Req() req: any) {
        await this.mcpTokenService.revoke(req.user.id);
        return { message: 'MCP access key revoked' };
    }
}
