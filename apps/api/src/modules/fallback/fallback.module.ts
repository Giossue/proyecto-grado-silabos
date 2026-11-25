import { Module } from "@nestjs/common"
import { FallbackApiController, FallbackRootController } from "./fallback.controller"

@Module({ controllers: [FallbackApiController, FallbackRootController] })
export class FallbackModule {}
