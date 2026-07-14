import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    ForbiddenException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { DatabaseService } from '../database/database.service';

// Role is read from the DB (not the JWT) so role changes apply immediately
@Injectable()
export class AdminGuard implements CanActivate {
    constructor(
        private authService: AuthService,
        private db: DatabaseService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user = await this.authService.authenticateRequest(request);
        if (!user) {
            throw new UnauthorizedException({ error: 'Unauthorized' });
        }
        const result = await this.db.query(
            'SELECT role, org_id, is_active FROM users WHERE id = $1',
            [user.id],
        );
        const row = result.rows[0];
        if (!row || row.is_active === false) {
            throw new UnauthorizedException({ error: 'Account is deactivated' });
        }
        if (row.role !== 'admin') {
            throw new ForbiddenException({ error: 'Admin access required' });
        }
        request.user = { ...user, role: row.role, org_id: row.org_id };
        return true;
    }
}
