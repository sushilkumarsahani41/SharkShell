import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class GroupsService {
    constructor(private db: DatabaseService) { }

    async findAllByUser(userId: string, type?: string) {
        let query = `SELECT g.*, 
            CASE WHEN g.type = 'host' THEN (SELECT COUNT(*) FROM hosts h WHERE h.group_id = g.id)
                 WHEN g.type = 'key' THEN (SELECT COUNT(*) FROM ssh_keys sk WHERE sk.group_id = g.id)
                 ELSE 0 END::int as item_count
        FROM groups g WHERE g.user_id = $1`;
        const params: any[] = [userId];

        if (type) {
            query += ` AND g.type = $2`;
            params.push(type);
        }

        query += ` ORDER BY g.created_at ASC`;
        const result = await this.db.query(query, params);
        return result.rows;
    }

    async create(userId: string, data: { name: string; type: string; color?: string }) {
        const { name, type, color } = data;
        const result = await this.db.query(
            `INSERT INTO groups (user_id, name, type, color) VALUES ($1, $2, $3, $4) RETURNING *`,
            [userId, name, type, color || '#6366f1'],
        );
        return result.rows[0];
    }

    async update(userId: string, id: string, data: { name?: string; color?: string }) {
        const { name, color } = data;
        const result = await this.db.query(
            `UPDATE groups SET name = COALESCE($1, name), color = COALESCE($2, color) WHERE id = $3 AND user_id = $4 RETURNING *`,
            [name, color, id, userId],
        );
        return result.rows[0] || null;
    }

    async delete(userId: string, id: string) {
        const result = await this.db.query(
            'DELETE FROM groups WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId],
        );
        return result.rows[0] || null;
    }
}
