import { Module } from "@nestjs/common"
import { AcademicModule } from "../academic/academic.module"
import { FichaController } from "./ficha.controller"
import { FichaDeps } from "./ficha-deps"
import { FichaImportStoreFactory } from "./ficha-import.store"

@Module({
  imports: [AcademicModule],
  controllers: [FichaController],
  providers: [FichaDeps, FichaImportStoreFactory],
})
export class FichaModule {}
