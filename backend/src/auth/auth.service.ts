import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';

const TOKEN_EXPIRY = '7d';

// JWT signing: prefer RSA key file, fallback to string secret
function getJwtSigningKey(): { key: string | Buffer; algorithm: jwt.Algorithm } {
    const keyFile = process.env.JWT_KEY_FILE;
    if (keyFile && fs.existsSync(keyFile)) {
        return { key: fs.readFileSync(keyFile), algorithm: 'RS256' };
    }
    // Fallback to symmetric secret (dev mode or simple deployments)
    const secret = process.env.JWT_SECRET || 'fallback-secret-change-me';
    return { key: secret, algorithm: 'HS256' };
}

function getJwtVerifyKey(): { key: string | Buffer; algorithms: jwt.Algorithm[] } {
    const pubFile = process.env.JWT_PUB_FILE;
    const keyFile = process.env.JWT_KEY_FILE;
    if (pubFile && fs.existsSync(pubFile)) {
        return { key: fs.readFileSync(pubFile), algorithms: ['RS256'] };
    }
    if (keyFile && fs.existsSync(keyFile)) {
        return { key: fs.readFileSync(keyFile), algorithms: ['RS256'] };
    }
    const secret = process.env.JWT_SECRET || 'fallback-secret-change-me';
    return { key: secret, algorithms: ['HS256'] };
}

@Injectable()
export class AuthService {
    async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 12);
    }

    async verifyPassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }

    generateToken(payload: any): string {
        const { key, algorithm } = getJwtSigningKey();
        return jwt.sign(payload, key, { expiresIn: TOKEN_EXPIRY, algorithm });
    }

    verifyToken(token: string): any {
        try {
            const { key, algorithms } = getJwtVerifyKey();
            return jwt.verify(token, key, { algorithms });
        } catch {
            return null;
        }
    }

    getTokenFromRequest(req: any): string | null {
        const authHeader = req.headers?.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.slice(7);
        }
        // Also check cookies
        const cookies = req.headers?.cookie || '';
        const match = cookies.match(/token=([^;]+)/);
        return match ? match[1] : null;
    }

    async authenticateRequest(req: any): Promise<any> {
        const token = this.getTokenFromRequest(req);
        if (!token) return null;
        return this.verifyToken(token);
    }
}
