import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../crypto/crypto.service';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

@Injectable()
export class KeysService {
    constructor(
        private db: DatabaseService,
        private cryptoService: CryptoService,
    ) { }

    async findAllByUser(userId: string) {
        const result = await this.db.query(
            `SELECT sk.id, sk.name, sk.public_key, sk.key_type, sk.fingerprint, sk.created_at, sk.group_id,
              g.name as group_name, g.color as group_color,
              CASE WHEN sk.passphrase_encrypted IS NOT NULL THEN true ELSE false END as has_passphrase
       FROM ssh_keys sk
       LEFT JOIN groups g ON sk.group_id = g.id
       WHERE sk.user_id = $1 ORDER BY sk.created_at DESC`,
            [userId],
        );
        return result.rows;
    }

    async findById(userId: string, id: string) {
        const result = await this.db.query(
            `SELECT id, name, public_key, private_key_encrypted, iv, auth_tag, key_type, fingerprint, created_at,
              CASE WHEN passphrase_encrypted IS NOT NULL THEN true ELSE false END as has_passphrase
       FROM ssh_keys WHERE id = $1 AND user_id = $2`,
            [id, userId],
        );
        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        let privateKey = null;
        try {
            if (row.private_key_encrypted && row.iv && row.auth_tag) {
                privateKey = this.cryptoService.decrypt(row.private_key_encrypted, row.iv, row.auth_tag);
            }
        } catch {
            privateKey = '[decryption failed]';
        }

        return {
            id: row.id,
            name: row.name,
            public_key: row.public_key,
            private_key: privateKey,
            key_type: row.key_type,
            fingerprint: row.fingerprint,
            has_passphrase: row.has_passphrase,
            created_at: row.created_at,
        };
    }

    async generate(userId: string, data: any) {
        const { name, keyType, passphrase, savePassphrase, keySize, groupId } = data;

        let passphraseEncrypted = null, passphraseIv = null, passphraseAuthTag = null;
        if (passphrase && savePassphrase) {
            const enc = this.cryptoService.encrypt(passphrase);
            passphraseEncrypted = enc.encrypted;
            passphraseIv = enc.iv;
            passphraseAuthTag = enc.authTag;
        }

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-keygen-'));
        const keyPath = path.join(tmpDir, 'id_key');

        try {
            const comment = `${name || keyType} generated-by-SharkShell`;
            const passArg = passphrase ? `"${passphrase.replace(/"/g, '\\"')}"` : '""';
            let keyTypeLabel: string;

            if (keyType === 'ed25519') {
                execSync(`ssh-keygen -t ed25519 -N ${passArg} -C "${comment}" -f "${keyPath}" -q`);
                keyTypeLabel = 'ed25519';
            } else if (keyType === 'ecdsa') {
                execSync(`ssh-keygen -t ecdsa -b 256 -N ${passArg} -C "${comment}" -f "${keyPath}" -q`);
                keyTypeLabel = 'ecdsa';
            } else {
                const modulusLength = [1024, 2048, 4096].includes(Number(keySize)) ? Number(keySize) : 4096;
                execSync(`ssh-keygen -t rsa -b ${modulusLength} -N ${passArg} -C "${comment}" -f "${keyPath}" -q`);
                keyTypeLabel = `rsa-${modulusLength}`;
            }

            const privKey = fs.readFileSync(keyPath, 'utf8');
            const pubKeyPem = fs.readFileSync(`${keyPath}.pub`, 'utf8').trim();
            const sshPubKey = pubKeyPem;

            fs.rmSync(tmpDir, { recursive: true, force: true });

            const pubKeyParts = sshPubKey.split(' ');
            if (pubKeyParts.length < 2) throw new Error('Invalid generated public key format');
            const pubKeyBlob = Buffer.from(pubKeyParts[1], 'base64');
            const fingerprint = `SHA256:${crypto.createHash('sha256').update(pubKeyBlob).digest('base64')}`;

            const { encrypted, iv, authTag } = this.cryptoService.encrypt(privKey);

            const result = await this.db.query(
                `INSERT INTO ssh_keys (user_id, name, public_key, private_key_encrypted, iv, auth_tag, key_type, fingerprint, passphrase_encrypted, passphrase_iv, passphrase_auth_tag, group_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, name, public_key, key_type, fingerprint, created_at, group_id`,
                [userId, name || `${keyTypeLabel} Key`, sshPubKey, encrypted, iv, authTag, keyTypeLabel, fingerprint, passphraseEncrypted, passphraseIv, passphraseAuthTag, groupId || null],
            );

            return result.rows[0];
        } catch (err) {
            // Cleanup on error
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
            throw err;
        }
    }

