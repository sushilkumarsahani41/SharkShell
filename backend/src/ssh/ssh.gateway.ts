import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../crypto/crypto.service';
import { Client } from 'ssh2';

@WebSocketGateway({
    path: '/api/socket',
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
})
export class SshGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private clients = new Map<string, { sshClient: Client | null; sshStream: any }>();

    constructor(
        private authService: AuthService,
        private db: DatabaseService,
        private cryptoService: CryptoService,
    ) { }

    async handleConnection(socket: Socket) {
        // Authenticate
        const token = socket.handshake.auth?.token;
        if (!token) {
            socket.emit('ssh:error', { message: 'Authentication required' });
            socket.disconnect();
            return;
        }

        const decoded = this.authService.verifyToken(token);
        if (!decoded) {
            socket.emit('ssh:error', { message: 'Invalid token' });
            socket.disconnect();
            return;
        }

        (socket as any).userId = decoded.id;
        this.clients.set(socket.id, { sshClient: null, sshStream: null });
        console.log(`  🔌 Client connected: ${socket.id}`);

        // Register event handlers
        socket.on('ssh:connect', (data) => this.handleSshConnect(socket, data));
        socket.on('ssh:input', (data) => this.handleSshInput(socket, data));
        socket.on('ssh:resize', (data) => this.handleSshResize(socket, data));
        socket.on('ssh:disconnect', () => this.handleSshDisconnect(socket));
    }

    handleDisconnect(socket: Socket) {
        console.log(`  🔌 Client disconnected: ${socket.id}`);
        const clientData = this.clients.get(socket.id);
        if (clientData) {
            if (clientData.sshStream) clientData.sshStream.close();
            if (clientData.sshClient) clientData.sshClient.end();
            this.clients.delete(socket.id);
        }
    }

    private async handleSshConnect(socket: Socket, data: any) {
        try {
            const { hostId, password, passphrase } = data;
            const userId = (socket as any).userId;

            const hostResult = await this.db.query(
                'SELECT * FROM hosts WHERE id = $1 AND user_id = $2',
                [hostId, userId],
            );

            if (hostResult.rows.length === 0) {
                socket.emit('ssh:error', { message: 'Host not found' });
                return;
            }

            const host = hostResult.rows[0];

            const connConfig: any = {
                host: host.hostname,
                port: host.port || 22,
                username: host.username,
                readyTimeout: 20000,
                keepaliveInterval: 10000,
            };

            // Auth: key-based or password
            if (host.auth_type === 'key' && host.ssh_key_id) {
                const keyResult = await this.db.query(
                    'SELECT * FROM ssh_keys WHERE id = $1 AND user_id = $2',
                    [host.ssh_key_id, userId],
                );
                if (keyResult.rows.length > 0) {
                    const key = keyResult.rows[0];
                    const privateKey = this.cryptoService.decrypt(key.private_key_encrypted, key.iv, key.auth_tag);
                    connConfig.privateKey = privateKey;

                    if (passphrase) {
                        connConfig.passphrase = passphrase;
                    } else if (key.passphrase_encrypted && key.passphrase_iv && key.passphrase_auth_tag) {
                        connConfig.passphrase = this.cryptoService.decrypt(key.passphrase_encrypted, key.passphrase_iv, key.passphrase_auth_tag);
                    }
                }
            } else if (host.auth_type === 'password') {
                if (password) {
                    connConfig.password = password;
                } else if (host.password_encrypted && host.password_iv && host.password_auth_tag) {
                    connConfig.password = this.cryptoService.decrypt(host.password_encrypted, host.password_iv, host.password_auth_tag);
                }
            }

            const sshClient = new Client();
            const clientData = this.clients.get(socket.id);
            if (clientData) {
                clientData.sshClient = sshClient;
            }

            sshClient.on('ready', () => {
                socket.emit('ssh:connected');

                sshClient.shell(
                    {
                        term: 'xterm-256color',
                        cols: data.cols || 80,
                        rows: data.rows || 24,
                    },
                    (err, stream) => {
                        if (err) {
                            socket.emit('ssh:error', { message: 'Failed to open shell: ' + err.message });
                            return;
                        }

                        if (clientData) {
                            clientData.sshStream = stream;
                        }

                        stream.on('data', (chunk) => {
                            socket.emit('ssh:data', chunk.toString('utf-8'));
                        });

                        stream.stderr.on('data', (chunk) => {
                            socket.emit('ssh:data', chunk.toString('utf-8'));
                        });

                        stream.on('close', () => {
                            socket.emit('ssh:closed', { message: 'Session ended' });
                            if (sshClient) sshClient.end();
                        });
                    },
                );
            });

            sshClient.on('error', (err) => {
                console.error('SSH connection error:', err.message);
                socket.emit('ssh:error', { message: 'Connection failed: ' + err.message });
            });

            sshClient.on('close', () => {
                socket.emit('ssh:closed', { message: 'Connection closed' });
            });

            sshClient.connect(connConfig);
        } catch (err) {
            console.error('SSH proxy error:', err);
            socket.emit('ssh:error', { message: (err as Error).message });
        }
    }

    private handleSshInput(socket: Socket, data: any) {
        const clientData = this.clients.get(socket.id);
        if (clientData?.sshStream) {
            clientData.sshStream.write(data);
        }
    }

    private handleSshResize(socket: Socket, data: { cols: number; rows: number }) {
        const clientData = this.clients.get(socket.id);
        if (clientData?.sshStream) {
            clientData.sshStream.setWindow(data.rows, data.cols, 0, 0);
        }
    }

    private handleSshDisconnect(socket: Socket) {
        const clientData = this.clients.get(socket.id);
        if (clientData) {
            if (clientData.sshStream) clientData.sshStream.close();
            if (clientData.sshClient) clientData.sshClient.end();
        }
    }
}
