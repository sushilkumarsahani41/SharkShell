import { OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
export declare class DatabaseService implements OnModuleDestroy {
    private pool;
    constructor();
    query(text: string, params?: any[]): Promise<import("pg").QueryResult<any>>;
    initDB(): Promise<void>;
    getPool(): Pool;
    onModuleDestroy(): Promise<void>;
}
