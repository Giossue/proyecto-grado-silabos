import { Controller, Delete, Get, Inject, Param, Patch, Post, Put, Req } from "@nestjs/common"
import { ApiBody, ApiConsumes, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnprocessableEntityResponse, getSchemaPath } from "@nestjs/swagger"
import { ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { ApiRequest } from "../../common/http/web-request"
import type { WebReply } from "../../common/http/web-reply"
import { createCareerRecord, createParallels, replaceParallelTeacher, updateCareerRecord, updateParallel } from "../../server/academic/careerWrites"
import { createSubjectRequirement, deleteCurriculumSubject, deleteSubjectRequirement, updateCurriculumConfiguration, updateSubjectLayout } from "../../server/academic/curriculumWrites"
import { deleteCareerRecord, deleteParallel } from "../../server/academic/deletions"
import { scheduledSubjects } from "../../server/academic/scheduledSubjects"
import { createMalla, listMallas, updateMalla } from "../../server/academic/mallas"
import { curriculumBuilder, teacherAssignments } from "../../server/academic/structure"
import { curriculumImportTemplate, importCurriculum } from "../../server/academic/structureImports"
import { destroyCareerTeacher, resendCareerTeacherActivation, storeCareerTeacher } from "../../server/identity/careerTeachers"
import { importTeachers, teacherImportTemplate } from "../../server/identity/imports"
import { handled, SessionInHandler, unmatched, UnmatchedMethods } from "./academic-handler"
import { AcademicDeps } from "./academic-deps"
import {
  CurriculumConfigurationDto,
  MallaDto,
  MallaUpdateDto,
  ParallelDto,
  ParallelsDto,
  ParallelTeacherDto,
  RequirementDto,
  SubjectDto,
  SubjectLayoutDto,
  TeacherAssignmentDto,
} from "./dto/academic.dto"

const VALIDATION = { description: "Errores por campo.", type: ValidationErrorDto }
const CONFIRM = "Si el cambio toca sílabos en curso, responde 422 con «confirm_purge» hasta que se confirme."
const SPREADSHEET = { schema: { type: "object", properties: { file: { type: "string", format: "binary" }, confirm: { type: "boolean" } } } }
const CURRICULUM_SPREADSHEET = {
  schema: { type: "object", properties: { file: { type: "string", format: "binary" }, confirm: { type: "boolean" }, malla_id: { type: "string", format: "uuid", description: "Malla de la carrera que recibe las materias." } } },
}
const CAREER_RECORD_BODY = { schema: { oneOf: [{ $ref: getSchemaPath(SubjectDto) }, { $ref: getSchemaPath(TeacherAssignmentDto) }] } }

@ApiTags("Estructura académica de una carrera (administración)")
@ApiParam({ name: "career", format: "uuid", description: "Carrera sobre la que trabaja el administrador." })
@ApiExtraModels(SubjectDto, TeacherAssignmentDto)
@SessionInHandler()
@Controller("admin/careers/:career/academic")
export class AdminCareerAcademicController {
  constructor(@Inject(AcademicDeps) private readonly deps: AcademicDeps) {}

  @Get("mallas")
  @ApiOperation({ summary: "Mallas de la carrera: las vigentes y las cerradas, con ciclos y número de materias." })
  mallas(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => listMallas(web, this.deps.mallas(), career))
  }

  @Post("mallas")
  @ApiOperation({ summary: "Crea una malla vigente o cerrada; una carrera puede tener varias mallas vigentes." })
  @ApiBody({ type: MallaDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  createMalla(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => createMalla(web, this.deps.mallas(), career))
  }

  @UnmatchedMethods("mallas")
  mallasOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Patch("mallas/:malla")
  @ApiOperation({
    summary: "Edita el código o el estado de la malla.",
    description: "Hacerla vigente no cambia las demás mallas. No se cierra si sus materias tienen sílabos en un periodo académico abierto.",
  })
  @ApiParam({ name: "malla", format: "uuid" })
  @ApiBody({ type: MallaUpdateDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  updateMalla(@Req() request: ApiRequest, @Param("career") career: string, @Param("malla") malla: string): Promise<WebReply> {
    return handled(request, (web) => updateMalla(web, malla, this.deps.mallas(), career))
  }

  @UnmatchedMethods("mallas/:malla")
  mallaOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Get("curriculum/:curriculum")
  @ApiOperation({ summary: "Malla de la carrera: asignaturas, requisitos y bloqueo por periodo académico." })
  @ApiParam({ name: "curriculum", format: "uuid" })
  curriculum(@Req() request: ApiRequest, @Param("career") career: string, @Param("curriculum") curriculum: string): Promise<WebReply> {
    return handled(request, (web) => curriculumBuilder(web, curriculum, this.deps.structure(), career))
  }

  @UnmatchedMethods("curriculum/:curriculum")
  curriculumOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Patch("curriculum/:curriculum/configuration")
  @ApiOperation({ summary: "Cambia la cantidad de ciclos de la malla.", description: CONFIRM })
  @ApiParam({ name: "curriculum", format: "uuid" })
  @ApiBody({ type: CurriculumConfigurationDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  configuration(@Req() request: ApiRequest, @Param("career") career: string, @Param("curriculum") curriculum: string): Promise<WebReply> {
    return handled(request, (web) => updateCurriculumConfiguration(web, curriculum, this.deps.curriculum(), career))
  }

  @Post("curriculum/:curriculum/requirements")
  @ApiOperation({ summary: "Agrega un prerrequisito de un ciclo anterior.", description: CONFIRM })
  @ApiParam({ name: "curriculum", format: "uuid" })
  @ApiBody({ type: RequirementDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  createRequirement(@Req() request: ApiRequest, @Param("career") career: string, @Param("curriculum") curriculum: string): Promise<WebReply> {
    return handled(request, (web) => createSubjectRequirement(web, curriculum, this.deps.curriculum(), career))
  }

  @Delete("curriculum/:curriculum/requirements/:requirement")
  @ApiOperation({ summary: "Quita una relación académica.", description: CONFIRM })
  @ApiParam({ name: "curriculum", format: "uuid" })
  @ApiParam({ name: "requirement", format: "uuid" })
  deleteRequirement(@Req() request: ApiRequest, @Param("career") career: string, @Param("curriculum") curriculum: string, @Param("requirement") requirement: string): Promise<WebReply> {
    return handled(request, (web) => deleteSubjectRequirement(web, curriculum, requirement, this.deps.curriculum(), career))
  }

  @Patch("curriculum/:curriculum/subject-layout")
  @ApiOperation({ summary: "Mueve asignaturas entre ciclos y posiciones.", description: CONFIRM })
  @ApiParam({ name: "curriculum", format: "uuid" })
  @ApiBody({ type: SubjectLayoutDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  subjectLayout(@Req() request: ApiRequest, @Param("career") career: string, @Param("curriculum") curriculum: string): Promise<WebReply> {
    return handled(request, (web) => updateSubjectLayout(web, curriculum, this.deps.curriculum(), career))
  }

  @Delete("curriculum/:curriculum/subjects/:subject")
  @ApiOperation({ summary: "Elimina una asignatura sin paralelos ni sílabos.", description: CONFIRM })
  @ApiParam({ name: "curriculum", format: "uuid" })
  @ApiParam({ name: "subject", format: "uuid" })
  deleteSubject(@Req() request: ApiRequest, @Param("career") career: string, @Param("curriculum") curriculum: string, @Param("subject") subject: string): Promise<WebReply> {
    return handled(request, (web) => deleteCurriculumSubject(web, curriculum, subject, this.deps.curriculum(), career))
  }

  @Post("curriculum-import")
  @ApiOperation({ summary: "Importa materias desde una hoja .xlsx a la malla «malla_id» (10 por minuto)." })
  @ApiConsumes("multipart/form-data")
  @ApiBody(CURRICULUM_SPREADSHEET)
  @ApiUnprocessableEntityResponse(VALIDATION)
  importCurriculum(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => importCurriculum(web, this.deps.structureImports(), career))
  }

  @UnmatchedMethods("curriculum-import")
  curriculumImportOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Get("curriculum-import/template")
  @ApiOperation({ summary: "Descarga la plantilla .xlsx de la malla." })
  @ApiOkResponse({ description: "Libro .xlsx." })
  curriculumTemplate(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => curriculumImportTemplate(web, this.deps.structureImports(), career))
  }

  @UnmatchedMethods("curriculum-import/template")
  curriculumTemplateOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Post("parallels")
  @ApiOperation({ summary: "Crea paralelos; si el periodo académico está abierto y tienen docente, genera sus sílabos y avisa al docente." })
  @ApiBody({ type: ParallelsDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  createParallels(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => createParallels(web, this.deps.careerWrites(), career))
  }

  @UnmatchedMethods("parallels")
  parallelsOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Put("parallels/:parallel/teacher")
  @ApiOperation({ summary: "Asigna o cambia el docente del paralelo; con periodo académico abierto genera el sílabo y avisa al docente." })
  @ApiParam({ name: "parallel", format: "uuid" })
  @ApiBody({ type: ParallelTeacherDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  parallelTeacher(@Req() request: ApiRequest, @Param("career") career: string, @Param("parallel") parallel: string): Promise<WebReply> {
    return handled(request, (web) => replaceParallelTeacher(web, parallel, this.deps.careerWrites(), career))
  }

  @Patch("parallels/:parallel")
  @ApiOperation({ summary: "Edita el código o la jornada del paralelo." })
  @ApiParam({ name: "parallel", format: "uuid" })
  @ApiBody({ type: ParallelDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  updateParallel(@Req() request: ApiRequest, @Param("career") career: string, @Param("parallel") parallel: string): Promise<WebReply> {
    return handled(request, (web) => updateParallel(web, parallel, this.deps.careerWrites(), career))
  }

  @Delete("parallels/:parallel")
  @ApiOperation({ summary: "Elimina un paralelo sin docente ni sílabo." })
  @ApiParam({ name: "parallel", format: "uuid" })
  deleteParallel(@Req() request: ApiRequest, @Param("career") career: string, @Param("parallel") parallel: string): Promise<WebReply> {
    return handled(request, (web) => deleteParallel(web, parallel, this.deps.deletions(), career))
  }

  @UnmatchedMethods("parallels/:parallel")
  parallelOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Get("scheduled-subjects")
  @ApiOperation({ summary: "Asignaturas programadas con paralelos, docentes y avance de la ficha." })
  scheduledSubjects(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => scheduledSubjects(web, this.deps.scheduled(), career))
  }

  @UnmatchedMethods("scheduled-subjects")
  scheduledSubjectsOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Get("teacher-assignments")
  @ApiOperation({ summary: "Asignaciones docentes, docentes de la carrera y paralelos sin docente." })
  teacherAssignments(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => teacherAssignments(web, this.deps.structure(), career))
  }

  @UnmatchedMethods("teacher-assignments")
  teacherAssignmentsOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Post("teachers")
  @ApiOperation({ summary: "Agrega un docente a la carrera y le envía la activación si es nuevo." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  storeTeacher(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => storeCareerTeacher(web, this.deps.careerTeachers(), career))
  }

  @UnmatchedMethods("teachers")
  teachersOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Post("teachers/import")
  @ApiOperation({ summary: "Importa docentes desde una hoja .xlsx (10 por minuto)." })
  @ApiConsumes("multipart/form-data")
  @ApiBody(SPREADSHEET)
  @ApiUnprocessableEntityResponse(VALIDATION)
  importTeachers(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => importTeachers(web, this.deps.teacherImports(), career))
  }

  @Delete("teachers/import")
  @ApiOperation({ summary: "Quita de la carrera al docente con identificador «import»: responde como la ruta de eliminación." })
  removeImportTeacher(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => destroyCareerTeacher(web, "import", this.deps.careerTeachers(), career))
  }

  @UnmatchedMethods("teachers/import")
  teacherImportOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Get("teachers/import-template")
  @ApiOperation({ summary: "Descarga la plantilla .xlsx de docentes." })
  @ApiOkResponse({ description: "Libro .xlsx." })
  teacherTemplate(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => teacherImportTemplate(web, this.deps.teacherImports(), career))
  }

  @Delete("teachers/import-template")
  @ApiOperation({ summary: "Quita de la carrera al docente con identificador «import-template»: responde como la ruta de eliminación." })
  removeImportTemplateTeacher(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => destroyCareerTeacher(web, "import-template", this.deps.careerTeachers(), career))
  }

  @UnmatchedMethods("teachers/import-template")
  teacherTemplateOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Post("teachers/:user/resend-activation")
  @ApiOperation({ summary: "Reenvía la activación a un docente pendiente." })
  @ApiParam({ name: "user", format: "uuid" })
  resendActivation(@Req() request: ApiRequest, @Param("career") career: string, @Param("user") user: string): Promise<WebReply> {
    return handled(request, (web) => resendCareerTeacherActivation(web, user, this.deps.careerTeachers(), career))
  }

  @Delete("teachers/:user")
  @ApiOperation({ summary: "Quita al docente de la carrera." })
  @ApiParam({ name: "user", format: "uuid" })
  removeTeacher(@Req() request: ApiRequest, @Param("career") career: string, @Param("user") user: string): Promise<WebReply> {
    return handled(request, (web) => destroyCareerTeacher(web, user, this.deps.careerTeachers(), career))
  }

  @UnmatchedMethods("teachers/:user")
  teacherOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Post(":entity")
  @ApiOperation({ summary: "Crea una asignatura o una asignación docente." })
  @ApiParam({ name: "entity", enum: ["asignatura", "asignacion_docente"] })
  @ApiBody(CAREER_RECORD_BODY)
  @ApiUnprocessableEntityResponse(VALIDATION)
  create(@Req() request: ApiRequest, @Param("career") career: string, @Param("entity") entity: string): Promise<WebReply> {
    return handled(request, (web) => createCareerRecord(web, entity, this.deps.careerWrites(), career))
  }

  @Patch(":entity/:record")
  @ApiOperation({ summary: "Edita una asignatura.", description: CONFIRM })
  @ApiParam({ name: "entity", enum: ["asignatura"] })
  @ApiParam({ name: "record", format: "uuid" })
  @ApiBody({ type: SubjectDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  update(@Req() request: ApiRequest, @Param("career") career: string, @Param("entity") entity: string, @Param("record") record: string): Promise<WebReply> {
    return handled(request, (web) => updateCareerRecord(web, entity, record, this.deps.careerWrites(), career))
  }

  @Delete(":entity/:record")
  @ApiOperation({ summary: "Elimina una asignación docente." })
  @ApiParam({ name: "entity", enum: ["asignacion_docente"] })
  @ApiParam({ name: "record", format: "uuid" })
  remove(@Req() request: ApiRequest, @Param("career") career: string, @Param("entity") entity: string, @Param("record") record: string): Promise<WebReply> {
    return handled(request, (web) => deleteCareerRecord(web, entity, record, this.deps.deletions(), career))
  }
}
