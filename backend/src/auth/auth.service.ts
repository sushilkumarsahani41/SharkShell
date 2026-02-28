import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const TOKEN_EXPIRY = '7d';

@Injectable()
export class AuthService {
    async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 12);
    }

    async verifyPassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }

    generateToken(payload: any): string {
        return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    }

    verifyToken(token: string): any {
        try {
            return jwt.verify(token, JWT_SECRET);
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
