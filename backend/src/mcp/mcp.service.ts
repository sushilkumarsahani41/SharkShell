import { Injectable } from '@nestjs/common';
import { Client } from 'ssh2';
import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../crypto/crypto.service';
import { HostsService } from '../hosts/hosts.service';
import { KeysService } from '../keys/keys.service';

const MAX_OUTPUT_BYTES = 200 * 1024;
const DEFAULT_TIMEOUT_S = 30;
const MAX_TIMEOUT_S = 300;

@Injectable()
export class McpService {
    constructor(
        private db: DatabaseService,
        private cryptoService: CryptoService,
        private hostsService: HostsService,
        private keysService: KeysService,
    ) { }

    listTools() {
        return [
            {
                name: 'list_hosts',
                description: 'List all SSH hosts saved in SharkShell (name, address, port, username, auth type, group). Use the returned id or name with run_command.',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'list_ssh_keys',
                description: 'List SSH keys stored in the SharkShell keystore. Returns metadata and public keys only — private keys are never exposed.',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'run_command',
                description: 'Execute a shell command on a saved SSH host using its stored credentials. Returns stdout, stderr and the exit code. Fails if the host has no saved credentials.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        host: { type: 'string', description: 'Host id or host name, as returned by list_hosts' },
                        command: { type: 'string', description: 'Shell command to execute on the remote host' },
                        timeout_seconds: { type: 'number', description: `Timeout in seconds (default ${DEFAULT_TIMEOUT_S}, max ${MAX_TIMEOUT_S})` },
                    },
                    required: ['host', 'command'],
                },
            },
        ];
    }

    async callTool(userId: string, name: string, args: any) {
        try {
            switch (name) {
                case 'list_hosts': {
                    const hosts = await this.hostsService.findAllByUser(userId);
                    return this.textResult(hosts.map(h => ({
                        id: h.id, name: h.name, hostname: h.hostname, port: h.port,
                        username: h.username, auth_type: h.auth_type,
                        key_name: h.key_name, group_name: h.group_name,
                        has_saved_password: h.has_password,
                    })));
                }
                case 'list_ssh_keys': {
                    const keys = await this.keysService.findAllByUser(userId);
                    return this.textResult(keys.map(k => ({
                        id: k.id, name: k.name, key_type: k.key_type,
                        fingerprint: k.fingerprint, public_key: k.public_key,
                        group_name: k.group_name, has_passphrase: k.has_passphrase,
                    })));
                }
                case 'run_command':
                    return this.textResult(await this.runCommand(userId, args));
                default: {
                    const err: any = new Error(`Unknown tool: ${name}`);
                    err.rpcCode = -32602;
                    throw err;
                }
            }
        } catch (err: any) {
            if (err?.rpcCode) throw err;
            return { content: [{ type: 'text', text: `Error: ${err?.message || err}` }], isError: true };
        }
    }

    private textResult(value: any) {
        const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        return { content: [{ type: 'text', text }] };
    }

    private async runCommand(userId: string, args: any): Promise<string> {
        const { host, command } = args;
        if (!host || !command) {
            const err: any = new Error('Both "host" and "command" arguments are required');
            err.rpcCode = -32602;
            throw err;
        }
        const timeoutS = Math.min(Math.max(Number(args.timeout_seconds) || DEFAULT_TIMEOUT_S, 1), MAX_TIMEOUT_S);

        const result = await this.db.query(
            `SELECT * FROM hosts WHERE user_id = $1 AND (id::text = $2 OR LOWER(name) = LOWER($2)) LIMIT 1`,
            [userId, String(host)],
        );
        if (result.rows.length === 0) {
            throw new Error(`Host not found: "${host}". Use list_hosts to see available hosts.`);
        }
        const hostRow = result.rows[0];
        const connConfig = await this.buildConnConfig(userId, hostRow);
        const exec = await this.execOnHost(connConfig, command, timeoutS * 1000);

        const parts = [`Host: ${hostRow.name} (${hostRow.username}@${hostRow.hostname}:${hostRow.port})`];
        parts.push(`Exit code: ${exec.code === null ? `killed by signal ${exec.signal || 'unknown'}` : exec.code}`);
        parts.push(`--- stdout ---\n${exec.stdout || '(empty)'}`);
        if (exec.stderr) parts.push(`--- stderr ---\n${exec.stderr}`);
        if (exec.truncated) parts.push(`(output truncated at ${MAX_OUTPUT_BYTES / 1024}KB)`);
        return parts.join('\n');
    }

    private async buildConnConfig(userId: string, host: any): Promise<any> {
        const connConfig: any = {
            host: host.hostname,
            port: host.port || 22,
            username: host.username,
            readyTimeout: 20000,
        };

        if (host.auth_type === 'key') {
            if (!host.ssh_key_id) {
                throw new Error(`Host "${host.name}" has no SSH key assigned. Assign a key in SharkShell first.`);
            }
            const keyResult = await this.db.query(
                'SELECT * FROM ssh_keys WHERE id = $1 AND user_id = $2',
                [host.ssh_key_id, userId],
            );
            if (keyResult.rows.length === 0) {
                throw new Error(`The SSH key assigned to host "${host.name}" no longer exists.`);
            }
            const key = keyResult.rows[0];
            connConfig.privateKey = this.cryptoService.decrypt(key.private_key_encrypted, key.iv, key.auth_tag);
            if (key.passphrase_encrypted && key.passphrase_iv && key.passphrase_auth_tag) {
                connConfig.passphrase = this.cryptoService.decrypt(key.passphrase_encrypted, key.passphrase_iv, key.passphrase_auth_tag);
            }
        } else if (host.auth_type === 'password') {
            if (!host.password_encrypted || !host.password_iv || !host.password_auth_tag) {
                throw new Error(`Host "${host.name}" uses password auth but has no saved password. Save the password in SharkShell to use it via MCP.`);
            }
            connConfig.password = this.cryptoService.decrypt(host.password_encrypted, host.password_iv, host.password_auth_tag);
        } else {
            throw new Error(`Host "${host.name}" has unsupported auth type: ${host.auth_type}`);
        }
        return connConfig;
    }

    private execOnHost(connConfig: any, command: string, timeoutMs: number) {
        return new Promise<{ stdout: string; stderr: string; code: number | null; signal?: string; truncated: boolean }>((resolve, reject) => {
            const client = new Client();
            let settled = false;
            let stdout = '';
            let stderr = '';
            let total = 0;
            let truncated = false;

            const finish = (fn: () => void) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                fn();
                client.end();
            };
            const timer = setTimeout(
                () => finish(() => reject(new Error(`Command timed out after ${timeoutMs / 1000}s`))),
                timeoutMs,
            );

            const append = (chunk: Buffer, target: 'stdout' | 'stderr') => {
                if (total >= MAX_OUTPUT_BYTES) { truncated = true; return; }
                const room = MAX_OUTPUT_BYTES - total;
                const text = chunk.toString('utf-8');
                const sliced = text.length > room ? text.slice(0, room) : text;
                if (sliced.length < text.length) truncated = true;
                total += sliced.length;
                if (target === 'stdout') stdout += sliced;
                else stderr += sliced;
            };

            client.on('ready', () => {
                client.exec(command, (err, stream) => {
                    if (err) return finish(() => reject(new Error('Failed to execute command: ' + err.message)));
                    stream.on('data', (chunk: Buffer) => append(chunk, 'stdout'));
                    stream.stderr.on('data', (chunk: Buffer) => append(chunk, 'stderr'));
                    stream.on('close', (code: number | null, signal?: string) => {
                        finish(() => resolve({ stdout, stderr, code, signal, truncated }));
                    });
                });
            });
            client.on('error', (err) => finish(() => reject(new Error('SSH connection failed: ' + err.message))));
            client.connect(connConfig);
        });
    }
}
