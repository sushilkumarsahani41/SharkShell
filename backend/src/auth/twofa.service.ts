import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../crypto/crypto.service';

const RECOVERY_CODE_COUNT = 10;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
// Accept the previous/next 30s step to absorb clock drift
const TOLERANCE_SECONDS = 30;

@Injectable()
export class TwoFaService {
    constructor(
        private db: DatabaseService,
        private cryptoService: CryptoService,
    ) { }

    // In-memory brute-force limiter per user
    private attempts = new Map<string, { count: number; lockedUntil: number }>();

    isLocked(userId: string): boolean {
        const entry = this.attempts.get(userId);
        return !!entry && entry.lockedUntil > Date.now();
    }

    recordFailure(userId: string): void {
        const entry = this.attempts.get(userId) || { count: 0, lockedUntil: 0 };
        entry.count += 1;
        if (entry.count >= MAX_ATTEMPTS) {
            entry.lockedUntil = Date.now() + LOCKOUT_MS;
            entry.count = 0;
        }
        this.attempts.set(userId, entry);
    }

    clearFailures(userId: string): void {
        this.attempts.delete(userId);
    }

    generateSecret(): string {
        return generateSecret();
    }

    async buildEnrollment(email: string, secret: string) {
        const otpauthUrl = generateURI({ issuer: 'SharkShell', label: email, secret });
        const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
        return { otpauthUrl, qrDataUrl };
    }

    verifyCode(secret: string, code: string): boolean {
        try {
            const token = (code || '').replace(/\s/g, '');
            if (!/^\d{6}$/.test(token)) return false;
            return verifySync({ secret, token, epochTolerance: TOLERANCE_SECONDS }).valid;
        } catch {
            return false;
        }
    }

    decryptSecret(user: any): string | null {
        if (!user.totp_secret_encrypted || !user.totp_iv || !user.totp_auth_tag) return null;
        try {
            return this.cryptoService.decrypt(user.totp_secret_encrypted, user.totp_iv, user.totp_auth_tag);
        } catch {
            return null;
        }
    }

    generateRecoveryCodes(): { codes: string[]; hashes: string[] } {
        const codes: string[] = [];
        const hashes: string[] = [];
        for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
            const raw = crypto.randomBytes(5).toString('hex'); // 10 hex chars
            const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
            codes.push(code);
            hashes.push(this.hashRecoveryCode(code));
        }
        return { codes, hashes };
    }

    hashRecoveryCode(code: string): string {
        return crypto.createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
    }

    // Consumes the recovery code if it matches; returns whether it did
    async useRecoveryCode(user: any, code: string): Promise<boolean> {
        const hash = this.hashRecoveryCode(code);
        const stored: string[] = user.totp_recovery_codes || [];
        if (!stored.includes(hash)) return false;
        await this.db.query(
            'UPDATE users SET totp_recovery_codes = array_remove(totp_recovery_codes, $1) WHERE id = $2',
            [hash, user.id],
        );
        return true;
    }

    async clearTwoFa(userId: string): Promise<void> {
        await this.db.query(
            `UPDATE users SET totp_enabled = false, totp_secret_encrypted = NULL,
             totp_iv = NULL, totp_auth_tag = NULL, totp_recovery_codes = '{}' WHERE id = $1`,
            [userId],
        );
        this.clearFailures(userId);
    }
}
