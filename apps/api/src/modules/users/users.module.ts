import { Module } from "@nestjs/common"
import { PrismaModule } from "../../prisma/prisma.module"
import { PrismaService } from "../../prisma/prisma.service"
import { identityImportStoreOn } from "./repositories/identity-import.repository"
import { managedUserRepositoryOn } from "./repositories/managed-users.repository"
import { UsersController } from "./users.controller"
import { IDENTITY_IMPORT_STORE, MANAGED_USER_REPOSITORY, UsersDeps } from "./users.deps"

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [
    { provide: MANAGED_USER_REPOSITORY, useFactory: managedUserRepositoryOn, inject: [PrismaService] },
    { provide: IDENTITY_IMPORT_STORE, useFactory: identityImportStoreOn, inject: [PrismaService] },
    UsersDeps,
  ],
})
export class UsersModule {}
