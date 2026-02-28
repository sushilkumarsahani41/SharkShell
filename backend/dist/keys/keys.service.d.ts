import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../crypto/crypto.service';
export declare class KeysService {
    private db;
    private cryptoService;
    constructor(db: DatabaseService, cryptoService: CryptoService);
    findAllByUser(userId: string): Promise<any[]>;
    findById(userId: string, id: string): Promise<{
        id: any;
        name: any;
        public_key: any;
        private_key: any;
        key_type: any;
        fingerprint: any;
        has_passphrase: any;
        created_at: any;
    }>;
    generate(userId: string, data: any): Promise<any>;
    upload(userId: string, data: any): Promise<any>;
    updateName(userId: string, id: string, name: string): Promise<any>;
    delete(userId: string, id: string): Promise<any>;
    exportToHost(userId: string, data: any): Promise<unknown>;
}
