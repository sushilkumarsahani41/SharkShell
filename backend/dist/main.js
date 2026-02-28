"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const platform_socket_io_1 = require("@nestjs/platform-socket.io");
const database_service_1 = require("./database/database.service");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix('api');
    app.enableCors({
        origin: '*',
        credentials: true,
    });
    app.useWebSocketAdapter(new platform_socket_io_1.IoAdapter(app));
    const dbService = app.get(database_service_1.DatabaseService);
    await dbService.initDB();
    const port = parseInt(process.env.PORT || '3002', 10);
    await app.listen(port, '0.0.0.0');
    console.log(`\n  🚀 SharkShell Backend running at http://0.0.0.0:${port}\n`);
}
bootstrap();
//# sourceMappingURL=main.js.map