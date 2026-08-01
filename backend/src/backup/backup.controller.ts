import { Controller, Get, Post, Put, Delete, Body, Param, Req, Res, UseGuards, Query } from '@nestjs/common';
import { Response } from 'express';
import { AdminGuard } from '../auth/admin.guard';
import { BackupService } from './backup.service';
import { RcloneService } from './rclone.service';

@Controller('backup')
@UseGuards(AdminGuard)
export class BackupController {
    constructor(
        private backupService: BackupService,
        private rclone: RcloneService,
    ) { }

    @Get('rclone-status')
    rcloneStatus() {
        return { available: this.rclone.isAvailable() };
    }

    @Get('destinations')
    async listDestinations(@Req() req: any) {
        return { destinations: await this.backupService.listDestinations(req.user.org_id) };
    }

    @Post('destinations')
    async createDestination(@Req() req: any, @Body() body: any, @Res() res: Response) {
        try {
            const destination = await this.backupService.createDestination(req.user.org_id, req.user.id, {
                name: body.name,
                type: body.type,
                config: body.config || {},
                cronExpression: body.cronExpression,
                scheduleEnabled: !!body.scheduleEnabled,
                retentionCount: body.retentionCount,
            });
            return res.status(201).json({ destination });
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    @Put('destinations/:id')
    async updateDestination(@Req() req: any, @Param('id') id: string, @Body() body: any, @Res() res: Response) {
        try {
            const destination = await this.backupService.updateDestination(req.user.org_id, id, {
                name: body.name,
                config: body.config,
                cronExpression: body.cronExpression,
                scheduleEnabled: body.scheduleEnabled,
                retentionCount: body.retentionCount,
                isActive: body.isActive,
            });
            return res.json({ destination });
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    @Delete('destinations/:id')
    async deleteDestination(@Req() req: any, @Param('id') id: string) {
        await this.backupService.deleteDestination(req.user.org_id, id);
        return { message: 'Destination deleted' };
    }

    @Post('destinations/:id/run')
    async triggerRun(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
        try {
            const run = await this.backupService.triggerBackup(req.user.org_id, id, 'manual');
            return res.json({ run });
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    @Get('runs')
    async listRuns(@Req() req: any, @Query('destinationId') destinationId?: string) {
        return { runs: await this.backupService.listRuns(req.user.org_id, destinationId) };
    }

    @Get('runs/:id/download')
    async downloadRun(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
        const file = await this.backupService.getLocalBackupPath(req.user.org_id, id);
        if (!file) {
            return res.status(404).json({ error: 'Backup file not found — only backups sent to a "Local" destination can be downloaded here.' });
        }
        return res.download(file.path, file.fileName);
    }

    @Post('runs/:id/restore')
    async restoreRun(@Req() req: any, @Param('id') id: string, @Body() body: { confirmationPhrase?: string }, @Res() res: Response) {
        if (body.confirmationPhrase !== 'RESTORE') {
            return res.status(400).json({ error: 'Restore not confirmed — this overwrites the live database and cannot be undone.' });
        }
        try {
            const result = await this.backupService.restoreLocalBackup(req.user.org_id, id);
            return res.json(result);
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }
}
