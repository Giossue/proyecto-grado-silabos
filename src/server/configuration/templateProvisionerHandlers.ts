import "server-only"
import { clearTemplate, createTemplate, formatTemplate, importTemplateJson } from "./templateProvisioner"
import { createProvisionDeps } from "./templateProvisionerStore"

export const createTemplateHandler = (request: Request) => createTemplate(request, createProvisionDeps())
export const formatTemplateHandler = (request: Request, templateId: string) => formatTemplate(request, templateId, createProvisionDeps())
export const clearTemplateHandler = (request: Request, templateId: string) => clearTemplate(request, templateId, createProvisionDeps())
export const importTemplateJsonHandler = (request: Request, templateId: string) => importTemplateJson(request, templateId, createProvisionDeps())
