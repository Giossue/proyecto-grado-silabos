import { Module } from "@nestjs/common"
import { CoordinationConvocationsController } from "./coordination-convocations.controller"
import { CoordinationReviewsController } from "./coordination-reviews.controller"
import { RouteAllowsGuard } from "./route-allows.guard"
import { SYLLABUS_PRELOADERS } from "./syllabus.preloaders"
import { SYLLABUS_DEPS_PROVIDERS } from "./syllabus.providers"
import { TeacherController } from "./teacher.controller"

@Module({
  controllers: [CoordinationConvocationsController, CoordinationReviewsController, TeacherController],
  providers: [...SYLLABUS_DEPS_PROVIDERS, ...SYLLABUS_PRELOADERS, RouteAllowsGuard],
})
export class SyllabusModule {}
