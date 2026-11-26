// @vitest-environment node
import "reflect-metadata"
import { Test } from "@nestjs/testing"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "../../server/http/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../../server/auth/testing"
import type { BridgeDeps } from "../../server/auth/types"
import { withCookieQueue, withSetCookies } from "../../server/auth/cookieQueue"
import { parts } from "../../server/excel/testing"
import { reportedServerError } from "../../server/http/failures"
import { unmatchedRoute } from "../../server/http/router"
import { createRateLimiter, type RateLimiter } from "../../server/http/throttle"
import { createCareerRecord, createParallels, replaceParallelTeacher, updateCareerRecord, updateParallel } from "../../server/academic/careerWrites"
import { createSubjectRequirement, deleteCurriculumSubject, deleteSubjectRequirement, updateCurriculumConfiguration, updateSubjectLayout } from "../../server/academic/curriculumWrites"
import { deleteCareerRecord, deleteGovernanceRecord, deleteParallel, type DeletionTx } from "../../server/academic/deletions"
import { academicGovernance } from "../../server/academic/governance"
import { createGovernanceRecord, postGovernanceRecord, setGovernanceStatus, updateGovernanceRecord } from "../../server/academic/governanceWrites"
import { scheduledSubjects } from "../../server/academic/scheduledSubjects"
import { createMalla, listMallas, updateMalla } from "../../server/academic/mallas"
import { curriculumBuilder, teacherAssignments } from "../../server/academic/structure"
import { careerImportTemplate, curriculumImportTemplate, importCareers, importCurriculum } from "../../server/academic/structureImports"
import { coordinationSupportDocuments } from "../../server/academic/supportDocuments"
import { destroySupportDocument, storeSupportDocument, viewSupportDocument } from "../../server/academic/supportDocumentWrites"
import { showSubjectProfile } from "../../server/configuration/subjectProfile"
import { previewSubjectProfile } from "../../server/configuration/subjectProfilePreview"
import { updateSubjectProfile } from "../../server/configuration/subjectProfileWrites"
import { applyFichaImport, fichaTemplate, previewFichaImport } from "../../server/ficha/fichaImports"
import { destroyCareerTeacher, resendCareerTeacherActivation, storeCareerTeacher } from "../../server/identity/careerTeachers"
import { importTeachers, teacherImportTemplate } from "../../server/identity/imports"
import { catalogLibraries } from "../../server/library/catalogHandlers"
import { configureApi } from "../../bootstrap"
import { WebResponseExpressAdapter } from "../../common/http/web-response.adapter"
import { PrismaService } from "../../prisma/prisma.service"
import { AuthModule } from "../auth/auth.module"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { FichaDeps } from "../ficha/ficha-deps"
import { FichaModule } from "../ficha/ficha.module"
import { FallbackModule } from "../fallback/fallback.module"
import { matchOracleRoute, type OracleParams, type OracleRoute } from "../../common/testing/oracle-router"
import { AcademicDeps } from "./academic-deps"
import { AcademicModule } from "./academic.module"

const SESSION_ID = golden.sessionId
const COOKIE = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const ADMIN = "a0000000-0000-4000-8000-000000000001"
const COORDINATOR = "a0000000-0000-4000-8000-000000000002"
const TEACHER = golden.roleId
const CAREER = "c0000000-0000-4000-8000-000000000001"
const FACULTY = "f0000000-0000-4000-8000-000000000001"
const SUBJECT = "50000000-0000-4000-8000-000000000001"
const MALLA = "a0000000-0000-4000-8000-000000000001"
const PARALLEL = "90000000-0000-4000-8000-000000000001"
const MISSING = "90000000-0000-4000-8000-0000000000ff"
const HEADERS = ["content-type", "content-disposition", "cache-control", "allow", "x-ratelimit-limit", "x-ratelimit-remaining", "retry-after", "x-ratelimit-reset", "set-cookie"]

type Call = { method: string; path: string; body?: unknown; form?: string; cookie?: boolean; headers?: Record<string, string> }
type Answer = { status: number; body: string; headers: Record<string, string | null>; writes: string[]; sessions: string[] }
type State = { world: FakeWorld; bridge: BridgeDeps; limiter: RateLimiter; writes: string[] }

let activeRole = COORDINATOR
let state: State

function freshState(): State {
  const world: FakeWorld = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: activeRole })), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [
      makeAssignment({ id: ADMIN, role: "administrador", careerId: null, careerLabel: null }),
      makeAssignment({ id: COORDINATOR, role: "coordinador", careerId: CAREER, careerLabel: "Software" }),
      makeAssignment({ id: TEACHER, role: "docente", careerId: CAREER, careerLabel: "Software" }),
    ],
  }
  return { world, bridge: fakeDeps(world), limiter: createRateLimiter(), writes: [] }
}

