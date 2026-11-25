import { Controller, Get, Inject, NotFoundException, Req } from "@nestjs/common"
import { ApiFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"
import { type ApiRequest, webRequestOf } from "../../common/http/web-request"
import { WebReply } from "../../common/http/web-reply"
import { KeycloakService } from "./keycloak.service"

@ApiTags("Autenticación")
@Controller()
export class KeycloakController {
  constructor(@Inject(KeycloakService) private readonly keycloak: KeycloakService) {}

  @Get("authentication/providers")
  @ApiOperation({ summary: "Formas de ingreso disponibles además de correo y contraseña." })
  @ApiOkResponse({ description: "{ keycloak: boolean }" })
  providers(): { keycloak: boolean } {
    return { keycloak: this.keycloak.enabled }
  }

  @Get("auth/keycloak")
  @ApiOperation({ summary: "Inicia el ingreso con la cuenta institucional (Keycloak)." })
  @ApiFoundResponse({ description: "Redirige a Keycloak." })
  async begin(): Promise<WebReply> {
    this.ensureEnabled()
    return new WebReply(await this.keycloak.begin())
  }

  @Get("auth/callback")
  @ApiOperation({ summary: "Retorno del ingreso con la cuenta institucional" })
  @ApiFoundResponse({ description: "Redirige a la aplicación con la sesión iniciada o con el error" })
  async callback(@Req() request: ApiRequest): Promise<WebReply> {
    this.ensureEnabled()
    return new WebReply(await this.keycloak.complete(webRequestOf(request)))
  }

  private ensureEnabled(): void {
    if (!this.keycloak.enabled) throw new NotFoundException()
  }
}
