import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

@Injectable()
export class CryptoService {
    private getEncryptionKey(): Buffer {
        const key = process.env.ENCRYPTION_KEY;
        if (!key || key.length !== 64) {
            throw new Error('ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
        }
        return Buffer.from(key, 'hex');
    }

    encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
        const key = this.getEncryptionKey();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return { encrypted, iv: iv.toString('hex'), authTag };
    }

    decrypt(encryptedText: string, ivHex: string, authTagHex: string): string {
        const key = this.getEncryptionKey();
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}
