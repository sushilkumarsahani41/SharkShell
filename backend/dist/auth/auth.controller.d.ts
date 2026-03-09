import { Response } from 'express';
import { AuthService } from './auth.service';
import { DatabaseService } from '../database/database.service';
export declare class AuthController {
    private authService;
    private db;
    constructor(authService: AuthService, db: DatabaseService);
    login(body: {
        email: string;
        password: string;
    }, res: Response): Promise<any>;
    setupStatus(res: Response): Promise<any>;
    register(body: {
        email: string;
        password: string;
        name: string;
    }, res: Response): Promise<any>;
    me(req: any): Promise<{
        user: any;
    }>;
    logout(res: Response): Promise<any>;
}
