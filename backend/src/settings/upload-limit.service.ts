import { Injectable } from '@nestjs/common';
import { SettingsService } from './settings.service';

const SETTINGS_KEY = 'upload_limit';
export const DEFAULT_MAX_UPLOAD_MB = 500;
// Hard ceiling an admin can configure up to via Settings — also the multer/nginx
// limit, so a misconfigured huge value here can't accidentally let one upload
// exhaust the container's disk/memory. Overridable per-deployment via MAX_UPLOAD_GB
// (see docs/SFTP.md) since a 50GB default won't suit every host; falls back to 50
// if unset or invalid. nginx's own client_max_body_size is templated from the same
// env var at container start (docker-entrypoint.sh) — the two must stay in sync,
// which is why nginx reads MAX_UPLOAD_GB directly rather than a value computed here.
export const MAX_UPLOAD_CEILING_MB = (() => {
    const gb = parseInt(process.env.MAX_UPLOAD_GB || '', 10);
    return (Number.isFinite(gb) && gb > 0 ? gb : 50) * 1024;
})();

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
