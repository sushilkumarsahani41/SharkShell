import { Response } from 'express';
import { HostsService } from './hosts.service';
export declare class HostsController {
    private hostsService;
    constructor(hostsService: HostsService);
    findAll(req: any): Promise<{
        hosts: any[];
    }>;
    create(req: any, body: any, res: Response): Promise<any>;
    update(req: any, id: string, body: any, res: Response): Promise<any>;
    remove(req: any, id: string, res: Response): Promise<any>;
}
