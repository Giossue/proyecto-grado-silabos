import { Module } from "@nestjs/common"
import { LegacyApiController, LegacyRootController } from "./legacy.controller"

@Module({ controllers: [LegacyApiController, LegacyRootController] })
export class LegacyModule {}
