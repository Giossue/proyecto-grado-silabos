import { failModelNotFound } from "../http/failures"
import { MODELS } from "../http/models"
import type { StoredFaculty } from "../shared/logoStore"
import { facultyIsConfigured } from "../configuration/institutionalLogos"
import { profileComplete } from "../configuration/subjectProfileFields"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import type { TemplateStore } from "../shared/templateStore"
import { templateProblem } from "../syllabus/processes"
import type { ConvocationRecord, ProcessRecord } from "./dashboard"

export type SetupStep = { key: string; label: string; hint: string; done: boolean; action: string | null }
export type SetupChecklist = { title: string; intro: string; done: number; total: number; steps: SetupStep[] }

export type CareerReadinessFacts = {
  subjectsCount: number
  faculty: StoredFaculty | null
  scheduledSubjectIds: string[]
  scheduledWithParallels: number
  parallelTotal: number
  parallelsWithTeacher: number
}

export type CoordinatorReadiness = {
  process: ProcessRecord | null
  convocation: ConvocationRecord | null
  curriculumReady: boolean
  scheduledTotal: number
  scheduledWithParallels: number
  parallelTotal: number
  parallelsWithTeacher: number
  subjectsWithoutProfile: number
  templateReady: boolean
  facultyLogoReady: boolean
  deadlineOpen: boolean
  canOpen: boolean
}

export interface SetupRepository {
  activeFacultyExists(): Promise<boolean>
  activeCareerCount(): Promise<number>
  activeCareersWithoutCoordinator(): Promise<number>
  activeUserWithRole(role: string): Promise<boolean>
  processExists(): Promise<boolean>
  templateHasFields(templateId: string): Promise<boolean>
  processSyllabusCounts(processId: string): Promise<{ total: number; approved: number; notStarted: number }>
  careersWithoutConvocation(processId: string): Promise<number>
  careerReadiness(careerId: string): Promise<CareerReadinessFacts | null>
  careerHasActiveTeacher(careerId: string): Promise<boolean>
}


const TEMPLATE_HINT = "Secciones y campos con un responsable: Docente, Coordinación o Institucional. El mismo editor permite texto, listas y tablas."
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

function step(key: string, label: string, hint: string, done: boolean, action: string | null = null): SetupStep {
  return { key, label, hint, done, action }
}

function build(title: string, intro: string, steps: SetupStep[], start: SetupStep | null = null, startAction: string | null = null): SetupChecklist {
  const all = [...steps]
  if (start !== null) {
    const previousDone = steps.every((item) => item.done)
    all.push(startAction === null ? start : { ...start, action: !start.done && previousDone ? startAction : null })
  }
  return { title, intro, done: all.filter((item) => item.done).length, total: all.length, steps: all }
}

export async function templateHasStructure(template: SyllabusTemplate, setup: SetupRepository): Promise<boolean> {
  return template.sections.length > 0 && template.sections.some((section) => section.blocks.length > 0) && (await setup.templateHasFields(template.id))
}

async function templateStepProblem(template: SyllabusTemplate | null): Promise<string | null> {
  if (template === null) return "La plantilla institucional no existe."
  return templateProblem(template, template.definition)
}

