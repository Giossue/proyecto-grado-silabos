import {
  curriculumConfigurationSchema,
  facultySchema,
  mallaSchema,
  mallaTargetSchema,
  parallelSchema,
  parallelsSchema,
  parallelTeacherSchema,
  periodSchema,
  requirementSchema,
  statusSchema,
  subjectLayoutSchema,
  subjectSchema,
  teacherAssignmentSchema,
} from "@silabos/shared/schemas/academic"
import { createZodDto } from "nestjs-zod"

export class FacultyDto extends createZodDto(facultySchema({ updating: false })) {}

export class PeriodDto extends createZodDto(periodSchema({ startsOn: null, creating: true })) {}

export class StatusDto extends createZodDto(statusSchema) {}

export class CurriculumConfigurationDto extends createZodDto(curriculumConfigurationSchema) {}

export class RequirementDto extends createZodDto(requirementSchema({ subjectId: null, hasSubject: true })) {}

export class SubjectLayoutDto extends createZodDto(subjectLayoutSchema) {}

export class SubjectDto extends createZodDto(subjectSchema().extend(mallaTargetSchema().shape)) {}

export class MallaDto extends createZodDto(mallaSchema({ updating: false })) {}

export class MallaUpdateDto extends createZodDto(mallaSchema({ updating: true })) {}

export class TeacherAssignmentDto extends createZodDto(teacherAssignmentSchema()) {}

export class ParallelsDto extends createZodDto(parallelsSchema()) {}

export class ParallelDto extends createZodDto(parallelSchema) {}

export class ParallelTeacherDto extends createZodDto(parallelTeacherSchema) {}
