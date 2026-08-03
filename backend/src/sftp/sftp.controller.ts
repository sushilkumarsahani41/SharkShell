import {
    Controller, Get, Post, Delete, Param, Body, Query, Req, Res, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as path from 'path';
import { AuthGuard } from '../auth/auth.guard';
import { SftpService } from './sftp.service';

@Controller('sftp')
@UseGuards(AuthGuard)
export class SftpController {
    constructor(private sftp: SftpService) { }

    @Get('sessions')
    listSessions(@Req() req: any) {
        return { sessions: this.sftp.listSessions(req.user.id) };
    }

    @Post('sessions')
    async openSession(@Req() req: any, @Body() body: { hostId: string; password?: string; passphrase?: string }, @Res() res: Response) {
        try {
            const session = await this.sftp.openSession(req.user.id, body.hostId, { password: body.password, passphrase: body.passphrase });
            return res.status(201).json({ session });
        } catch (err: any) {
            const message = err?.message || String(err);
            if (message.includes('Encrypted') && message.includes('no passphrase')) {
                return res.status(400).json({ error: 'passphrase-needed', hostId: body.hostId });
            }
            return res.status(400).json({ error: message });
        }
    }

    @Delete('sessions/:sessionId')
    closeSession(@Req() req: any, @Param('sessionId') sessionId: string) {
        this.sftp.closeSession(req.user.id, sessionId);
        return { message: 'Session closed' };
    }

    @Get('sessions/:sessionId/list')
    async list(@Req() req: any, @Param('sessionId') sessionId: string, @Query('path') remotePath: string, @Res() res: Response) {
        try {
            const entries = await this.sftp.list(req.user.id, sessionId, remotePath || '.');
            return res.json({ entries });
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    @Get('sessions/:sessionId/stat')
    async stat(@Req() req: any, @Param('sessionId') sessionId: string, @Query('path') remotePath: string, @Res() res: Response) {
        try {
            const entry = await this.sftp.stat(req.user.id, sessionId, remotePath);
            return res.json({ entry });
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    @Post('sessions/:sessionId/mkdir')
    async mkdir(@Req() req: any, @Param('sessionId') sessionId: string, @Body() body: { path: string }, @Res() res: Response) {
        try {
            await this.sftp.mkdir(req.user.id, sessionId, body.path);
            return res.json({ message: 'Folder created' });
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    @Post('sessions/:sessionId/rename')
    async rename(@Req() req: any, @Param('sessionId') sessionId: string, @Body() body: { from: string; to: string }, @Res() res: Response) {
        try {
            await this.sftp.rename(req.user.id, sessionId, body.from, body.to);
            return res.json({ message: 'Renamed' });
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    @Delete('sessions/:sessionId/entry')
    async deleteEntry(
        @Req() req: any,
        @Param('sessionId') sessionId: string,
        @Query('path') remotePath: string,
        @Query('type') type: 'file' | 'directory',
        @Res() res: Response,
    ) {
        try {
            if (type === 'directory') await this.sftp.deleteDir(req.user.id, sessionId, remotePath);
            else await this.sftp.deleteFile(req.user.id, sessionId, remotePath);
            return res.json({ message: 'Deleted' });
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    @Get('sessions/:sessionId/download')
    async download(@Req() req: any, @Param('sessionId') sessionId: string, @Query('path') remotePath: string, @Res() res: Response) {
        try {
            const sftpClient = this.sftp.getSftp(req.user.id, sessionId);
            const fileName = path.basename(remotePath);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            res.setHeader('Content-Type', 'application/octet-stream');
            const stream = sftpClient.createReadStream(remotePath);
            stream.on('error', (err: any) => {
                if (!res.headersSent) res.status(400).json({ error: err.message });
                else res.destroy();
            });
            stream.pipe(res);
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    @Post('sessions/:sessionId/upload')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024 * 1024 } }))
    async upload(
        @Req() req: any,
        @Param('sessionId') sessionId: string,
        @Query('path') remotePath: string,
        @UploadedFile() file: any,
        @Res() res: Response,
    ) {
        if (!file) return res.status(400).json({ error: 'No file uploaded' });
        try {
            const sftpClient = this.sftp.getSftp(req.user.id, sessionId);
            await new Promise<void>((resolve, reject) => {
                const writeStream = sftpClient.createWriteStream(remotePath);
                writeStream.on('error', reject);
                writeStream.on('close', () => resolve());
                writeStream.end(file.buffer);
            });
            return res.json({ message: 'Uploaded' });
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    // Host-to-host transfer — streams server-side between two open SFTP sessions.
    @Post('transfer')
    async transfer(
        @Req() req: any,
        @Body() body: { sourceSessionId: string; sourcePath: string; destSessionId: string; destPath: string },
        @Res() res: Response,
    ) {
        try {
            await this.sftp.transfer(req.user.id, body.sourceSessionId, body.sourcePath, body.destSessionId, body.destPath);
            return res.json({ message: 'Transferred' });
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }
}
