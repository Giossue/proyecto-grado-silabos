import { Module } from "@nestjs/common"
import { AcademicModule } from "../academic/academic.module"
import { FichaController } from "./ficha.controller"
import { FichaDeps } from "./ficha-deps"

@Module({
  imports: [AcademicModule],
  controllers: [FichaController],
  providers: [FichaDeps],
})
export class FichaModule {}
