import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../crypto/crypto.service';

@Injectable()
export class HostsService {
    constructor(
        private db: DatabaseService,
        private cryptoService: CryptoService,
    ) { }

    async findAllByUser(userId: string) {
        const result = await this.db.query(
            `SELECT h.id, h.name, h.hostname, h.port, h.username, h.auth_type, h.ssh_key_id,
              h.created_at, h.group_id, sk.name as key_name, g.name as group_name, g.color as group_color,
              CASE WHEN h.password_encrypted IS NOT NULL THEN true ELSE false END as has_password
       FROM hosts h
       LEFT JOIN ssh_keys sk ON h.ssh_key_id = sk.id
       LEFT JOIN groups g ON h.group_id = g.id
       WHERE h.user_id = $1
       ORDER BY h.created_at DESC`,
            [userId],
        );
        return result.rows;
    }

    async create(userId: string, data: any) {
        const { name, hostname, port, username, authType, sshKeyId, password, groupId } = data;

        let passwordEncrypted = null, passwordIv = null, passwordAuthTag = null;
        if (password) {
            const enc = this.cryptoService.encrypt(password);
            passwordEncrypted = enc.encrypted;
            passwordIv = enc.iv;
            passwordAuthTag = enc.authTag;
        }

        const result = await this.db.query(
            `INSERT INTO hosts (user_id, name, hostname, port, username, auth_type, ssh_key_id, password_encrypted, password_iv, password_auth_tag, group_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [userId, name, hostname, port || 22, username, authType || 'key', sshKeyId || null, passwordEncrypted, passwordIv, passwordAuthTag, groupId || null],
        );
        return result.rows[0];
    }

    async update(userId: string, id: string, data: any) {
        const { name, hostname, port, username, authType, sshKeyId, password, groupId } = data;

        let passwordEncrypted = null, passwordIv = null, passwordAuthTag = null;
        if (password) {
            const enc = this.cryptoService.encrypt(password);
            passwordEncrypted = enc.encrypted;
            passwordIv = enc.iv;
            passwordAuthTag = enc.authTag;
        }

        let updateQuery: string;
        let updateParams: any[];

        if (authType === 'password' && password) {
            updateQuery = `UPDATE hosts SET
        name = COALESCE($1, name),
        hostname = COALESCE($2, hostname),
        port = COALESCE($3, port),
        username = COALESCE($4, username),
        auth_type = COALESCE($5, auth_type),
        ssh_key_id = $6,
        password_encrypted = $7,
        password_iv = $8,
        password_auth_tag = $9,
        group_id = $10
      WHERE id = $11 AND user_id = $12
      RETURNING *`;
            updateParams = [name, hostname, port, username, authType, sshKeyId || null, passwordEncrypted, passwordIv, passwordAuthTag, groupId !== undefined ? (groupId || null) : null, id, userId];
        } else {
            updateQuery = `UPDATE hosts SET
        name = COALESCE($1, name),
        hostname = COALESCE($2, hostname),
        port = COALESCE($3, port),
        username = COALESCE($4, username),
        auth_type = COALESCE($5, auth_type),
        ssh_key_id = $6,
        group_id = $7
      WHERE id = $8 AND user_id = $9
      RETURNING *`;
            updateParams = [name, hostname, port, username, authType, sshKeyId || null, groupId !== undefined ? (groupId || null) : null, id, userId];
        }

        const result = await this.db.query(updateQuery, updateParams);
        return result.rows[0] || null;
    }

    async delete(userId: string, id: string) {
        const result = await this.db.query(
            'DELETE FROM hosts WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId],
        );
        return result.rows[0] || null;
    }
}