const bridge: BridgeDeps = {
  store: { findUser: (id) => state.bridge.store.findUser(id), effectiveRoleAssignments: (id) => state.bridge.store.effectiveRoleAssignments(id) },
  sessions: {
    fromWebApp: (web) => state.bridge.sessions.fromWebApp(web),
    resolve: (web) => state.bridge.sessions.resolve(web),
    find: (token) => state.bridge.sessions.find(token),
    setActiveRole: (session, id) => state.bridge.sessions.setActiveRole(session, id),
    revokeUser: (id) => state.bridge.sessions.revokeUser(id),
  },
  config: fakeDeps({ sessions: new Map(), users: [], assignments: [] }).config,
  now: () => NOW,
}

const limiter: RateLimiter = {
  attempt: (key, max, decay, now) => state.limiter.attempt(key, max, decay, now),
  attempts: (key, now) => state.limiter.attempts(key, now),
}

const log = (entry: string) => state.writes.push(entry)
const careerActive = async (careerId: string) => careerId === CAREER
const rejectTransaction = async () => {
  throw new Error("transaction not expected")
}

const deletionTx: DeletionTx = {
  lockPeriod: async () => null,
  periodHasProcess: async () => false,
  deletePeriod: async (id) => void log(`deletePeriod:${id}`),
  lockTeacherAssignment: async () => null,
  deleteTeacherAssignment: async (id) => void log(`deleteTeacherAssignment:${id}`),
  lockParallel: async (id) => (id === PARALLEL ? { id, code: "A" } : null),
  deleteParallelAssignments: async () => undefined,
  parallelHasTouchedSyllabus: async () => false,
  deleteParallelSyllabi: async (id) => void log(`deleteParallelSyllabi:${id}`),
  deleteParallel: async (id) => void log(`deleteParallel:${id}`),
}

const templates = { template: async () => null, subjectValues: async () => [], valuesForSubjects: async () => [], liveFields: async () => [] }

const structureRepository = {
  activeCareer: async (id: string) => (id === CAREER ? { id, name: "Software", modality: "presencial", cycleCount: 8 } : null),
  careerLock: async () => null,
  curriculumSubjects: async () => [
    { id: SUBJECT, code: "SW-101", name: "Programación", cycle: 1, position: 1, organizationUnit: "basica", modality: null, credits: "3.00", totalHours: 144, hoursAc: "48.00", hoursPae: "48.00", hoursAa: "48.00", active: true, generatesSyllabus: true },
  ],
  requirements: async () => [],
  teacherAssignments: async () => [{ id: "as-1", userId: golden.userId, userName: "Ana", userEmail: "ana@ueb.edu.ec", parallelId: PARALLEL, parallelCode: "A", subjectName: "Programación", active: true }],
  careerTeachers: async () => [{ id: golden.userId, name: "Ana", email: "ana@ueb.edu.ec", verified: true, hasActiveInvitation: false }],
  pendingTeachers: async () => [],
  unassignedParallels: async () => [],
  teacherUsers: async () => [{ id: golden.userId, name: "Ana", email: "ana@ueb.edu.ec" }],
}

const mallaRecord = { id: MALLA, careerId: CAREER, code: "SW", cycleCount: 8, state: "vigente", subjectCount: 1 }
const mallaRepository = {
  mallas: async (careerId: string) => (careerId === CAREER ? [mallaRecord] : []),
  malla: async (careerId: string, id: string) => (careerId === CAREER && id === MALLA ? mallaRecord : null),
}

