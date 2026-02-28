import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../crypto/crypto.service';
export declare class SshGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private authService;
    private db;
    private cryptoService;
    server: Server;
    private clients;
    constructor(authService: AuthService, db: DatabaseService, cryptoService: CryptoService);
    handleConnection(socket: Socket): Promise<void>;
    handleDisconnect(socket: Socket): void;
    private handleSshConnect;
    private handleSshInput;
    private handleSshResize;
    private handleSshDisconnect;
}