export async function administratorSetup(setup: SetupRepository, templates: TemplateStore): Promise<SetupChecklist> {
  const careersWithoutCoordinator = await setup.activeCareersWithoutCoordinator()
  const careerCount = await setup.activeCareerCount()
  const accountsReady = (await setup.activeUserWithRole("coordinador")) && (await setup.activeUserWithRole("bibliotecario"))
  const template = await templates.template()
  const problem = await templateStepProblem(template)
  const hint = problem !== null && template !== null && (await templateHasStructure(template, setup)) ? problem : TEMPLATE_HINT
  return build(
    "Antes de empezar",
    "En este orden. Cada paso habilita el siguiente; las coordinaciones no pueden empezar hasta que termine.",
    [
      step(
        "faculties",
        "Registrar las facultades",
        "Elija el campus y cargue el logo de cada facultad; Coordinación lo necesita para abrir su periodo académico.",
        await setup.activeFacultyExists(),
      ),
      step(
        "careers",
        "Registrar las carreras",
        "Cada carrera hereda el campus de su facultad y registra su modalidad aprobada. Puede importarlas desde Excel.",
        careerCount > 0,
      ),
      step(
        "accounts",
        "Crear las cuentas de coordinación y de biblioteca",
        "Al menos una de cada una, también por importación desde Excel. Los docentes los crea cada Coordinación.",
        accountsReady,
      ),
      step(
        "coordinators",
        "Asignar un coordinador a cada carrera",
        careerCount === 0
          ? "Primero registre las carreras."
          : careersWithoutCoordinator > 0
            ? `Faltan ${careersWithoutCoordinator} de ${careerCount} carreras.`
            : "Todas las carreras tienen coordinador.",
        careerCount > 0 && careersWithoutCoordinator === 0,
      ),
      step("template", "Armar la plantilla del sílabo", hint, problem === null),
    ],
    step(
      "process",
      "Abrir el periodo académico",
      "Desde Periodos académicos, indique las fechas del periodo lectivo y de elaboración y entrega; cada Coordinación abrirá después el de su carrera.",
      await setup.processExists(),
    ),
    "open_process",
  )
}

export async function coordinatorReadiness(
  careerId: string,
  process: ProcessRecord | null,
  convocation: (careerId: string, processId: string) => Promise<ConvocationRecord | null>,
  setup: SetupRepository,
  templates: TemplateStore,
  today: string,
): Promise<CoordinatorReadiness> {
  const facts = await setup.careerReadiness(careerId)
  if (facts === null) failModelNotFound(MODELS.career, careerId)
  const template = await templates.template()
  const complete =
    template === null
      ? new Map(facts.scheduledSubjectIds.map((id) => [id, true]))
      : await profileComplete({ template, definition: template.definition, store: templates }, facts.scheduledSubjectIds)
  const subjectsWithoutProfile = [...complete.values()].filter((done) => !done).length
  const found = process === null ? null : await convocation(careerId, process.id)
  const templateReady = process !== null && template !== null && (await templateHasStructure(template, setup))
  const facultyLogoReady = await facultyIsConfigured(facts.faculty)
  const deadlineOpen = process !== null && today <= process.dueOn
  const scheduledTotal = facts.scheduledSubjectIds.length
  const canOpen =
    process?.state === "abierto" &&
    deadlineOpen &&
    found === null &&
    facts.subjectsCount > 0 &&
    scheduledTotal > 0 &&
    facts.scheduledWithParallels === scheduledTotal &&
    facts.parallelTotal > 0 &&
    facts.parallelsWithTeacher === facts.parallelTotal &&
    subjectsWithoutProfile === 0 &&
    templateReady &&
    facultyLogoReady
  return {
    process,
    convocation: found,
    curriculumReady: facts.subjectsCount > 0,
    scheduledTotal,
    scheduledWithParallels: facts.scheduledWithParallels,
    parallelTotal: facts.parallelTotal,
    parallelsWithTeacher: facts.parallelsWithTeacher,
    subjectsWithoutProfile,
    templateReady,
    facultyLogoReady,
    deadlineOpen,
    canOpen,
  }
}

function convocationHint(readiness: CoordinatorReadiness): string {
  const { process } = readiness
  if (process === null) return "Espera a que Administración abra el periodo académico."
  if (process.state === "pausado") return "El periodo académico está en pausa."
  if (!readiness.deadlineOpen) return "El plazo institucional venció. Administración debe prorrogarlo antes de abrir el periodo académico."
  if (!readiness.templateReady) return "Administración debe completar la plantilla institucional."
  if (!readiness.facultyLogoReady) return "Administración debe cargar el logo de la facultad."
  if (readiness.subjectsWithoutProfile > 0) return `Complete el proyecto de carrera de ${readiness.subjectsWithoutProfile} materia(s).`
  if (readiness.canOpen) return "Todo está listo. Puede abrir el periodo académico."
  return "Complete los pasos anteriores para poder abrirlo."
}