    async upload(userId: string, data: any) {
        const { name, publicKey, privateKey, keyType: reqKeyType, passphrase, savePassphrase, groupId } = data;

        let passphraseEncrypted = null, passphraseIv = null, passphraseAuthTag = null;
        if (passphrase && savePassphrase) {
            const enc = this.cryptoService.encrypt(passphrase);
            passphraseEncrypted = enc.encrypted;
            passphraseIv = enc.iv;
            passphraseAuthTag = enc.authTag;
        }

        let finalPublicKey = publicKey;
        let keyType = reqKeyType;

        if (!finalPublicKey) {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-derive-'));
            const keyPath = path.join(tmpDir, 'id_key');

            try {
                fs.writeFileSync(keyPath, privateKey, { mode: 0o600 });
                const passArg = passphrase ? `"${passphrase.replace(/"/g, '\\"')}"` : '""';
                finalPublicKey = execSync(`ssh-keygen -y -P ${passArg} -f "${keyPath}"`).toString().trim();
                fs.rmSync(tmpDir, { recursive: true, force: true });

                if (!keyType) {
                    const parts = finalPublicKey.split(' ');
                    if (parts[0].includes('rsa')) keyType = 'rsa';
                    else if (parts[0].includes('ed25519')) keyType = 'ed25519';
                    else if (parts[0].includes('ecdsa')) keyType = 'ecdsa';
                    else keyType = 'imported';
                }
            } catch (err) {
                try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
                throw new Error('Failed to derive public key from the provided private key. Check if the key is valid and the passphrase (if any) is correct.');
            }
        }

        const { encrypted, iv, authTag } = this.cryptoService.encrypt(privateKey);

        const pubKeyParts = finalPublicKey.split(' ');
        let fingerprint = 'unknown';
        if (pubKeyParts.length >= 2) {
            const pubKeyBlob = Buffer.from(pubKeyParts[1], 'base64');
            fingerprint = `SHA256:${crypto.createHash('sha256').update(pubKeyBlob).digest('base64')}`;
        }

        const result = await this.db.query(
            `INSERT INTO ssh_keys (user_id, name, public_key, private_key_encrypted, iv, auth_tag, key_type, fingerprint, passphrase_encrypted, passphrase_iv, passphrase_auth_tag, group_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, name, public_key, key_type, fingerprint, created_at, group_id`,
            [userId, name, finalPublicKey, encrypted, iv, authTag, keyType || 'imported', fingerprint, passphraseEncrypted, passphraseIv, passphraseAuthTag, groupId || null],
        );

        return result.rows[0];
    }

    async updateName(userId: string, id: string, name: string) {
        const result = await this.db.query(
            'UPDATE ssh_keys SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING id, name, public_key, key_type, fingerprint, created_at',
            [name, id, userId],
        );
        return result.rows[0] || null;
    }

    async delete(userId: string, id: string) {
        const result = await this.db.query(
            'DELETE FROM ssh_keys WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId],
        );
        return result.rows[0] || null;
    }

    async exportToHost(userId: string, data: any) {
        const { keyId, hostId, password, passphrase } = data;

        const keyResult = await this.db.query(
            'SELECT * FROM ssh_keys WHERE id = $1 AND user_id = $2',
            [keyId, userId],
        );
        if (keyResult.rows.length === 0) throw new Error('Key not found');
        const sshKey = keyResult.rows[0];

        const hostResult = await this.db.query(
            'SELECT * FROM hosts WHERE id = $1 AND user_id = $2',
            [hostId, userId],
        );
        if (hostResult.rows.length === 0) throw new Error('Host not found');
        const host = hostResult.rows[0];

        const connConfig: any = {
            host: host.hostname,
            port: host.port || 22,
            username: host.username,
            readyTimeout: 15000,
        };

        if (password) {
            connConfig.password = password;
        } else if (host.ssh_key_id) {
            const existingKeyResult = await this.db.query(
                'SELECT * FROM ssh_keys WHERE id = $1 AND user_id = $2',
                [host.ssh_key_id, userId],
            );
            if (existingKeyResult.rows.length > 0) {
                const existingKey = existingKeyResult.rows[0];
                connConfig.privateKey = this.cryptoService.decrypt(existingKey.private_key_encrypted, existingKey.iv, existingKey.auth_tag);
                if (passphrase) connConfig.passphrase = passphrase;
            }
        }

        const publicKey = sshKey.public_key.trim();
        const { Client } = require('ssh2');

        return new Promise((resolve, reject) => {
            const client = new Client();
            let timedOut = false;
            const timeout = setTimeout(() => {
                timedOut = true;
                client.end();
                reject(new Error('Connection timed out'));
            }, 20000);

            client.on('ready', () => {
                const cmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${publicKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo 'KEY_EXPORTED_OK'`;
                client.exec(cmd, (err, stream) => {
                    if (err) {
                        clearTimeout(timeout);
                        client.end();
                        reject(new Error('Failed to execute command: ' + err.message));
                        return;
                    }

                    let output = '';
                    stream.on('data', (data) => { output += data.toString(); });
                    stream.stderr.on('data', (data) => { output += data.toString(); });
                    stream.on('close', () => {
                        clearTimeout(timeout);
                        client.end();
                        if (output.includes('KEY_EXPORTED_OK')) {
                            resolve({ message: 'Key exported successfully to ' + host.name });
                        } else {
                            reject(new Error('Export may have failed: ' + output));
                        }
                    });
                });
            });

            client.on('error', (err) => {
                if (timedOut) return;
                clearTimeout(timeout);
                reject(new Error('SSH connection failed: ' + err.message));
            });

            client.connect(connConfig);
        });
    }
}