const fakes = {
  governance: () => ({
    bridge,
    today: () => "2026-11-25",
    governance: {
      processes: async () => [],
      faculties: async () => [{ id: FACULTY, name: "Ciencias", libraries: ["biblioteca"], active: true, logo: null }],
      careers: async () => [{ id: CAREER, facultyId: FACULTY, coordinator: null, modality: "presencial", code: "SW", name: "Software", active: true }],
      periods: async () => [{ id: "p-1", code: "2026-1", startsOn: "2026-04-01", endsOn: "2026-08-31", teachingWeeks: 16 }],
      facultiesWithActiveCareers: async () => [FACULTY],
      careersInRunningConvocation: async () => [],
      careerRoleCounts: async () => [{ careerId: CAREER, role: "docente", total: 2 }],
    },
  }),
  deletions: () => ({ bridge, store: { careerActive, transaction: <T>(work: (tx: DeletionTx) => Promise<T>) => work(deletionTx) } }),
  governanceWrites: () => ({
    bridge,
    now: () => NOW,
    activeFacultyExists: async () => true,
    facultyExists: async () => true,
    careerCodeTaken: async () => false,
    transaction: rejectTransaction,
    deletions: fakes.deletions(),
  }),
  structureImports: () => ({
    bridge,
    limiter,
    now: () => NOW,
    governance: rejectTransaction,
    curriculum: rejectTransaction,
    store: {
      activeFaculties: async () => [{ id: FACULTY, name: "Ciencias" }],
      facultiesForImport: async () => [{ id: FACULTY, name: "Ciencias" }],
      careerCodes: async () => ["SW"],
      careerActive,
      malla: async (careerId: string, id: string) => (careerId === CAREER && id === MALLA ? { id, cycleCount: 8 } : null),
      mallaSubjects: async () => [],
    },
  }),
  structure: () => ({ bridge, academic: structureRepository, mallas: mallaRepository }),
  mallas: () => ({ bridge, careerActive, mallas: mallaRepository, mallaCodeTaken: async () => false, transaction: rejectTransaction }),
  scheduled: () => ({
    bridge,
    academic: structureRepository,
    templates,
    scheduled: {
      careerParallels: async () => [{ id: PARALLEL, subjectId: SUBJECT, code: "A", shift: "matutina" }],
      parallelsWithSyllabus: async () => [],
      parallelsWithTeacher: async () => [PARALLEL],
      parallelsWithSentSyllabus: async () => [],
      parallelsWithStartedSyllabus: async () => [],
      careerSubjects: async () => [{ id: SUBJECT, code: "SW-101", name: "Programación", cycle: 1, active: true, generatesSyllabus: true, modality: "presencial" }],
    },
  }),
  careerWrites: () => ({
    bridge,
    careerActive,
    mallaInCareer: async () => false,
    subjectMalla: async () => null,
    activeSubjectInCareer: async () => false,
    subjectCodeTaken: async () => false,
    eligibleUserExists: async () => false,
    parallelInCareer: async () => false,
    transaction: rejectTransaction,
  }),
  curriculum: () => ({ bridge, careerActive, transaction: rejectTransaction }),
  supportDocuments: () => ({
    bridge,
    documents: { careerActive, forCareer: async () => [{ id: "d-1", title: "Reglamento", size: 2048, view: "lista", uploadedAt: "2026-11-20T10:00:00+00:00" }] },
  }),
  supportDocumentWrites: () => ({
    bridge,
    limiter,
    store: { careerActive, documentCareer: async () => null, readable: async () => null, transaction: rejectTransaction },
    storage: { put: rejectTransaction, delete: rejectTransaction },
    now: () => NOW,
    newDocumentId: () => "d-2",
    newObjectId: () => "o-2",
    dispatchView: rejectTransaction,
    maxPostSize: 8 * 1024 * 1024,
  }),
  careerTeachers: () => ({ bridge, limiter }),
  teacherImports: () => ({ bridge, limiter, now: () => NOW }),
  catalog: () => ({ bridge, limiter }),
}

const fichaFakes = {
  imports: () => ({ bridge, limiter, now: () => NOW, transaction: rejectTransaction, store: { careerActive, careerLocked: async () => false, activeCareer: async () => null, subjects: async () => [], currentValues: async () => [], store: templates } }),
  profile: () => ({ bridge, store: templates, subjectCareer: async () => null, careerActive }),
  profileWrites: () => ({ bridge, store: templates, subjectCareer: async () => null, careerActive, transaction: rejectTransaction }),
  preview: () => ({ bridge, store: templates, subjectCareer: async () => null, careerActive }),
}

type Oracle = (web: Request, params: OracleParams) => Promise<Response>
const p = (params: OracleParams, name: string) => String(params[name])
const academic = fakes as unknown as AcademicDeps
const ficha = fichaFakes as unknown as FichaDeps

