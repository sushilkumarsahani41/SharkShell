import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';

const USER_COLUMNS = 'id, email, name, role, is_active, must_change_password, created_at';

@Injectable()
export class OrgService {
    constructor(
        private db: DatabaseService,
        private authService: AuthService,
    ) { }

    async getOrg(orgId: string) {
        const result = await this.db.query(
            `SELECT o.id, o.name, o.owner_user_id, o.created_at,
                    (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) AS member_count
             FROM organizations o WHERE o.id = $1`,
            [orgId],
        );
        if (result.rows.length === 0) throw new NotFoundException({ error: 'Organization not found' });
        return result.rows[0];
    }

    async renameOrg(orgId: string, name: string) {
        if (!name?.trim()) throw new BadRequestException({ error: 'Name is required' });
        await this.db.query('UPDATE organizations SET name = $1 WHERE id = $2', [name.trim(), orgId]);
        return this.getOrg(orgId);
    }

    async listUsers(orgId: string) {
        const result = await this.db.query(
            `SELECT ${USER_COLUMNS} FROM users WHERE org_id = $1 ORDER BY created_at`,
            [orgId],
        );
        return result.rows;
    }

    async createUser(orgId: string, data: { name: string; email: string; password: string; role?: string }) {
        const { name, email, password } = data;
        const role = data.role === 'admin' ? 'admin' : 'member';
        if (!name || !email || !password) {
            throw new BadRequestException({ error: 'Name, email, and temporary password are required' });
        }
        if (password.length < 8) {
            throw new BadRequestException({ error: 'Temporary password must be at least 8 characters' });
        }
        const existing = await this.db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            throw new BadRequestException({ error: 'Email already registered' });
        }

        const passwordHash = await this.authService.hashPassword(password);
        const result = await this.db.query(
            `INSERT INTO users (email, password_hash, name, org_id, role, must_change_password)
             VALUES ($1, $2, $3, $4, $5, true)
             RETURNING ${USER_COLUMNS}`,
            [email, passwordHash, name, orgId, role],
        );
        return result.rows[0];
    }

    private async getMember(orgId: string, userId: string) {
        const result = await this.db.query(
            `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND org_id = $2`,
            [userId, orgId],
        );
        if (result.rows.length === 0) throw new NotFoundException({ error: 'User not found' });
        return result.rows[0];
    }

    private async assertNotLastAdmin(orgId: string, userId: string, action: string) {
        const admins = await this.db.query(
            "SELECT id FROM users WHERE org_id = $1 AND role = 'admin' AND is_active = true",
            [orgId],
        );
        if (admins.rows.length === 1 && admins.rows[0].id === userId) {
            throw new BadRequestException({ error: `Cannot ${action} the last active admin` });
        }
    }

    async updateUser(
        orgId: string,
        callerId: string,
        userId: string,
        data: { role?: string; is_active?: boolean; password?: string },
    ) {
        const member = await this.getMember(orgId, userId);

        if (data.role !== undefined && data.role !== member.role) {
            if (userId === callerId) throw new ForbiddenException({ error: 'You cannot change your own role' });
            if (!['admin', 'member'].includes(data.role)) throw new BadRequestException({ error: 'Invalid role' });
            if (data.role === 'member') await this.assertNotLastAdmin(orgId, userId, 'demote');
            await this.db.query('UPDATE users SET role = $1 WHERE id = $2', [data.role, userId]);
        }

        if (data.is_active !== undefined && data.is_active !== member.is_active) {
            if (userId === callerId) throw new ForbiddenException({ error: 'You cannot deactivate your own account' });
            if (data.is_active === false) await this.assertNotLastAdmin(orgId, userId, 'deactivate');
            await this.db.query('UPDATE users SET is_active = $1 WHERE id = $2', [data.is_active, userId]);
        }

        // Admin sets a new temporary password; user must change it on next login
        if (data.password) {
            if (data.password.length < 8) {
                throw new BadRequestException({ error: 'Temporary password must be at least 8 characters' });
            }
            const passwordHash = await this.authService.hashPassword(data.password);
            await this.db.query(
                'UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2',
                [passwordHash, userId],
            );
        }

        return this.getMember(orgId, userId);
    }

    async deleteUser(orgId: string, callerId: string, userId: string) {
        await this.getMember(orgId, userId);
        if (userId === callerId) throw new ForbiddenException({ error: 'You cannot delete your own account' });
        await this.assertNotLastAdmin(orgId, userId, 'delete');
        // Resources cascade via user_id FKs (hosts, keys, groups, mcp_tokens)
        await this.db.query('DELETE FROM users WHERE id = $1', [userId]);
        return { deleted: true };
    }
}
