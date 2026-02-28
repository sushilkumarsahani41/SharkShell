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
exports.GroupsService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
let GroupsService = class GroupsService {
    constructor(db) {
        this.db = db;
    }
    async findAllByUser(userId, type) {
        let query = `SELECT g.*, 
            CASE WHEN g.type = 'host' THEN (SELECT COUNT(*) FROM hosts h WHERE h.group_id = g.id)
                 WHEN g.type = 'key' THEN (SELECT COUNT(*) FROM ssh_keys sk WHERE sk.group_id = g.id)
                 ELSE 0 END::int as item_count
        FROM groups g WHERE g.user_id = $1`;
        const params = [userId];
        if (type) {
            query += ` AND g.type = $2`;
            params.push(type);
        }
        query += ` ORDER BY g.created_at ASC`;
        const result = await this.db.query(query, params);
        return result.rows;
    }
    async create(userId, data) {
        const { name, type, color } = data;
        const result = await this.db.query(`INSERT INTO groups (user_id, name, type, color) VALUES ($1, $2, $3, $4) RETURNING *`, [userId, name, type, color || '#6366f1']);
        return result.rows[0];
    }
    async update(userId, id, data) {
        const { name, color } = data;
        const result = await this.db.query(`UPDATE groups SET name = COALESCE($1, name), color = COALESCE($2, color) WHERE id = $3 AND user_id = $4 RETURNING *`, [name, color, id, userId]);
        return result.rows[0] || null;
    }
    async delete(userId, id) {
        const result = await this.db.query('DELETE FROM groups WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
        return result.rows[0] || null;
    }
};
exports.GroupsService = GroupsService;
exports.GroupsService = GroupsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], GroupsService);
//# sourceMappingURL=groups.service.js.map