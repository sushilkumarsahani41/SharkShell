import { Module } from '@nestjs/common';
import { HostsController } from './hosts.controller';
import { HostsService } from './hosts.service';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [AuthModule],
    controllers: [HostsController],
    providers: [HostsService],
    exports: [HostsService],
})
export class HostsModule { }
