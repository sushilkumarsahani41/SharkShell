import {
    Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { KeysService } from './keys.service';

@Controller('keys')
@UseGuards(AuthGuard)
export class KeysController {
    constructor(private keysService: KeysService) { }

    @Get()
    async findAll(@Req() req: any) {
        const keys = await this.keysService.findAllByUser(req.user.id);
        return { keys };
    }

    @Post()
    async create(@Req() req: any, @Body() body: any, @Res() res: Response) {
        try {
            if (body.action === 'generate') {
                const key = await this.keysService.generate(req.user.id, body);
                return res.status(201).json({ key });
            }

            // Upload
            if (!body.name || !body.privateKey) {
                return res.status(400).json({ error: 'Name and privateKey are required' });
            }
            const key = await this.keysService.upload(req.user.id, body);
            return res.status(201).json({ key });
        } catch (err) {
            console.error('Key operation error:', err);
            return res.status(500).json({ error: err.message || 'Key operation failed' });
        }
    }

    @Get(':id')
    async findOne(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
        const key = await this.keysService.findById(req.user.id, id);
        if (!key) {
            return res.status(404).json({ error: 'Key not found' });
        }
        return res.json({ key });
    }

    @Patch(':id')
    async update(@Req() req: any, @Param('id') id: string, @Body() body: any, @Res() res: Response) {
        const key = await this.keysService.updateName(req.user.id, id, body.name);
        if (!key) {
            return res.status(404).json({ error: 'Key not found' });
        }
        return res.json({ key });
    }

    @Delete(':id')
    async remove(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
        const deleted = await this.keysService.delete(req.user.id, id);
        if (!deleted) {
            return res.status(404).json({ error: 'Key not found' });
        }
        return res.json({ message: 'Key deleted' });
    }

    @Post('export')
    async exportKey(@Req() req: any, @Body() body: any, @Res() res: Response) {
        try {
            if (!body.keyId || !body.hostId) {
                return res.status(400).json({ error: 'keyId and hostId are required' });
            }
            const result = await this.keysService.exportToHost(req.user.id, body);
            return res.json(result);
        } catch (err) {
            console.error('Export error:', err);
            return res.status(502).json({ error: err.message || 'Export failed' });
        }
    }
}
