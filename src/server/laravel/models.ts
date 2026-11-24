const MODULES = "App\\Modules"

export const MODELS = {
  user: "App\\Models\\User",
  faculty: `${MODULES}\\Academic\\Infrastructure\\Persistence\\Models\\Faculty`,
  subject: `${MODULES}\\Academic\\Infrastructure\\Persistence\\Models\\Subject`,
  supportDocument: `${MODULES}\\Academic\\Infrastructure\\Persistence\\Models\\SupportDocument`,
  proposal: `${MODULES}\\AiAssistance\\Infrastructure\\Persistence\\Models\\TemplateAssistantProposal`,
  field: `${MODULES}\\Configuration\\Infrastructure\\Persistence\\Models\\FieldDefinition`,
  template: `${MODULES}\\Configuration\\Infrastructure\\Persistence\\Models\\SyllabusTemplate`,
  artifact: `${MODULES}\\Documents\\Infrastructure\\Persistence\\Models\\ExportArtifact`,
  roleAssignment: `${MODULES}\\Identity\\Infrastructure\\Persistence\\Models\\RoleAssignment`,
  notification: `${MODULES}\\Operations\\Infrastructure\\Persistence\\Models\\InternalNotification`,
  convocation: `${MODULES}\\Syllabus\\Infrastructure\\Persistence\\Models\\Convocation`,
  syllabus: `${MODULES}\\Syllabus\\Infrastructure\\Persistence\\Models\\Syllabus`,
  process: `${MODULES}\\Syllabus\\Infrastructure\\Persistence\\Models\\SyllabusProcess`,
  revision: `${MODULES}\\Syllabus\\Infrastructure\\Persistence\\Models\\SyllabusRevision`,
} as const
