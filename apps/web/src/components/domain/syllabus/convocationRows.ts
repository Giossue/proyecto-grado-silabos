import type { SyllabusProcess } from "@/api/processes"
import type { AcademicStructureProps } from "@/types/academic"

type PeriodRecord = AcademicStructureProps["catalogs"]["periods"][number]

export type ConvocationRow = PeriodRecord & { process: SyllabusProcess | null }
