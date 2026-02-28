"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
let DatabaseService = class DatabaseService {
    constructor() {
        this.pool = new pg_1.Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432', 10),
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'ssh_client',
        });
    }
    async query(text, params) {
        const client = await this.pool.connect();
        try {
            return await client.query(text, params);
        }
        finally {
            client.release();
        }
    }
    async initDB() {
        await this.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
        await this.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(20) NOT NULL,
        color VARCHAR(7) DEFAULT '#6366f1',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
        await this.query(`
      CREATE TABLE IF NOT EXISTS ssh_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        public_key TEXT NOT NULL,
        private_key_encrypted TEXT NOT NULL,
        iv VARCHAR(64) NOT NULL,
        auth_tag VARCHAR(64) NOT NULL,
        key_type VARCHAR(50) DEFAULT 'rsa',
        fingerprint VARCHAR(255),
        passphrase_encrypted TEXT,
        passphrase_iv VARCHAR(64),
        passphrase_auth_tag VARCHAR(64),
        group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
        await this.query(`
      CREATE TABLE IF NOT EXISTS hosts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        hostname VARCHAR(255) NOT NULL,
        port INTEGER DEFAULT 22,
        username VARCHAR(255) NOT NULL,
        auth_type VARCHAR(50) DEFAULT 'key',
        ssh_key_id UUID,
        password_encrypted TEXT,
        password_iv VARCHAR(64),
        password_auth_tag VARCHAR(64),
        group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
        try {
            await this.query(`ALTER TABLE hosts DROP CONSTRAINT IF EXISTS hosts_ssh_key_id_fkey`);
            await this.query(`ALTER TABLE hosts ADD CONSTRAINT hosts_ssh_key_id_fkey FOREIGN KEY (ssh_key_id) REFERENCES ssh_keys(id) ON DELETE SET NULL`);
        }
        catch (err) {
        }
        const alterQueries = [
            "ALTER TABLE hosts ADD COLUMN IF NOT EXISTS password_encrypted TEXT",
            "ALTER TABLE hosts ADD COLUMN IF NOT EXISTS password_iv VARCHAR(64)",
            "ALTER TABLE hosts ADD COLUMN IF NOT EXISTS password_auth_tag VARCHAR(64)",
            "ALTER TABLE ssh_keys ADD COLUMN IF NOT EXISTS passphrase_encrypted TEXT",
            "ALTER TABLE ssh_keys ADD COLUMN IF NOT EXISTS passphrase_iv VARCHAR(64)",
            "ALTER TABLE ssh_keys ADD COLUMN IF NOT EXISTS passphrase_auth_tag VARCHAR(64)",
            "ALTER TABLE hosts ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL",
            "ALTER TABLE ssh_keys ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL",
        ];
        for (const q of alterQueries) {
            try {
                await this.query(q);
            }
            catch { }
        }
        console.log('  ✅ Database tables initialized');
    }
    getPool() {
        return this.pool;
    }
    async onModuleDestroy() {
        await this.pool.end();
    }
};
exports.DatabaseService = DatabaseService;
exports.DatabaseService = DatabaseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], DatabaseService);
//# sourceMappingURL=database.service.js.map