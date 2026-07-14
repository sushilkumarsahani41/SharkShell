import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SettingsService } from '../settings/settings.service';

export interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromEmail: string;
    fromName: string;
}

const SMTP_SETTINGS_KEY = 'smtp';

@Injectable()
export class MailService {
    constructor(private settings: SettingsService) { }

    async getConfig(): Promise<SmtpConfig | null> {
        return this.settings.get<SmtpConfig>(SMTP_SETTINGS_KEY);
    }

    async saveConfig(config: SmtpConfig): Promise<void> {
        await this.settings.set(SMTP_SETTINGS_KEY, config);
    }

    async isConfigured(): Promise<boolean> {
        const config = await this.getConfig();
        return !!(config?.host && config?.fromEmail);
    }

    private buildTransport(config: SmtpConfig) {
        return nodemailer.createTransport({
            host: config.host,
            port: config.port || 587,
            secure: !!config.secure,
            auth: config.username ? { user: config.username, pass: config.password } : undefined,
        });
    }

    async verifyConnection(): Promise<void> {
        const config = await this.getConfig();
        if (!config?.host) throw new Error('SMTP is not configured');
        await this.buildTransport(config).verify();
    }

    async sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
        const config = await this.getConfig();
        if (!config?.host || !config?.fromEmail) throw new Error('SMTP is not configured');
        const transport = this.buildTransport(config);
        await transport.sendMail({
            from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
            to,
            subject,
            text,
            html: html || undefined,
        });
    }

    async sendPasswordReset(to: string, resetLink: string): Promise<void> {
        const subject = 'SharkShell — Reset your password';
        const text = `A password reset was requested for your SharkShell account.\n\nReset your password: ${resetLink}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`;
        const html = `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                <h2 style="color:#6366f1;">🦈 SharkShell</h2>
                <p>A password reset was requested for your SharkShell account.</p>
                <p style="margin: 24px 0;">
                    <a href="${resetLink}" style="background:#6366f1;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;">Reset password</a>
                </p>
                <p style="color:#666;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
            </div>`;
        await this.sendMail(to, subject, text, html);
    }
}
