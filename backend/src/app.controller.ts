import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
    @Get()
    check() {
        return { status: 'ok', service: 'sharkshell-backend' };
    }
}
