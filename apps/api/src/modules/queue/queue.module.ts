import { Module } from "@nestjs/common"
import { QueueWorkersService } from "./queue-workers.service"

@Module({ providers: [QueueWorkersService], exports: [QueueWorkersService] })
export class QueueModule {}
