import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { envFiles } from "./config/workspace"
import { AcademicModule } from "./modules/academic/academic.module"
import { AiModule } from "./modules/ai/ai.module"
import { AuthModule } from "./modules/auth/auth.module"
import { DashboardModule } from "./modules/dashboard/dashboard.module"
import { ExportsModule } from "./modules/exports/exports.module"
import { FallbackModule } from "./modules/fallback/fallback.module"
import { FichaModule } from "./modules/ficha/ficha.module"
import { HelpModule } from "./modules/help/help.module"
import { LibraryModule } from "./modules/library/library.module"
import { MailModule } from "./modules/mail/mail.module"
import { NotificationsModule } from "./modules/notifications/notifications.module"
import { ProcessesModule } from "./modules/processes/processes.module"
import { SettingsModule } from "./modules/settings/settings.module"
import { SyllabusModule } from "./modules/syllabus/syllabus.module"
import { TemplateModule } from "./modules/template/template.module"
import { UsersModule } from "./modules/users/users.module"
import { KeycloakModule } from "./modules/keycloak/keycloak.module"
import { PrismaModule } from "./prisma/prisma.module"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: envFiles() }),
    PrismaModule,
    AuthModule,
    MailModule,
    NotificationsModule,
    AcademicModule,
    SyllabusModule,
    TemplateModule,
    AiModule,
    LibraryModule,
    DashboardModule,
    HelpModule,
    ExportsModule,
    UsersModule,
    SettingsModule,
    FichaModule,
    ProcessesModule,
    KeycloakModule,
    FallbackModule,
  ],
})
export class AppModule {}
