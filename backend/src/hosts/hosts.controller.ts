import {
    Controller, Get, Post, Put, Delete, Param, Body, Req, UseGuards, HttpStatus, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { HostsService } from './hosts.service';

@Controller('hosts')
@UseGuards(AuthGuard)
export class HostsController {
    constructor(private hostsService: HostsService) { }

    @Get()
    async findAll(@Req() req: any) {
        const hosts = await this.hostsService.findAllByUser(req.user.id);
        return { hosts };
    }

    @Post()
    async create(@Req() req: any, @Body() body: any, @Res() res: Response) {
        const { name, hostname, username } = body;
        if (!name || !hostname || !username) {
            return res.status(400).json({ error: 'Name, hostname, and username are required' });
        }
        const host = await this.hostsService.create(req.user.id, body);
        return res.status(201).json({ host });
    }

    @Put(':id')
    async update(@Req() req: any, @Param('id') id: string, @Body() body: any, @Res() res: Response) {
        const host = await this.hostsService.update(req.user.id, id, body);
        if (!host) {
            return res.status(404).json({ error: 'Host not found' });
        }
        return res.json({ host });
    }

    @Delete(':id')
    async remove(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
        const deleted = await this.hostsService.delete(req.user.id, id);
        if (!deleted) {
            return res.status(404).json({ error: 'Host not found' });
        }
        return res.json({ message: 'Host deleted' });
    }
}
