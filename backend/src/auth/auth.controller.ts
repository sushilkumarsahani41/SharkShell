import {
    Controller, Post, Get, Req, Res, Body, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function safeUser(user: any) {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        org_id: user.org_id,
        must_change_password: user.must_change_password,
        created_at: user.created_at,
    };
}

@Controller('auth')
export class AuthController {
    constructor(
        private authService: AuthService,
        private db: DatabaseService,
        private mailService: MailService,
    ) { }

    private setAuthCookie(res: Response, token: string) {
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7 * 1000,
            path: '/',
        });
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() body: { email: string; password: string }, @Res() res: Response) {
        try {
            const { email, password } = body;
            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            const result = await this.db.query('SELECT * FROM users WHERE email = $1', [email]);
            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            const user = result.rows[0];
            const valid = await this.authService.verifyPassword(password, user.password_hash);
            if (!valid) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }
            if (user.is_active === false) {
                return res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
            }

            const token = this.authService.generateToken({
                id: user.id, email: user.email, name: user.name, org_id: user.org_id, role: user.role,
            });

            this.setAuthCookie(res, token);
            return res.json({ user: safeUser(user), token });
        } catch (err) {
            console.error('Login error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    @Get('setup-status')
    async setupStatus(@Res() res: Response) {
        try {
            const result = await this.db.query('SELECT COUNT(*) FROM users');
            const count = parseInt(result.rows[0].count, 10);
            return res.json({ requireSetup: count === 0 });
        } catch (err) {
            console.error('Setup status error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // First-run setup only: creates the organization and its admin together
    @Post('register')
    async register(@Body() body: { email: string; password: string; name: string }, @Res() res: Response) {
        try {
            const countResult = await this.db.query('SELECT COUNT(*) FROM users');
            if (parseInt(countResult.rows[0].count, 10) > 0) {
                return res.status(403).json({ error: 'Registration is closed. Ask your administrator for an account.' });
            }

            const { email, password, name } = body;
            if (!email || !password || !name) {
                return res.status(400).json({ error: 'Name, email, and password are required' });
            }

            const passwordHash = await this.authService.hashPassword(password);
            const org = await this.db.query(
                "INSERT INTO organizations (name) VALUES ('My Organization') RETURNING id",
            );
            const orgId = org.rows[0].id;
            const result = await this.db.query(
                `INSERT INTO users (email, password_hash, name, org_id, role)
                 VALUES ($1, $2, $3, $4, 'admin')
                 RETURNING id, email, name, role, org_id, must_change_password, created_at`,
                [email, passwordHash, name, orgId],
            );
            const user = result.rows[0];
            await this.db.query('UPDATE organizations SET owner_user_id = $1 WHERE id = $2', [user.id, orgId]);

            const token = this.authService.generateToken({
                id: user.id, email: user.email, name: user.name, org_id: user.org_id, role: user.role,
            });

            this.setAuthCookie(res, token);
            return res.status(201).json({ user: safeUser(user), token });
        } catch (err) {
            console.error('Register error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Fresh from the DB so role / must_change_password changes apply without re-login
    @Get('me')
    @UseGuards(AuthGuard)
    async me(@Req() req: any, @Res() res: Response) {
        try {
            const result = await this.db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            return res.json({ user: safeUser(result.rows[0]) });
        } catch (err) {
            console.error('Me error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    @Post('change-password')
    @UseGuards(AuthGuard)
    @HttpCode(HttpStatus.OK)
    async changePassword(
        @Req() req: any,
        @Body() body: { currentPassword: string; newPassword: string },
        @Res() res: Response,
    ) {
        try {
            const { currentPassword, newPassword } = body;
            if (!currentPassword || !newPassword) {
                return res.status(400).json({ error: 'Current and new password are required' });
            }
            if (newPassword.length < 8) {
                return res.status(400).json({ error: 'New password must be at least 8 characters' });
            }

            const result = await this.db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
            const user = result.rows[0];
            if (!user) return res.status(401).json({ error: 'Unauthorized' });

            const valid = await this.authService.verifyPassword(currentPassword, user.password_hash);
            if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

            const passwordHash = await this.authService.hashPassword(newPassword);
            await this.db.query(
                'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
                [passwordHash, req.user.id],
            );
            return res.json({ message: 'Password updated' });
        } catch (err) {
            console.error('Change password error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    @Post('forgot-password')
    @HttpCode(HttpStatus.OK)
    async forgotPassword(@Body() body: { email: string }, @Req() req: Request, @Res() res: Response) {
        try {
            if (!body.email) {
                return res.status(400).json({ error: 'Email is required' });
            }
            if (!(await this.mailService.isConfigured())) {
                return res.status(503).json({
                    error: 'Password reset by email is not available — SMTP is not configured. Contact your administrator.',
                });
            }

            // Always respond identically whether or not the account exists
            const generic = { message: 'If an account exists for that email, a reset link has been sent.' };

            const result = await this.db.query(
                'SELECT id, email, is_active FROM users WHERE email = $1', [body.email],
            );
            const user = result.rows[0];
            if (!user || user.is_active === false) {
                return res.json(generic);
            }

            const token = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

            // One live token per user
            await this.db.query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [user.id]);
            await this.db.query(
                'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
                [user.id, tokenHash, expiresAt],
            );

            const baseUrl = process.env.APP_URL
                || (req.headers.origin as string)
                || `${req.protocol}://${req.get('host')}`;
            const resetLink = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${token}`;

            try {
                await this.mailService.sendPasswordReset(user.email, resetLink);
            } catch (mailErr: any) {
                console.error('Password reset mail failed:', mailErr?.message);
                return res.status(502).json({ error: 'Failed to send reset email. Check the SMTP configuration.' });
            }

            return res.json(generic);
        } catch (err) {
            console.error('Forgot password error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    @Post('reset-password')
    @HttpCode(HttpStatus.OK)
    async resetPassword(@Body() body: { token: string; password: string }, @Res() res: Response) {
        try {
            const { token, password } = body;
            if (!token || !password) {
                return res.status(400).json({ error: 'Token and new password are required' });
            }
            if (password.length < 8) {
                return res.status(400).json({ error: 'Password must be at least 8 characters' });
            }

            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const result = await this.db.query(
                'SELECT * FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()',
                [tokenHash],
            );
            const reset = result.rows[0];
            if (!reset) {
                return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
            }

            const passwordHash = await this.authService.hashPassword(password);
            await this.db.query(
                'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
                [passwordHash, reset.user_id],
            );
            await this.db.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [reset.id]);

            return res.json({ message: 'Password has been reset. You can now sign in.' });
        } catch (err) {
            console.error('Reset password error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    async logout(@Res() res: Response) {
        res.cookie('token', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/',
        });
        return res.json({ message: 'Logged out' });
    }
}
