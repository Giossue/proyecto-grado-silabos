import { Module } from "@nestjs/common"
import { publicSyllabusImage } from "../../server/configuration/logoRoutes"
import { SYLLABUS_IMAGES } from "./files.tokens"
import { SyllabusImagesController, type SyllabusImages } from "./syllabus-images.controller"

@Module({
  controllers: [SyllabusImagesController],
  providers: [{ provide: SYLLABUS_IMAGES, useValue: ((request, file) => publicSyllabusImage(request, file)) satisfies SyllabusImages }],
})
export class FilesModule {}
