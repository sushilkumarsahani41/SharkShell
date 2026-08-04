import { Injectable } from '@nestjs/common';
import { SettingsService } from './settings.service';

const SETTINGS_KEY = 'upload_limit';
export const DEFAULT_MAX_UPLOAD_MB = 500;
// Hard ceiling an admin can configure up to — also the multer/nginx limit, so a
// misconfigured huge value here can't accidentally let uploads exhaust disk/memory.
export const MAX_UPLOAD_CEILING_MB = 2048;

@Injectable()
export class UploadLimitService {
    constructor(private settings: SettingsService) { }

    async getMaxUploadMB(): Promise<number> {
        const data = await this.settings.get<{ maxUploadMB: number }>(SETTINGS_KEY);
        return data?.maxUploadMB ?? DEFAULT_MAX_UPLOAD_MB;
    }

    async getMaxUploadBytes(): Promise<number> {
        return (await this.getMaxUploadMB()) * 1024 * 1024;
    }

    async setMaxUploadMB(mb: number): Promise<number> {
        if (!Number.isFinite(mb) || mb < 1) {
            throw new Error('Upload limit must be at least 1MB');
        }
        const clamped = Math.min(Math.round(mb), MAX_UPLOAD_CEILING_MB);
        await this.settings.set(SETTINGS_KEY, { maxUploadMB: clamped });
        return clamped;
    }
}
