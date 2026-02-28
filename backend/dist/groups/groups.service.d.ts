import { DatabaseService } from '../database/database.service';
export declare class GroupsService {
    private db;
    constructor(db: DatabaseService);
    findAllByUser(userId: string, type?: string): Promise<any[]>;
    create(userId: string, data: {
        name: string;
        type: string;
        color?: string;
    }): Promise<any>;
    update(userId: string, id: string, data: {
        name?: string;
        color?: string;
    }): Promise<any>;
    delete(userId: string, id: string): Promise<any>;
}
