import { Inject, Injectable } from "@nestjs/common"
import { Prisma } from "../../../generated/prisma/client"
import { PrismaService } from "../../../prisma/prisma.service"
import type { AcademicDeletionStore, DeletionTx } from "../../../server/academic/deletions"
import { TRANSACTION_OPTIONS } from "../academic-handler"
import { AcademicStructurePrismaRepository } from "./academic-structure.repository"
import { SYLLABUS_SCOPE, TOUCHED_SYLLABUS } from "./scheduled-subjects.repository"

type Runner = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">

const IN_CAREER = (careerId: string) => Prisma.sql`exists (select * from asignaturas where paralelos.asignatura_id = asignaturas.asignatura_id
  and asignaturas.carrera_id = ${careerId}::uuid)`

async function first<T>(runner: Runner, query: Prisma.Sql): Promise<T | null> {
  const rows = await runner.$queryRaw<T[]>(query)
  return rows[0] ?? null
}

async function exists(runner: Runner, query: Prisma.Sql): Promise<boolean> {
  return (await first<{ found: boolean }>(runner, Prisma.sql`select exists (${query}) as found`))?.found === true
}

export function deletionTxOn(tx: Runner): DeletionTx {
  return {
    lockPeriod: (id) =>
      first(tx, Prisma.sql`select periodo_academico_id::text as id, codigo_periodo_academico as code
        from periodos_academicos where periodo_academico_id = ${id}::uuid limit 1 for update`),
    periodHasProcess: (id) => exists(tx, Prisma.sql`select * from convocatorias_universidad where periodo_academico_id = ${id}::uuid`),
    async deletePeriod(id) {
      await tx.$executeRaw`delete from periodos_academicos where periodo_academico_id = ${id}::uuid`
    },
    lockTeacherAssignment: (id, careerId) =>
      first(tx, Prisma.sql`select asignaciones_paralelo.asignacion_paralelo_id::text as id from asignaciones_paralelo
        where exists (select * from paralelos where asignaciones_paralelo.paralelo_id = paralelos.paralelo_id and ${IN_CAREER(careerId)})
          and asignaciones_paralelo.asignacion_paralelo_id = ${id}::uuid limit 1 for update`),
    async deleteTeacherAssignment(id) {
      await tx.$executeRaw`delete from asignaciones_paralelo where asignacion_paralelo_id = ${id}::uuid`
    },
    lockParallel: (id, careerId) =>
      first(tx, Prisma.sql`select paralelos.paralelo_id::text as id, paralelos.codigo_paralelo as code from paralelos
        where paralelos.paralelo_id = ${id}::uuid and ${IN_CAREER(careerId)} limit 1 for update`),
    parallelHasTeacherAssignment: (id) => exists(tx, Prisma.sql`select * from asignaciones_paralelo where paralelo_id = ${id}::uuid`),
    parallelHasTouchedSyllabus: (id) => exists(tx, Prisma.sql`select * from silabos where paralelo_id = ${id}::uuid and ${TOUCHED_SYLLABUS} and ${SYLLABUS_SCOPE}`),
    async deleteParallelSyllabi(id) {
      await tx.$executeRaw`delete from silabos where paralelo_id = ${id}::uuid and ${SYLLABUS_SCOPE}`
    },
    async deleteParallel(id) {
      await tx.$executeRaw`delete from paralelos where paralelo_id = ${id}::uuid`
    },
  }
}

@Injectable()
export class AcademicDeletionPrismaStore implements AcademicDeletionStore {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AcademicStructurePrismaRepository) private readonly structure: AcademicStructurePrismaRepository,
  ) {}

  async careerActive(careerId: string): Promise<boolean> {
    return (await this.structure.activeCareer(careerId)) !== null
  }

  transaction<T>(work: (tx: DeletionTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(deletionTxOn(tx)), TRANSACTION_OPTIONS)
  }
}
