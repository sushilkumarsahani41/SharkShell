import { Response } from 'express';
import { GroupsService } from './groups.service';
export declare class GroupsController {
    private groupsService;
    constructor(groupsService: GroupsService);
    findAll(req: any, type?: string): Promise<{
        groups: any[];
    }>;
    create(req: any, body: any, res: Response): Promise<any>;
    update(req: any, id: string, body: any, res: Response): Promise<any>;
    remove(req: any, id: string, res: Response): Promise<any>;
}
