import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../crypto/crypto.service';

@Injectable()
export class SettingsService {
    constructor(
        private db: DatabaseService,
        private cryptoService: CryptoService,
    ) { }

    // Values are stored as AES-256-GCM encrypted JSON blobs
    async get<T = any>(key: string): Promise<T | null> {
        const result = await this.db.query('SELECT value, iv, auth_tag FROM app_settings WHERE key = $1', [key]);
        if (result.rows.length === 0 || !result.rows[0].value) return null;
        try {
            const { value, iv, auth_tag } = result.rows[0];
            return JSON.parse(this.cryptoService.decrypt(value, iv, auth_tag));
        } catch {
            return null;
        }
    }

    async set(key: string, data: any): Promise<void> {
        const { encrypted, iv, authTag } = this.cryptoService.encrypt(JSON.stringify(data));
        await this.db.query(
            `INSERT INTO app_settings (key, value, iv, auth_tag, updated_at) VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $2, iv = $3, auth_tag = $4, updated_at = NOW()`,
            [key, encrypted, iv, authTag],
        );
    }

    async delete(key: string): Promise<void> {
        await this.db.query('DELETE FROM app_settings WHERE key = $1', [key]);
    }
}