const ORACLE: Record<string, Oracle> = {
  "api/v1/admin/academic:GET": (web) => academicGovernance(web, null, academic.governance()),
  "api/v1/admin/academic/[entity]:GET": (web, params) => academicGovernance(web, p(params, "entity"), academic.governance()),
  "api/v1/admin/academic/[entity]:POST": (web, params) => createGovernanceRecord(web, p(params, "entity"), academic.governanceWrites()),
  "api/v1/admin/academic/[entity]/[record]:POST": (web, params) => postGovernanceRecord(web, p(params, "entity"), p(params, "record"), academic.governanceWrites()),
  "api/v1/admin/academic/[entity]/[record]:PATCH": (web, params) => updateGovernanceRecord(web, p(params, "entity"), p(params, "record"), academic.governanceWrites()),
  "api/v1/admin/academic/[entity]/[record]:DELETE": (web, params) => deleteGovernanceRecord(web, p(params, "entity"), p(params, "record"), academic.deletions()),
  "api/v1/admin/academic/[entity]/[record]/status:PATCH": (web, params) => setGovernanceStatus(web, p(params, "entity"), p(params, "record"), academic.governanceWrites()),
  "api/v1/admin/academic/careers/import:POST": (web) => importCareers(web, academic.structureImports()),
  "api/v1/admin/academic/careers/import:PATCH": (web) => updateGovernanceRecord(web, "careers", "import", academic.governanceWrites()),
  "api/v1/admin/academic/careers/import:DELETE": (web) => deleteGovernanceRecord(web, "careers", "import", academic.deletions()),
  "api/v1/admin/academic/careers/import-template:GET": (web) => careerImportTemplate(web, academic.structureImports()),
  "api/v1/admin/academic/careers/import-template:PATCH": (web) => updateGovernanceRecord(web, "careers", "import-template", academic.governanceWrites()),
  "api/v1/admin/academic/careers/import-template:DELETE": (web) => deleteGovernanceRecord(web, "careers", "import-template", academic.deletions()),
  "api/v1/admin/library-catalog/libraries:GET": (web) => catalogLibraries(web, academic.catalog()),
  "api/v1/coordination/academic/mallas:GET": (web) => listMallas(web, academic.mallas()),
  "api/v1/coordination/academic/mallas:POST": (web) => createMalla(web, academic.mallas()),
  "api/v1/coordination/academic/mallas/[malla]:PATCH": (web, params) => updateMalla(web, p(params, "malla"), academic.mallas()),
  "api/v1/admin/careers/[career]/academic/mallas:GET": (web, params) => listMallas(web, academic.mallas(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/mallas:POST": (web, params) => createMalla(web, academic.mallas(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/mallas/[malla]:PATCH": (web, params) => updateMalla(web, p(params, "malla"), academic.mallas(), p(params, "career")),
  "api/v1/coordination/academic/curriculum/[curriculum]:GET": (web, params) => curriculumBuilder(web, p(params, "curriculum"), academic.structure()),
  "api/v1/coordination/academic/curriculum/[curriculum]/configuration:PATCH": (web, params) => updateCurriculumConfiguration(web, p(params, "curriculum"), academic.curriculum()),
  "api/v1/coordination/academic/curriculum/[curriculum]/requirements:POST": (web, params) => createSubjectRequirement(web, p(params, "curriculum"), academic.curriculum()),
  "api/v1/coordination/academic/curriculum/[curriculum]/requirements/[requirement]:DELETE": (web, params) =>
    deleteSubjectRequirement(web, p(params, "curriculum"), p(params, "requirement"), academic.curriculum()),
  "api/v1/coordination/academic/curriculum/[curriculum]/subject-layout:PATCH": (web, params) => updateSubjectLayout(web, p(params, "curriculum"), academic.curriculum()),
  "api/v1/coordination/academic/curriculum/[curriculum]/subjects/[subject]:DELETE": (web, params) =>
    deleteCurriculumSubject(web, p(params, "curriculum"), p(params, "subject"), academic.curriculum()),
  "api/v1/coordination/academic/curriculum-import:POST": (web) => importCurriculum(web, academic.structureImports()),
  "api/v1/coordination/academic/curriculum-import/template:GET": (web) => curriculumImportTemplate(web, academic.structureImports()),
  "api/v1/coordination/academic/[entity]:POST": (web, params) => createCareerRecord(web, p(params, "entity"), academic.careerWrites()),
  "api/v1/coordination/academic/[entity]/[record]:PATCH": (web, params) => updateCareerRecord(web, p(params, "entity"), p(params, "record"), academic.careerWrites()),
  "api/v1/coordination/academic/[entity]/[record]:DELETE": (web, params) => deleteCareerRecord(web, p(params, "entity"), p(params, "record"), academic.deletions()),
  "api/v1/coordination/academic/parallels:POST": (web) => createParallels(web, academic.careerWrites()),
  "api/v1/coordination/academic/parallels/[parallel]:PATCH": (web, params) => updateParallel(web, p(params, "parallel"), academic.careerWrites()),
  "api/v1/coordination/academic/parallels/[parallel]:DELETE": (web, params) => deleteParallel(web, p(params, "parallel"), academic.deletions()),
  "api/v1/coordination/academic/parallels/[parallel]/teacher:PUT": (web, params) => replaceParallelTeacher(web, p(params, "parallel"), academic.careerWrites()),
  "api/v1/coordination/academic/scheduled-subjects:GET": (web) => scheduledSubjects(web, academic.scheduled()),
  "api/v1/coordination/academic/teacher-assignments:GET": (web) => teacherAssignments(web, academic.structure()),
  "api/v1/coordination/academic/teachers:POST": (web) => storeCareerTeacher(web, academic.careerTeachers()),
  "api/v1/coordination/academic/teachers/import:POST": (web) => importTeachers(web, academic.teacherImports()),
  "api/v1/coordination/academic/teachers/import:DELETE": (web) => destroyCareerTeacher(web, "import", academic.careerTeachers()),
  "api/v1/coordination/academic/teachers/import-template:GET": (web) => teacherImportTemplate(web, academic.teacherImports()),
  "api/v1/coordination/academic/teachers/import-template:DELETE": (web) => destroyCareerTeacher(web, "import-template", academic.careerTeachers()),
  "api/v1/coordination/academic/teachers/[user]:DELETE": (web, params) => destroyCareerTeacher(web, p(params, "user"), academic.careerTeachers()),
  "api/v1/coordination/academic/teachers/[user]/resend-activation:POST": (web, params) => resendCareerTeacherActivation(web, p(params, "user"), academic.careerTeachers()),
  "api/v1/coordination/ficha-imports/template:GET": (web) => fichaTemplate(web, ficha.imports()),
  "api/v1/coordination/ficha-imports/spreadsheet:POST": (web) => previewFichaImport(web, ficha.imports()),
  "api/v1/coordination/ficha-imports/apply:POST": (web) => applyFichaImport(web, ficha.imports()),
  "api/v1/coordination/support-documents:GET": (web) => coordinationSupportDocuments(web, academic.supportDocuments()),
  "api/v1/coordination/support-documents:POST": (web) => storeSupportDocument(web, academic.supportDocumentWrites()),
  "api/v1/coordination/support-documents/[document]:DELETE": (web, params) => destroySupportDocument(web, p(params, "document"), academic.supportDocumentWrites()),
  "api/v1/support-documents/[document]/view:GET": (web, params) => viewSupportDocument(web, p(params, "document"), academic.supportDocumentWrites()),
  "api/v1/admin/careers/[career]/academic/curriculum/[curriculum]:GET": (web, params) => curriculumBuilder(web, p(params, "curriculum"), academic.structure(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/curriculum/[curriculum]/configuration:PATCH": (web, params) =>
    updateCurriculumConfiguration(web, p(params, "curriculum"), academic.curriculum(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/curriculum/[curriculum]/requirements:POST": (web, params) =>
    createSubjectRequirement(web, p(params, "curriculum"), academic.curriculum(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/curriculum/[curriculum]/requirements/[requirement]:DELETE": (web, params) =>
    deleteSubjectRequirement(web, p(params, "curriculum"), p(params, "requirement"), academic.curriculum(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/curriculum/[curriculum]/subject-layout:PATCH": (web, params) =>
    updateSubjectLayout(web, p(params, "curriculum"), academic.curriculum(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/curriculum/[curriculum]/subjects/[subject]:DELETE": (web, params) =>
    deleteCurriculumSubject(web, p(params, "curriculum"), p(params, "subject"), academic.curriculum(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/curriculum-import:POST": (web, params) => importCurriculum(web, academic.structureImports(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/curriculum-import/template:GET": (web, params) => curriculumImportTemplate(web, academic.structureImports(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/[entity]:POST": (web, params) => createCareerRecord(web, p(params, "entity"), academic.careerWrites(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/[entity]/[record]:PATCH": (web, params) =>
    updateCareerRecord(web, p(params, "entity"), p(params, "record"), academic.careerWrites(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/[entity]/[record]:DELETE": (web, params) =>
    deleteCareerRecord(web, p(params, "entity"), p(params, "record"), academic.deletions(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/parallels:POST": (web, params) => createParallels(web, academic.careerWrites(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/parallels/[parallel]:PATCH": (web, params) => updateParallel(web, p(params, "parallel"), academic.careerWrites(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/parallels/[parallel]:DELETE": (web, params) => deleteParallel(web, p(params, "parallel"), academic.deletions(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/parallels/[parallel]/teacher:PUT": (web, params) =>
    replaceParallelTeacher(web, p(params, "parallel"), academic.careerWrites(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/scheduled-subjects:GET": (web, params) => scheduledSubjects(web, academic.scheduled(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/teacher-assignments:GET": (web, params) => teacherAssignments(web, academic.structure(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/teachers:POST": (web, params) => storeCareerTeacher(web, academic.careerTeachers(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/teachers/import:POST": (web, params) => importTeachers(web, academic.teacherImports(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/teachers/import:DELETE": (web, params) => destroyCareerTeacher(web, "import", academic.careerTeachers(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/teachers/import-template:GET": (web, params) => teacherImportTemplate(web, academic.teacherImports(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/teachers/import-template:DELETE": (web, params) =>
    destroyCareerTeacher(web, "import-template", academic.careerTeachers(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/teachers/[user]:DELETE": (web, params) => destroyCareerTeacher(web, p(params, "user"), academic.careerTeachers(), p(params, "career")),
  "api/v1/admin/careers/[career]/academic/teachers/[user]/resend-activation:POST": (web, params) =>
    resendCareerTeacherActivation(web, p(params, "user"), academic.careerTeachers(), p(params, "career")),
  "api/v1/admin/careers/[career]/ficha-imports/template:GET": (web, params) => fichaTemplate(web, ficha.imports(), p(params, "career")),
  "api/v1/admin/careers/[career]/ficha-imports/spreadsheet:POST": (web, params) => previewFichaImport(web, ficha.imports(), p(params, "career")),
  "api/v1/admin/careers/[career]/ficha-imports/apply:POST": (web, params) => applyFichaImport(web, ficha.imports(), p(params, "career")),
  "api/v1/academic/asignaturas/[asignatura]/ficha:GET": (web, params) => showSubjectProfile(web, p(params, "asignatura"), ficha.profile()),
  "api/v1/academic/asignaturas/[asignatura]/ficha:PUT": (web, params) => updateSubjectProfile(web, p(params, "asignatura"), ficha.profileWrites()),
  "api/v1/academic/asignaturas/[asignatura]/ficha/vista-previa:GET": (web, params) => previewSubjectProfile(web, p(params, "asignatura"), ficha.preview()),
}

const ORACLE_ROUTES: OracleRoute[] = [...new Set(Object.keys(ORACLE).map((key) => key.split(":")[0]))].map((path) => ({
  path,
  handlers: Object.fromEntries(Object.keys(ORACLE).filter((key) => key.startsWith(`${path}:`)).map((key) => [key.split(":")[1], ORACLE[key]])),
}))

const PORTED: [string, string][] = Object.keys(ORACLE).map((key) => {
  const [route, method] = key.split(":")
  const path = `/${route}`.replace(/\[entity\]/, "periodo").replace(/\[[a-z]+\]/g, MISSING)
  return [method, path]
})

function headersOf(call: Call): Record<string, string> {
  return {
    accept: "application/json",
    referer: "http://localhost:3000/coordinacion",
    ...(call.cookie === false ? {} : { cookie: COOKIE }),
    ...(call.body === undefined ? {} : { "content-type": "application/json" }),
    ...(call.form === undefined ? {} : { "content-type": "application/x-www-form-urlencoded" }),
    ...call.headers,
  }
}

const payloadOf = (call: Call) => (call.form !== undefined ? call.form : call.body === undefined ? undefined : JSON.stringify(call.body))

async function legacy(call: Call): Promise<Omit<Answer, "writes" | "sessions">> {
  const url = new URL(call.path, "http://localhost:3000")
  const web = new Request(url, { method: call.method, headers: headersOf(call), body: payloadOf(call) })
  const match = matchOracleRoute(ORACLE_ROUTES, url.pathname)
  const handler = match ? (match.route.handlers[call.method] ?? (call.method === "HEAD" ? match.route.handlers.GET : undefined)) : undefined
  let response: Response
  if (!match || handler === undefined) response = unmatchedRoute(web)
  else {
    const oracle = ORACLE[`${match.route.path}:${call.method === "HEAD" ? "GET" : call.method}`]
    if (oracle === undefined) throw new Error(`No oracle for ${match.route.path} ${call.method}`)
    try {
      const { result, cookies } = await withCookieQueue(() => oracle(web, match.params))
      response = cookies.length === 0 ? result : withSetCookies(new Response(result.body, result), cookies)
    } catch (error) {
      response = reportedServerError(error)
    }
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  return { status: response.status, body: bytes.toString("base64"), headers: Object.fromEntries(HEADERS.map((name) => [name, response.headers.get(name)])) }
}

let app: NestExpressApplication

async function nest(call: Call): Promise<Omit<Answer, "writes" | "sessions">> {
  const server = request(app.getHttpServer())
  let pending = server[call.method.toLowerCase() as "get"](call.path)
  for (const [name, value] of Object.entries({ ...headersOf(call), "x-forwarded-host": "localhost:3000" })) pending = pending.set(name, value)
  const payload = payloadOf(call)
  const response = await (payload === undefined ? pending : pending.send(payload)).buffer(true).parse((res, done) => {
    const chunks: Buffer[] = []
    res.on("data", (chunk: Buffer) => chunks.push(chunk))
    res.on("end", () => done(null, Buffer.concat(chunks)))
  })
  const header = (name: string) => {
    const value = response.headers[name] as string | string[] | undefined
    return value === undefined ? null : Array.isArray(value) ? value.join(", ") : value
  }
  const body = Buffer.isBuffer(response.body) ? response.body : Buffer.alloc(0)
  return { status: response.status, body: body.toString("base64"), headers: Object.fromEntries(HEADERS.map((name) => [name, header(name)])) }
}

async function run(send: (call: Call) => Promise<Omit<Answer, "writes" | "sessions">>, calls: Call[]): Promise<Answer[]> {
  state = freshState()
  const answers: Answer[] = []
  for (const call of calls) {
    const answer = await send(call)
    answers.push({ ...answer, writes: [...state.writes], sessions: [...state.world.sessions.values()].map((record) => record.payload) })
  }
  return answers
}

async function expectSame(...calls: Call[]): Promise<Answer[]> {
  const before = await run(legacy, calls)
  const after = await run(nest, calls)
  expect(after).toEqual(before)
  return after
}

const decoded = (answer: Answer) => Buffer.from(answer.body, "base64").toString("utf8")

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule, AcademicModule, FichaModule, FallbackModule] })
    .overrideProvider(AUTH_BRIDGE)
    .useValue(bridge)
    .overrideProvider(RATE_LIMITER)
    .useValue(limiter)
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(AcademicDeps)
    .useValue(fakes)
    .overrideProvider(FichaDeps)
    .useValue(fichaFakes)
    .compile()
  app = moduleRef.createNestApplication<NestExpressApplication>(new WebResponseExpressAdapter(), { bodyParser: false })
  configureApi(app)
  await app.init()
})

afterAll(async () => {
  await app?.close()
})

beforeEach(() => {
  activeRole = COORDINATOR
})

describe("academic structure served by Nest answers exactly like the route handlers it replaces", () => {
  it.each(PORTED)("answers a guest on %s %s the same way", async (method, path) => {
    const [answer] = await expectSame({ method, path, cookie: false })
    expect(answer.status).not.toBe(200)
  })

  it.each([
    ["GET", "/api/v1/admin/academic/careers/import"],
    ["PUT", "/api/v1/admin/academic/careers/import"],
    ["POST", "/api/v1/admin/academic/careers/import-template"],
    ["OPTIONS", "/api/v1/admin/academic"],
    ["PUT", `/api/v1/admin/academic/facultad/${MISSING}`],
    ["PATCH", "/api/v1/coordination/academic/teachers/import"],
    ["POST", "/api/v1/coordination/academic/teachers/import-template"],
    ["PATCH", `/api/v1/coordination/academic/teachers/${MISSING}`],
    ["GET", "/api/v1/coordination/academic/teachers"],
    ["POST", "/api/v1/coordination/academic/scheduled-subjects"],
    ["POST", "/api/v1/coordination/academic/teacher-assignments"],
    ["PATCH", `/api/v1/coordination/academic/curriculum/${CAREER}`],
    ["DELETE", `/api/v1/coordination/academic/curriculum/${CAREER}`],
    ["GET", "/api/v1/coordination/academic/parallels"],
    ["POST", `/api/v1/coordination/academic/parallels/${PARALLEL}`],
    ["GET", "/api/v1/coordination/academic/curriculum-import"],
    ["PATCH", "/api/v1/coordination/academic/curriculum-import/template"],
    ["GET", "/api/v1/coordination/academic/asignatura"],
    ["GET", "/api/v1/coordination/ficha-imports/apply"],
    ["PATCH", `/api/v1/support-documents/${MISSING}/view`],
    ["OPTIONS", "/api/v1/coordination/support-documents"],
  ])("answers %s %s with the router answer of the contract", async (method, path) => {
    await expectSame({ method, path, cookie: false })
    await expectSame({ method, path })
  })

  it("answers an unverified user and an account without role the same way", async () => {
    activeRole = "sin-rol"
    await expectSame({ method: "GET", path: "/api/v1/admin/academic" }, { method: "GET", path: "/api/v1/coordination/academic/teacher-assignments" })
  })

  it("shows the institutional structure to the administration and its sections the same way", async () => {
    activeRole = ADMIN
    const answers = await expectSame(
      { method: "GET", path: "/api/v1/admin/academic" },
      { method: "GET", path: "/api/v1/admin/academic/carreras" },
      { method: "GET", path: "/api/v1/admin/academic/periodos-academicos" },
      { method: "GET", path: "/api/v1/admin/academic/otra" },
      { method: "GET", path: "/api/v1/coordination/academic/teacher-assignments" },
    )
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 404, 403])
    expect(JSON.parse(decoded(answers[1])).section).toBe("careers")
  })

  it("rejects governance writes, deletions and spoofed methods the same way", async () => {
    activeRole = ADMIN
    const answers = await expectSame(
      { method: "POST", path: "/api/v1/admin/academic/facultad", body: {} },
      { method: "POST", path: "/api/v1/admin/academic/universidad", body: {} },
      { method: "PATCH", path: `/api/v1/admin/academic/facultad/${FACULTY}/status`, body: { active: "quizas" } },
      { method: "DELETE", path: `/api/v1/admin/academic/facultad/${FACULTY}` },
      { method: "DELETE", path: `/api/v1/admin/academic/periodo/${MISSING}` },
      { method: "DELETE", path: "/api/v1/admin/academic/periodo/no-es-uuid" },
      { method: "POST", path: `/api/v1/admin/academic/periodo/${MISSING}`, form: "_method=DELETE" },
      { method: "POST", path: `/api/v1/admin/academic/periodo/${MISSING}`, form: "_method=PUT" },
      { method: "DELETE", path: "/api/v1/admin/academic/careers/import" },
    )
    expect(answers.map((answer) => answer.status)).toEqual([422, 403, 422, 403, 404, 500, 404, 405, 403])
  })

  it.each([
    [ADMIN, "/api/v1/admin/academic/careers/import-template", "plantilla-carreras.xlsx"],
    [COORDINATOR, "/api/v1/coordination/academic/curriculum-import/template", "plantilla-malla"],
  ])("downloads the template as %s from %s with the same workbook parts", async (role, path, filename) => {
    activeRole = role
    const [before] = await run(legacy, [{ method: "GET", path }])
    const [after] = await run(nest, [{ method: "GET", path }])
    expect({ ...after, body: "" }).toEqual({ ...before, body: "" })
    expect(after.status).toBe(200)
    expect(after.headers["content-disposition"]).toContain(filename)
    expect(await parts(Buffer.from(after.body, "base64"))).toEqual(await parts(Buffer.from(before.body, "base64")))
  })

  it("throttles the imports and the uploads with the same headers", async () => {
    activeRole = ADMIN
    const careers = await expectSame(...Array.from({ length: 11 }, () => ({ method: "POST", path: "/api/v1/admin/academic/careers/import", body: {} })))
    expect(careers.at(-1)?.status).toBe(429)
    activeRole = COORDINATOR
    const [curriculum, upload, preview] = await expectSame(
      { method: "POST", path: "/api/v1/coordination/academic/curriculum-import", body: {} },
      { method: "POST", path: "/api/v1/coordination/support-documents", body: {} },
      { method: "POST", path: "/api/v1/coordination/ficha-imports/spreadsheet", body: {} },
    )
    expect([curriculum.status, upload.status, preview.status]).toEqual([422, 422, 422])
    expect(upload.headers["x-ratelimit-remaining"]).toBe("19")
  })

  it("shows the coordination screens with the same data", async () => {
    const answers = await expectSame(
      { method: "GET", path: `/api/v1/coordination/academic/curriculum/${MALLA}` },
      { method: "GET", path: `/api/v1/coordination/academic/curriculum/${MISSING}` },
      { method: "GET", path: "/api/v1/coordination/academic/mallas" },
      { method: "GET", path: "/api/v1/coordination/academic/teacher-assignments" },
      { method: "GET", path: "/api/v1/coordination/academic/scheduled-subjects" },
      { method: "GET", path: "/api/v1/coordination/support-documents" },
      { method: "GET", path: "/api/v1/admin/academic" },
      { method: "GET", path: "/api/v1/admin/library-catalog/libraries", headers: { accept: "text/html" } },
    )
    expect(answers.map((answer) => answer.status)).toEqual([200, 404, 200, 200, 200, 200, 403, 403])
  })

  it("shows any career's screens to the administrator through the career routes and keeps coordinators out of them", async () => {
    const OTHER = "c0000000-0000-4000-8000-000000000002"
    activeRole = ADMIN
    const admin = await expectSame(
      { method: "GET", path: `/api/v1/admin/careers/${CAREER}/academic/curriculum/${MALLA}` },
      { method: "GET", path: `/api/v1/admin/careers/${CAREER}/academic/teacher-assignments` },
      { method: "GET", path: `/api/v1/admin/careers/${CAREER}/academic/scheduled-subjects` },
      { method: "GET", path: "/api/v1/coordination/academic/scheduled-subjects" },
    )
    expect(admin.map((answer) => answer.status)).toEqual([200, 200, 200, 403])
    activeRole = COORDINATOR
    const coordinator = await expectSame(
      { method: "GET", path: `/api/v1/admin/careers/${OTHER}/academic/scheduled-subjects` },
      { method: "DELETE", path: `/api/v1/admin/careers/${OTHER}/academic/parallels/${PARALLEL}` },
      { method: "GET", path: `/api/v1/admin/careers/${CAREER}/academic/scheduled-subjects` },
    )
    expect(coordinator.map((answer) => answer.status)).toEqual([403, 403, 403])
    expect(coordinator[1].writes).toEqual([])
  })

  it("deletes a parallel inside the same transaction and rejects missing records the same way", async () => {
    const answers = await expectSame(
      { method: "DELETE", path: `/api/v1/coordination/academic/parallels/${PARALLEL}` },
      { method: "DELETE", path: `/api/v1/coordination/academic/parallels/${MISSING}` },
      { method: "DELETE", path: `/api/v1/coordination/academic/asignacion_docente/${MISSING}` },
      { method: "DELETE", path: `/api/v1/coordination/academic/asignatura/${MISSING}` },
      { method: "DELETE", path: `/api/v1/coordination/support-documents/${MISSING}` },
      { method: "GET", path: `/api/v1/support-documents/${MISSING}/view` },
    )
    expect(answers.map((answer) => answer.status)).toEqual([200, 404, 404, 405, 404, 404])
    expect(answers[0].writes).toEqual([`deleteParallelSyllabi:${PARALLEL}`, `deleteParallel:${PARALLEL}`])
  })

  it("validates mallas before writing and answers 404 for a malla of another career the same way", async () => {
    const answers = await expectSame(
      { method: "POST", path: "/api/v1/coordination/academic/mallas", body: {} },
      { method: "PATCH", path: `/api/v1/coordination/academic/mallas/${MALLA}`, body: { state: "otro" } },
      { method: "PATCH", path: `/api/v1/coordination/academic/mallas/${MISSING}`, body: {} },
    )
    expect(answers.map((answer) => answer.status)).toEqual([422, 422, 404])
  })

  it("validates career records, parallels and teachers before writing the same way", async () => {
    await expectSame(
      { method: "POST", path: "/api/v1/coordination/academic/asignatura", body: {} },
      { method: "POST", path: "/api/v1/coordination/academic/asignacion_docente", body: { user_id: "x" } },
      { method: "POST", path: "/api/v1/coordination/academic/otra", body: {} },
      { method: "PATCH", path: `/api/v1/coordination/academic/asignatura/${SUBJECT}`, body: { code: "" } },
      { method: "POST", path: "/api/v1/coordination/academic/parallels", body: {} },
      { method: "PATCH", path: `/api/v1/coordination/academic/parallels/${PARALLEL}`, body: { code: "" } },
      { method: "PUT", path: `/api/v1/coordination/academic/parallels/${PARALLEL}/teacher`, body: {} },
    )
  })

  it("answers the subject profile of a missing subject and the ficha template without career the same way", async () => {
    activeRole = ADMIN
    await expectSame(
      { method: "GET", path: `/api/v1/academic/asignaturas/${MISSING}/ficha` },
      { method: "PUT", path: `/api/v1/academic/asignaturas/${MISSING}/ficha`, body: {} },
      { method: "GET", path: `/api/v1/academic/asignaturas/${MISSING}/ficha/vista-previa` },
      { method: "GET", path: "/api/v1/coordination/ficha-imports/template" },
    )
  })

  it("documents every ported route in OpenAPI", () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build(), { include: [AcademicModule, FichaModule] })
    const documented = Object.entries(document.paths).flatMap(([path, item]) => Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`))
    for (const key of Object.keys(ORACLE)) {
      const [route, method] = key.split(":")
      expect(documented).toContain(`${method} /${route.replace(/\[([a-z]+)\]/g, "{$1}")}`)
    }
  })
})
