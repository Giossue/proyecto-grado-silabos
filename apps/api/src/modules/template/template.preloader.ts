import { Inject, Injectable } from "@nestjs/common"
import type { SessionPreloader } from "../../common/decorators/authenticated.options"
import type { SessionRequest } from "../../common/http/session-request"
import { MODELS } from "../../server/http/models"
import { modelNotFound } from "../../server/http/router"
import { findTemplate } from "../../server/configuration/templateReads"
import { findField, type StructureTarget } from "../../server/configuration/templateStructure"
import { TemplateStructureRepository } from "./template-structure.repository"
import { TemplateRepository } from "./template.repository"

@Injectable()
export class TemplatePreloader implements SessionPreloader {
  constructor(@Inject(TemplateRepository) private readonly templates: TemplateRepository) {}

  async load(_request: Request, _user: unknown, http: SessionRequest): Promise<Response | null> {
    const id = String(http.params.template ?? "")
    const template = await findTemplate(id, this.templates)
    if (template === null) return modelNotFound(MODELS.template, id)
    http.preloaded = { template, field: null } satisfies StructureTarget
    return null
  }
}

@Injectable()
export class TemplateFieldPreloader implements SessionPreloader {
  constructor(
    @Inject(TemplateRepository) private readonly templates: TemplateRepository,
    @Inject(TemplateStructureRepository) private readonly structure: TemplateStructureRepository,
  ) {}

  async load(_request: Request, _user: unknown, http: SessionRequest): Promise<Response | null> {
    const fieldId = String(http.params.field ?? "")
    const field = await findField(fieldId, this.structure.store)
    if (field === null) return modelNotFound(MODELS.field, fieldId)
    const id = String(http.params.template ?? "")
    const template = await findTemplate(id, this.templates)
    if (template === null) return modelNotFound(MODELS.template, id)
    http.preloaded = { template, field } satisfies StructureTarget
    return null
  }
}
