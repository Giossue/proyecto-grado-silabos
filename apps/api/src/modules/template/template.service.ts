import { Inject, Injectable } from "@nestjs/common"
import { facultyLogo, institutionLogo, publicSyllabusImage } from "../../server/configuration/logoRoutes"
import { saveAiReadPermissionOf, showAiReadPermissionsOf } from "../../server/ai/readPermissionRoutes"
import type { AppSession, BridgeDeps } from "../../server/auth/types"
import { designTemplateTableOf, templateIndexOf, templateShowOf } from "../../server/configuration/templateBuilder"
import { checkTemplateDraftOf, previewTemplateDraftOf, templateDraftImpactOf } from "../../server/configuration/templateDrafts"
import { uploadTemplateLogoOf } from "../../server/configuration/templateLogo"
import { clearTemplateOf, createTemplateOf, formatTemplateOf, importTemplateJsonOf, type ProvisionWriteDeps } from "../../server/configuration/templateProvisioner"
import { exportTemplateJsonOf, teacherPreviewOf, templateSchema } from "../../server/configuration/templateReads"
import {
  destroyFieldOf,
  destroySectionOf,
  reorderFieldsOf,
  reorderSectionsOf,
  storeFieldOf,
  storeSectionOf,
  updateFieldOf,
  updateSectionOf,
  type StructureTarget,
  type StructureWriteDeps,
} from "../../server/configuration/templateStructure"
import { requestBody } from "../../server/files/uploads"
import type { PhpArray } from "../../server/http/input"
import type { StorageWriter } from "../../server/http/storageWriter"
import { AUTH_BRIDGE } from "../auth/auth.tokens"
import { AiPermissionsRepository } from "./ai-permissions.repository"
import { LogosRepository } from "./logos.repository"
import { TemplateLocksRepository } from "./template-locks.repository"
import { TemplateProvisionRepository } from "./template-provision.repository"
import { TemplateRehearsalRepository } from "./template-rehearsal.repository"
import { TemplateStructureRepository } from "./template-structure.repository"
import { TemplateRepository } from "./template.repository"
import { TEMPLATE_IDS, TEMPLATE_STORAGE, type TemplateIds } from "./template.tokens"

@Injectable()
export class TemplateService {
  constructor(
    @Inject(TemplateRepository) private readonly templates: TemplateRepository,
    @Inject(TemplateLocksRepository) private readonly locks: TemplateLocksRepository,
    @Inject(TemplateStructureRepository) private readonly structure: TemplateStructureRepository,
    @Inject(TemplateProvisionRepository) private readonly provision: TemplateProvisionRepository,
    @Inject(TemplateRehearsalRepository) private readonly rehearsal: TemplateRehearsalRepository,
    @Inject(LogosRepository) private readonly logos: LogosRepository,
    @Inject(AiPermissionsRepository) private readonly aiPermissions: AiPermissionsRepository,
    @Inject(TEMPLATE_IDS) private readonly ids: TemplateIds,
    @Inject(TEMPLATE_STORAGE) private readonly storage: StorageWriter,
    @Inject(AUTH_BRIDGE) private readonly bridge: BridgeDeps,
  ) {}

  private structureDeps(): StructureWriteDeps {
    return { structure: this.structure.store, newId: this.ids.newBlockId, newFieldId: this.ids.newFieldId }
  }

  private provisionDeps(): ProvisionWriteDeps {
    return { bridge: this.bridge, provision: this.provision.store, ...this.ids }
  }

  async index(request: Request): Promise<Response> {
    return templateIndexOf(request, await this.templates.template(), { locks: this.locks })
  }

  show(request: Request, target: StructureTarget): Promise<Response> {
    return templateShowOf(request, target.template, { locks: this.locks })
  }

  teacherPreview(target: StructureTarget): Response {
    return teacherPreviewOf(target.template)
  }

  exportJson(request: Request, target: StructureTarget): Response {
    return exportTemplateJsonOf(request, target.template)
  }

  create(request: Request, input: PhpArray): Promise<Response> {
    return createTemplateOf(request, input, this.provisionDeps())
  }

  importJson(request: Request, input: PhpArray, target: StructureTarget): Promise<Response> {
    return importTemplateJsonOf(request, input, target.template, this.provisionDeps())
  }

  format(request: Request, target: StructureTarget): Promise<Response> {
    return formatTemplateOf(request, target.template, this.provisionDeps())
  }

  clear(request: Request, target: StructureTarget): Promise<Response> {
    return clearTemplateOf(request, target.template, this.provisionDeps())
  }

  async uploadLogo(request: Request): Promise<Response> {
    return uploadTemplateLogoOf(request, await requestBody(request.clone()), { storage: this.storage })
  }

  designTable(input: PhpArray, target: StructureTarget): Promise<Response> {
    return designTemplateTableOf(input, target.template)
  }

  checkDraft(input: PhpArray, target: StructureTarget): Promise<Response> {
    return checkTemplateDraftOf(input, target.template)
  }

  previewDraft(input: PhpArray, target: StructureTarget): Promise<Response> {
    return previewTemplateDraftOf(input, target.template, this.rehearsal)
  }

  draftImpact(input: PhpArray, target: StructureTarget): Promise<Response> {
    return templateDraftImpactOf(input, target.template, this.rehearsal)
  }

  storeSection(input: PhpArray, target: StructureTarget): Promise<Response> {
    return storeSectionOf(input, target, this.structureDeps())
  }

  updateSection(input: PhpArray, target: StructureTarget, sectionId: string): Promise<Response> {
    return updateSectionOf(input, target, this.structureDeps(), sectionId)
  }

  reorderSections(input: PhpArray, target: StructureTarget): Promise<Response> {
    return reorderSectionsOf(input, target, this.structureDeps())
  }

  destroySection(target: StructureTarget, sectionId: string): Promise<Response> {
    return destroySectionOf(target, this.structureDeps(), sectionId)
  }

  storeField(input: PhpArray, target: StructureTarget, sectionId: string): Promise<Response> {
    return storeFieldOf(input, target, this.structureDeps(), sectionId)
  }

  updateField(input: PhpArray, target: StructureTarget): Promise<Response> {
    return updateFieldOf(input, target, this.structureDeps())
  }

  reorderFields(input: PhpArray, target: StructureTarget, sectionId: string): Promise<Response> {
    return reorderFieldsOf(input, target, this.structureDeps(), sectionId)
  }

  destroyField(target: StructureTarget): Promise<Response> {
    return destroyFieldOf(target, this.structureDeps())
  }

  aiReadPermissions(session: AppSession, target: StructureTarget): Promise<Response> {
    return showAiReadPermissionsOf(session, target.template, this.aiPermissions.store)
  }

  saveAiReadPermission(session: AppSession, input: PhpArray, target: StructureTarget, fieldId: string): Promise<Response> {
    return saveAiReadPermissionOf(session, input, target.template, fieldId, this.aiPermissions.store)
  }

  schema(request: Request): Promise<Response> {
    return templateSchema(request)
  }

  institutionLogo(request: Request): Promise<Response> {
    return institutionLogo(request)
  }

  facultyLogo(request: Request, facultyId: string): Promise<Response> {
    return facultyLogo(request, facultyId, { store: this.logos })
  }

  syllabusImage(request: Request, file: string): Promise<Response> {
    return publicSyllabusImage(request, file)
  }
}
