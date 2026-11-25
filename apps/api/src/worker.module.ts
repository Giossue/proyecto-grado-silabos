import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { envFiles } from "./config/workspace"
import { PrismaModule } from "./prisma/prisma.module"
import { QueueModule } from "./modules/queue/queue.module"

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: envFiles() }), PrismaModule, QueueModule],
})
export class WorkerModule {}
