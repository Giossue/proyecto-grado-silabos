import { Controller, Get, Inject, Param } from "@nestjs/common"
import { ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiProduces, ApiTags } from "@nestjs/swagger"
import { TemplateService } from "./template.service"
import { WebRequest } from "./web-request.decorator"

@ApiTags("Plantilla")
@Controller()
export class TemplateAssetsController {
  constructor(@Inject(TemplateService) private readonly templates: TemplateService) {}

  @Get("plantilla.schema.json")
  @ApiProduces("application/schema+json")
  @ApiOkResponse({ description: "Esquema JSON del archivo de plantilla (público)." })
  schema(@WebRequest() request: Request) {
    return this.templates.schema(request)
  }

  @Get("logos/institucion")
  @ApiProduces("image/png")
  @ApiOkResponse({ description: "Logo institucional (público)." })
  institutionLogo(@WebRequest() request: Request) {
    return this.templates.institutionLogo(request)
  }

  @Get("logos/facultad/:faculty")
  @ApiParam({ name: "faculty", format: "uuid" })
  @ApiOkResponse({ description: "Logo de la facultad o el logo por defecto (público)." })
  @ApiNotFoundResponse({ description: "La facultad no existe." })
  facultyLogo(@WebRequest() request: Request, @Param("faculty") faculty: string) {
    return this.templates.facultyLogo(request, faculty)
  }

  @Get("images/silabo/:file")
  @ApiParam({ name: "file", enum: ["facultad.jpeg", "logo-universidad.png", "ueb.jpeg"] })
  @ApiOkResponse({ description: "Imágenes públicas del sílabo." })
  syllabusImage(@WebRequest() request: Request, @Param("file") file: string) {
    return this.templates.syllabusImage(request, file)
  }
}
