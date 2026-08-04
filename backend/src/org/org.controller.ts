import {
    Controller, Get, Post, Patch, Put, Delete, Body, Param, Req, Res, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { DatabaseService } from '../database/database.service';
import { OrgService } from './org.service';
import { MailService, SmtpConfig } from '../mail/mail.service';
import { UploadLimitService, MAX_UPLOAD_CEILING_MB } from '../settings/upload-limit.service';

@Controller('org')
export class OrgController {
    constructor(
        private orgService: OrgService,
        private mailService: MailService,
        private uploadLimitService: UploadLimitService,
        private db: DatabaseService,
    ) { }

    private async orgIdOf(userId: string): Promise<string> {
        const result = await this.db.query('SELECT org_id FROM users WHERE id = $1', [userId]);
        return result.rows[0]?.org_id;
    }

    // Any authenticated member can see the org name
    @Get()
    @UseGuards(AuthGuard)
    async getOrg(@Req() req: any) {
        const orgId = await this.orgIdOf(req.user.id);
        return this.orgService.getOrg(orgId);
    }

    @Patch()
    @UseGuards(AdminGuard)
    async renameOrg(@Req() req: any, @Body() body: { name: string }) {
        return this.orgService.renameOrg(req.user.org_id, body.name);
    }

    // ─── Member management (admin only) ───

    @Get('users')
    @UseGuards(AdminGuard)
    async listUsers(@Req() req: any) {
        return { users: await this.orgService.listUsers(req.user.org_id) };
    }

    @Post('users')
    @UseGuards(AdminGuard)
    async createUser(
        @Req() req: any,
        @Body() body: { name: string; email: string; password: string; role?: string },
    ) {
        return { user: await this.orgService.createUser(req.user.org_id, body) };
    }

    @Patch('users/:id')
    @UseGuards(AdminGuard)
    async updateUser(
        @Req() req: any,
        @Param('id') id: string,
        @Body() body: { role?: string; is_active?: boolean; password?: string; reset_2fa?: boolean },
    ) {
        return { user: await this.orgService.updateUser(req.user.org_id, req.user.id, id, body) };
    }

    @Delete('users/:id')
    @UseGuards(AdminGuard)
    async deleteUser(@Req() req: any, @Param('id') id: string) {
        return this.orgService.deleteUser(req.user.org_id, req.user.id, id);
    }

    // ─── SMTP settings (admin only; password never returned) ───

    @Get('smtp')
    @UseGuards(AdminGuard)
    async getSmtp() {
        const config = await this.mailService.getConfig();
        if (!config) return { configured: false, config: null };
        const { password, ...rest } = config;
        return { configured: !!(config.host && config.fromEmail), config: { ...rest, hasPassword: !!password } };
    }

    @Put('smtp')
    @UseGuards(AdminGuard)
    @HttpCode(HttpStatus.OK)
    async saveSmtp(@Body() body: Partial<SmtpConfig>, @Res() res: Response) {
        if (!body.host || !body.fromEmail) {
            return res.status(400).json({ error: 'SMTP host and from-email are required' });
        }
        const existing = await this.mailService.getConfig();
        const config: SmtpConfig = {
            host: body.host.trim(),
            port: parseInt(String(body.port), 10) || 587,
            secure: !!body.secure,
            username: body.username?.trim() || '',
            // Blank password in the form means "keep the stored one"
            password: body.password || existing?.password || '',
            fromEmail: body.fromEmail.trim(),
            fromName: body.fromName?.trim() || 'SharkShell',
        };
        await this.mailService.saveConfig(config);
        return res.json({ message: 'SMTP settings saved', configured: true });
    }

    @Post('smtp/test')
    @UseGuards(AdminGuard)
    @HttpCode(HttpStatus.OK)
    async testSmtp(@Req() req: any, @Res() res: Response) {
        try {
            await this.mailService.verifyConnection();
            await this.mailService.sendMail(
                req.user.email,
                'SharkShell — SMTP test',
                'Your SharkShell SMTP configuration works. Password reset emails will be delivered.',
            );
            return res.json({ message: `Test email sent to ${req.user.email}` });
        } catch (err: any) {
            return res.status(502).json({ error: `SMTP test failed: ${err?.message || 'unknown error'}` });
        }
    }

    // ─── Upload size limit (any member can read, so the SFTP/backup UIs can enforce
    // it client-side; only admins can change it) ───

    @Get('upload-limit')
    @UseGuards(AuthGuard)
    async getUploadLimit() {
        return { maxUploadMB: await this.uploadLimitService.getMaxUploadMB(), ceilingMB: MAX_UPLOAD_CEILING_MB };
    }

    @Put('upload-limit')
    @UseGuards(AdminGuard)
    @HttpCode(HttpStatus.OK)
    async setUploadLimit(@Body() body: { maxUploadMB: number }, @Res() res: Response) {
        try {
            const maxUploadMB = await this.uploadLimitService.setMaxUploadMB(Number(body.maxUploadMB));
            return res.json({ maxUploadMB, ceilingMB: MAX_UPLOAD_CEILING_MB });
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }
}