export async function coordinatorSetup(careerId: string | null, readiness: CoordinatorReadiness | null, setup: SetupRepository): Promise<SetupChecklist> {
  if (careerId === null || readiness === null) return build("Antes de empezar", "", [])
  const period = readiness.process?.period ?? null
  const { scheduledTotal, scheduledWithParallels, parallelTotal, parallelsWithTeacher, subjectsWithoutProfile } = readiness
  return build(
    "Antes de empezar",
    "En este orden. Al abrir el periodo académico se crea un sílabo por paralelo con su docente.",
    [
      step(
        "curriculum",
        "Armar la malla con sus materias",
        "Ciclos, materias, horas, créditos y prerrequisitos. Se edita desde la vista de la malla.",
        readiness.curriculumReady,
      ),
      step(
        "scheduled_subjects",
        "Programar las materias del período",
        period === null ? "Espera a que Administración abra el periodo académico para saber cuál es." : `Registre las materias que se impartirán en ${period}.`,
        scheduledTotal > 0,
      ),
      step(
        "teachers",
        "Registrar a los docentes",
        "Cree sus cuentas. Cada docente debe activar la suya antes de poder asignarlo a un paralelo.",
        await setup.careerHasActiveTeacher(careerId),
      ),
      step(
        "parallels",
        "Crear los paralelos con su docente",
        scheduledTotal === 0
          ? "Primero programe las materias del período."
          : scheduledWithParallels < scheduledTotal
            ? `${scheduledWithParallels} de ${scheduledTotal} materias programadas tienen paralelos.`
            : `${parallelsWithTeacher} de ${parallelTotal} paralelos tienen un docente vigente.`,
        scheduledTotal > 0 && scheduledWithParallels === scheduledTotal && parallelTotal > 0 && parallelsWithTeacher === parallelTotal,
      ),
      step(
        "career_project",
        "Completar el proyecto de carrera",
        scheduledTotal === 0
          ? "Primero programe las materias del período."
          : subjectsWithoutProfile > 0
            ? `Falta en ${subjectsWithoutProfile} de ${scheduledTotal} materias.`
            : `Completo en las ${scheduledTotal} materias.`,
        scheduledTotal > 0 && subjectsWithoutProfile === 0,
      ),
    ],
    step("convocation", "Abrir el periodo académico de la carrera", convocationHint(readiness), readiness.convocation !== null, readiness.canOpen ? "open_convocation" : null),
  )
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function dayOfMonth(day: string): string {
  const [, month, date] = day.split("-")
  return `${Number(date)} de ${MONTHS[Number(month) - 1]}`
}

export async function administratorMetrics(process: ProcessRecord | null, setup: SetupRepository, today: string) {
  const none = process === null ? "Sin proceso en curso" : null
  const counts = process === null ? { total: 0, approved: 0, notStarted: 0 } : await setup.processSyllabusCounts(process.id)
  const dueOn = process?.dueOn ?? null
  const days = dueOn === null ? 0 : Math.max(0, daysBetween(today, dueOn))
  const daysHint =
    none !== null ? none : dueOn === null ? "Sin fecha de entrega" : dueOn < today ? `El plazo venció el ${dayOfMonth(dueOn)}` : `Entrega hasta el ${dayOfMonth(dueOn)}`
  return [
    {
      key: "progress",
      label: "Avance del proceso",
      value: counts.total === 0 ? 0 : Math.round((counts.approved * 100) / counts.total),
      suffix: "%",
      hint: none ?? `${counts.approved} de ${counts.total} sílabos aprobados`,
    },
    { key: "days_left", label: "Días para la entrega", value: days, suffix: "días", hint: daysHint },
    {
      key: "careers_without_convocation",
      label: "Carreras sin abrir",
      value: process === null ? 0 : await setup.careersWithoutConvocation(process.id),
      suffix: null,
      hint: process === null ? "Sin proceso en curso" : "Coordinaciones que aún no abren su periodo académico",
    },
    { key: "not_started", label: "Sílabos sin iniciar", value: counts.notStarted, suffix: null, hint: "Docentes que todavía no empiezan" },
  ]
}
