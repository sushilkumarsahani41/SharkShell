import { Controller, Get, Post, Put, Delete, Body, Param, Req, Res, UseGuards, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
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

    // Restore from a backup file uploaded from elsewhere (e.g. another instance's local
    // download). By default decryption requires THIS instance's ENCRYPTION_KEY to match the
    // one the archive was made with; pass sourceEncryptionKey to migrate a backup made under a
    // different instance's key — see docs/BACKUP.md.
    @Post('restore-upload')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024 * 1024 } }))
    async restoreUpload(@UploadedFile() file: any, @Body() body: { confirmationPhrase?: string; sourceEncryptionKey?: string }, @Res() res: Response) {
        if (body.confirmationPhrase !== 'RESTORE') {
            return res.status(400).json({ error: 'Restore not confirmed — this overwrites the live database and cannot be undone.' });
        }
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const sourceKey = body.sourceEncryptionKey?.trim() || undefined;
        if (sourceKey && sourceKey.length !== 64) {
            return res.status(400).json({ error: 'Source encryption key must be a 64-character hex string' });
        }
        const tmpPath = path.join(os.tmpdir(), `sharkshell-upload-${Date.now()}-${file.originalname || 'backup'}`);
        try {
            await fs.writeFile(tmpPath, file.buffer);
            const result = await this.backupService.restoreFromFile(tmpPath, `uploaded file "${file.originalname}"`, sourceKey);
            return res.json(result);
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        } finally {
            await fs.rm(tmpPath, { force: true }).catch(() => { });
        }
    }
}
