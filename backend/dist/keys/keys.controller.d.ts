import { Response } from 'express';
import { KeysService } from './keys.service';
export declare class KeysController {
    private keysService;
    constructor(keysService: KeysService);
    findAll(req: any): Promise<{
        keys: any[];
    }>;
    create(req: any, body: any, res: Response): Promise<any>;
    findOne(req: any, id: string, res: Response): Promise<any>;
    update(req: any, id: string, body: any, res: Response): Promise<any>;
    remove(req: any, id: string, res: Response): Promise<any>;
    exportKey(req: any, body: any, res: Response): Promise<any>;
}
