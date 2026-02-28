import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../crypto/crypto.service';
export declare class HostsService {
    private db;
    private cryptoService;
    constructor(db: DatabaseService, cryptoService: CryptoService);
    findAllByUser(userId: string): Promise<any[]>;
    create(userId: string, data: any): Promise<any>;
    update(userId: string, id: string, data: any): Promise<any>;
    delete(userId: string, id: string): Promise<any>;
}
