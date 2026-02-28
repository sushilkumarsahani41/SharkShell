export declare class AuthService {
    hashPassword(password: string): Promise<string>;
    verifyPassword(password: string, hash: string): Promise<boolean>;
    generateToken(payload: any): string;
    verifyToken(token: string): any;
    getTokenFromRequest(req: any): string | null;
    authenticateRequest(req: any): Promise<any>;
}
