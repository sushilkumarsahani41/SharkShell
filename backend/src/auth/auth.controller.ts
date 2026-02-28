import {
    Controller, Post, Get, Req, Res, Body, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { DatabaseService } from '../database/database.service';

@Controller('auth')
export class AuthController {
    constructor(
        private authService: AuthService,
        private db: DatabaseService,
    ) { }

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

            const token = this.authService.generateToken({ id: user.id, email: user.email, name: user.name });
            const safeUser = { id: user.id, email: user.email, name: user.name, created_at: user.created_at };

            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 7 * 1000,
                path: '/',
            });

            return res.json({ user: safeUser, token });
        } catch (err) {
            console.error('Login error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    @Post('register')
    async register(@Body() body: { email: string; password: string; name: string }, @Res() res: Response) {
        try {
            const { email, password, name } = body;
            if (!email || !password || !name) {
                return res.status(400).json({ error: 'Name, email, and password are required' });
            }

            const existing = await this.db.query('SELECT id FROM users WHERE email = $1', [email]);
            if (existing.rows.length > 0) {
                return res.status(409).json({ error: 'Email already registered' });
            }

            const passwordHash = await this.authService.hashPassword(password);
            const result = await this.db.query(
                'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
                [email, passwordHash, name],
            );

            const user = result.rows[0];
            const token = this.authService.generateToken({ id: user.id, email: user.email, name: user.name });

            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 7 * 1000,
                path: '/',
            });

            return res.status(201).json({ user, token });
        } catch (err) {
            console.error('Register error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    @Get('me')
    @UseGuards(AuthGuard)
    async me(@Req() req: any) {
        return { user: req.user };
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
