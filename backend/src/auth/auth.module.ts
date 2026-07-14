import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TwoFaService } from './twofa.service';

@Module({
    controllers: [AuthController],
    providers: [AuthService, TwoFaService],
    exports: [AuthService, TwoFaService],
})
export class AuthModule { }
