import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DatabaseService } from './database/database.service';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Behind nginx the backend is reached over plain HTTP; honour X-Forwarded-Proto/Host so
    // req.protocol / req.get('host') reflect the public https origin in the OAuth discovery docs.
    app.getHttpAdapter().getInstance().set('trust proxy', true);

    // Global prefix for all routes — except the OAuth discovery documents, which RFC 8414 / RFC 9728
    // require at fixed root-level well-known paths so MCP clients can find them without config.
    app.setGlobalPrefix('api', {
        exclude: [
            '/.well-known/oauth-authorization-server',
            '/.well-known/oauth-protected-resource',
            '/.well-known/oauth-protected-resource/api/mcp',
        ],
    });

    // CORS
    app.enableCors({
        origin: '*',
        credentials: true,
    });

    // Socket.IO adapter
    app.useWebSocketAdapter(new IoAdapter(app));

    // Initialize database tables
    const dbService = app.get(DatabaseService);
    await dbService.initDB();

    const port = parseInt(process.env.PORT || '3002', 10);
    await app.listen(port, '0.0.0.0');
    console.log(`\n  🚀 SharkShell Backend running at http://0.0.0.0:${port}\n`);
}
bootstrap();
