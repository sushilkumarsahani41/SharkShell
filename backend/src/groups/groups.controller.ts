import {
    Controller, Get, Post, Patch, Delete, Param, Body, Req, Query, UseGuards, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(AuthGuard)
export class GroupsController {
    constructor(private groupsService: GroupsService) { }

    @Get()
    async findAll(@Req() req: any, @Query('type') type?: string) {
        const groups = await this.groupsService.findAllByUser(req.user.id, type);
        return { groups };
    }

    @Post()
    async create(@Req() req: any, @Body() body: any, @Res() res: Response) {
        const { name, type, color } = body;
        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }
        if (!['host', 'key'].includes(type)) {
            return res.status(400).json({ error: 'Type must be "host" or "key"' });
        }
        const group = await this.groupsService.create(req.user.id, { name, type, color });
        return res.status(201).json({ group });
    }

    @Patch(':id')
    async update(@Req() req: any, @Param('id') id: string, @Body() body: any, @Res() res: Response) {
        const group = await this.groupsService.update(req.user.id, id, body);
        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }
        return res.json({ group });
    }

    @Delete(':id')
    async remove(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
        const deleted = await this.groupsService.delete(req.user.id, id);
        if (!deleted) {
            return res.status(404).json({ error: 'Group not found' });
        }
        return res.json({ message: 'Group deleted' });
    }
}
