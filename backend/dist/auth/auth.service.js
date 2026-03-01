"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt = __importStar(require("jsonwebtoken"));
const bcrypt = __importStar(require("bcryptjs"));
const fs = __importStar(require("fs"));
const TOKEN_EXPIRY = '7d';
function getJwtSigningKey() {
    const keyFile = process.env.JWT_KEY_FILE;
    if (keyFile && fs.existsSync(keyFile)) {
        return { key: fs.readFileSync(keyFile), algorithm: 'RS256' };
    }
    const secret = process.env.JWT_SECRET || 'fallback-secret-change-me';
    return { key: secret, algorithm: 'HS256' };
}
function getJwtVerifyKey() {
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
let AuthService = class AuthService {
    async hashPassword(password) {
        return bcrypt.hash(password, 12);
    }
    async verifyPassword(password, hash) {
        return bcrypt.compare(password, hash);
    }
    generateToken(payload) {
        const { key, algorithm } = getJwtSigningKey();
        return jwt.sign(payload, key, { expiresIn: TOKEN_EXPIRY, algorithm });
    }
    verifyToken(token) {
        try {
            const { key, algorithms } = getJwtVerifyKey();
            return jwt.verify(token, key, { algorithms });
        }
        catch {
            return null;
        }
    }
    getTokenFromRequest(req) {
        const authHeader = req.headers?.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.slice(7);
        }
        const cookies = req.headers?.cookie || '';
        const match = cookies.match(/token=([^;]+)/);
        return match ? match[1] : null;
    }
    async authenticateRequest(req) {
        const token = this.getTokenFromRequest(req);
        if (!token)
            return null;
        return this.verifyToken(token);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)()
], AuthService);
//# sourceMappingURL=auth.service.js.map