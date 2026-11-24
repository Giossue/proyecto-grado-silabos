// @vitest-environment node
import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../configuration/__fixtures__/template-golden.json"
import type { PhpRecord } from "../configuration/phpValues"
import { fakeNotificationTransaction, notificationWorld, recipient, type NotificationWorld } from "../notifications/testing"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { jobOptions, uniqueJobId } from "../queue/job"
import type { SignatureRecord } from "../syllabus/snapshotDocuments"
import {
  ExportForbidden,
  ExportRejected,
  existingExport,
  failSyllabusExport,
  generateSyllabusExport,
  requestExport,
  type ExportJobDeps,
  type ExportRequestTx,
  type NewStoredObject,
  type StoredObjectRow,
} from "./syllabusExport"
import { createSyllabusExportJob } from "./syllabusExportJob"
import type { DocumentBundle, DocumentRenderInput } from "./syllabusRenderer"

const NOW = 1_795_534_200
const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const REVISION = "70000000-0000-4000-8000-000000000001"
const ARTIFACT = "e1000000-0000-4000-8000-000000000001"
const TEACHER = "a1000000-0000-4000-8000-000000000001"
const ADMIN = "ad000000-0000-4000-8000-000000000001"
const COORDINATOR = "c1000000-0000-4000-8000-000000000001"
const PATH = `exports/${REVISION}/${ARTIFACT}/syllabus.pdf`
const PDF = Buffer.from("%PDF-1.7\nsílabo\n%%EOF\n")
const SECRET = "SECRET=/srv/private/documento.docx"

type Artifact = { state: string; objectId: string | null; completedAt: number | null }
type StoredObject = NewStoredObject

let notices: NotificationWorld
let artifacts: Map<string, Artifact>
let objects: StoredObject[]
let files: Map<string, Buffer>
let audits: AuditEventInput[]
let renders: DocumentRenderInput[]
let approval: { approver: string; at: number } | null
let facts: { coordination: { reviewer: string; at: number } | null; verification: { verifier: string; at: number } | null }
let signatures: SignatureRecord[]
let ids: number
let pdf: Buffer

const snapshot: PhpRecord = { template_definition: golden.definition, template_variables: { nombre_asignatura: "Biología" }, sections: [] }

function objectRow(object: StoredObject): StoredObjectRow {
  return { id: object.id, mime: object.mime, size: object.size, fingerprint: object.fingerprint }
}

function deps(): ExportJobDeps {
  return {
    store: {
      subject: async (id) =>
        id === ARTIFACT
          ? {
              artifactId: ARTIFACT,
              requestedBy: TEACHER,
              requestedAt: "2026-11-24T15:00:00+00:00",
              syllabusId: SYLLABUS,
              subject: "Biología",
              code: "C2",
              period: "2026-2",
              revision: { id: REVISION, number: 3, fingerprint: "f".repeat(64), submittedAt: NOW - 86_400 * 4 },
              snapshot,
            }
          : null,
      approval: async () => approval,
      signedFacts: async () => facts,
      signatures: async () => signatures,
      findObject: async (disk, path) => {
        const object = objects.find((item) => item.disk === disk && item.path === path)
        return object ? objectRow(object) : null
      },
      firstOrCreateObject: async (row) => {
        const existing = objects.find((item) => item.disk === row.disk && item.path === row.path)
        if (existing) return objectRow(existing)
        objects.push(row)
        return objectRow(row)
      },
    },
    async transaction(work) {
      const staged = new Map<string, Artifact>()
      const stagedAudits: AuditEventInput[] = []
      const current = (id: string) => staged.get(id) ?? artifacts.get(id)
      const result = await fakeNotificationTransaction(notices, NOW, (notifications) =>
        work({
          notifications,
          lockArtifact: async (id) => {
            const artifact = current(id)
            return artifact ? { state: artifact.state, syllabusId: SYLLABUS, revisionNumber: 3 } : null
          },
          markRunning: async (id) => void staged.set(id, { ...(current(id) as Artifact), state: "en_ejecucion" }),
          markFailed: async (id) => void staged.set(id, { ...(current(id) as Artifact), state: "fallido" }),
          complete: async (id, objectId, at) => void staged.set(id, { state: "completado", objectId, completedAt: at }),
          teachersFor: async () => [TEACHER],
          administrators: async () => [ADMIN],
          recordAudit: async (event) => void stagedAudits.push(event),
        }),
      )
      for (const [id, artifact] of staged) artifacts.set(id, artifact)
      audits.push(...stagedAudits)
      return result
    },
    render: async (input): Promise<DocumentBundle> => {
      renders.push(input)
      return {
        docx: { format: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx", bytes: await validDocx(), reproducible: true },
        pdf: { format: "pdf", mime: "application/pdf", extension: "pdf", bytes: pdf, reproducible: false },
      }
    },
    writeObject: async (_disk, path, bytes) => void files.set(path, bytes),
    now: () => NOW,
    newId: () => `0b000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
  }
}

async function validDocx(): Promise<Buffer> {
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()
  for (const name of ["[Content_Types].xml", "_rels/.rels"]) zip.file(name, "<x/>")
  zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>')
  return zip.generateAsync({ type: "nodebuffer" })
}

beforeEach(() => {
  notices = notificationWorld({ users: [recipient(TEACHER), recipient(ADMIN)], subjects: new Map([[SYLLABUS, "Biología"]]) })
  artifacts = new Map([[ARTIFACT, { state: "pendiente", objectId: null, completedAt: null }]])
  objects = []
  files = new Map()
  audits = []
  renders = []
  approval = { approver: "María José Pérez López", at: NOW - 600 }
  facts = { coordination: { reviewer: "María José Pérez López", at: NOW - 600 }, verification: { verifier: "Rosa Elena Yánez Campos", at: NOW - 86_400 } }
  signatures = []
  ids = 0
  pdf = PDF
})

describe("GenerateSyllabusExportJob", () => {
  it("is queued on «documentos» once per artifact with Laravel's retries, timeout and backoff", () => {
    const job = createSyllabusExportJob(deps)
    expect(job).toMatchObject({ name: "GenerateSyllabusExportJob", queue: "documentos", tries: 3, timeout: 120, backoff: [5, 30, 120], runsOnce: true })
    expect(uniqueJobId(job, { artifactId: ARTIFACT })).toBe(`GenerateSyllabusExportJob-${ARTIFACT}`)
    expect(jobOptions(job, { artifactId: ARTIFACT })).toMatchObject({ attempts: 3, jobId: `GenerateSyllabusExportJob-${ARTIFACT}` })
  })

  it("generates a consistent private PDF, completes the artifact, notifies the teacher and audits", async () => {
    await generateSyllabusExport(ARTIFACT, deps())

    expect(files.get(PATH)).toEqual(PDF)
    expect(objects).toEqual([
      {
        id: "0b000000-0000-4000-8000-000000000001",
        disk: "private",
        path: PATH,
        name: "silabo-revision-3.pdf",
        mime: "application/pdf",
        size: PDF.length,
        fingerprint: createHash("sha256").update(PDF).digest("hex"),
        classification: "syllabus_export",
        ownerId: TEACHER,
        storedAt: NOW,
      },
    ])
    expect(artifacts.get(ARTIFACT)).toEqual({ state: "completado", objectId: "0b000000-0000-4000-8000-000000000001", completedAt: NOW })
    expect(notices.notifications).toEqual([
      expect.objectContaining({
        userId: TEACHER,
        key: `flujo:silabo.aprobado:${REVISION}`,
        type: "silabo.aprobado",
        title: "Sílabo aprobado",
        message: "Ya puede descargar el PDF firmado del sílabo de Biología, revisión 3.",
        resourceType: "artefacto_exportacion",
        resourceId: ARTIFACT,
      }),
    ])
    expect(notices.mails).toEqual([expect.objectContaining({ mailable: "workflow", to: recipient(TEACHER).email })])
    expect(audits).toEqual([
      {
        actorId: null,
        roleAssignmentId: null,
        action: "documento.exportacion_completada",
        resourceType: "artefacto_exportacion",
        resourceId: ARTIFACT,
        result: "exito",
        metadata: { revision_number: 3, pdf_object_id: "0b000000-0000-4000-8000-000000000001" },
        occurredAt: NOW,
      },
    ])
    expect(renders[0]).toMatchObject({ subject: "Biología", subjectCode: "C2", academicPeriod: "2026-2", revisionNumber: 3, generatedAt: "2026-11-24T15:00:00+00:00", locale: "es-EC" })
  })

  it("signs coordination with the coordinator who reviewed, even when someone else approved", async () => {
    approval = { approver: "Lucía Biblioteca", at: NOW }
    facts = { coordination: { reviewer: "María José Pérez López", at: NOW - 86_400 * 3 }, verification: null }
    signatures = [
      { role: "coordinacion", name: "María", signedAt: NOW - 86_400 * 3, certificateName: "MARIA JOSE PEREZ LOPEZ", serial: "0A", issuer: "C=EC, CN=AUTORIDAD DE PRUEBA, O=X" },
    ]
    await generateSyllabusExport(ARTIFACT, deps())
    expect(renders[0].snapshot.template_variables).toEqual({
      nombre_asignatura: "Biología",
      fecha_entrega: "20-11-2026",
      nombre_coordinador: "María José Pérez López",
      fecha_revision: "21-11-2026",
      nombre_bibliotecario: "Lucía Biblioteca",
      fecha_verificacion: "24-11-2026",
      firma_coordinador: "\n\nFirmado electrónicamente por MARIA JOSE PEREZ LOPEZ · Coordinación · 21-11-2026 10:30 · certificado N.º 0A · AUTORIDAD DE PRUEBA\nFirma de coordinación",
    })
  })

  it("runs again without a second object or a second notice", async () => {
    await generateSyllabusExport(ARTIFACT, deps())
    artifacts.set(ARTIFACT, { state: "en_ejecucion", objectId: null, completedAt: null })
    pdf = Buffer.from("%PDF-1.7\notro\n%%EOF\n")
    await generateSyllabusExport(ARTIFACT, deps())
    expect(objects).toHaveLength(1)
    expect(files.get(PATH)).toEqual(PDF)
    expect(notices.notifications).toHaveLength(1)
    expect(artifacts.get(ARTIFACT)?.state).toBe("completado")
  })

  it("leaves completed or missing artifacts alone", async () => {
    artifacts.set(ARTIFACT, { state: "completado", objectId: "x", completedAt: NOW - 10 })
    await generateSyllabusExport(ARTIFACT, deps())
    await generateSyllabusExport("e1000000-0000-4000-8000-000000000099", deps())
    expect(renders).toEqual([])
    expect(audits).toEqual([])
    expect(artifacts.get(ARTIFACT)).toEqual({ state: "completado", objectId: "x", completedAt: NOW - 10 })
  })

  it("fails while running when the revision is no longer approved", async () => {
    approval = null
    await expect(generateSyllabusExport(ARTIFACT, deps())).rejects.toThrow("La revisión dejó de estar aprobada.")
    expect(artifacts.get(ARTIFACT)?.state).toBe("en_ejecucion")
    expect(objects).toEqual([])
  })

  it("refuses an existing private object that does not match a reproducible document", async () => {
    objects.push({ id: "old", disk: "private", path: PATH, name: "x", mime: "application/pdf", size: 1, fingerprint: "0", classification: "syllabus_export", ownerId: TEACHER, storedAt: 0 })
    const reproducible = deps()
    const render = reproducible.render
    reproducible.render = async (input) => {
      const bundle = await render(input)
      return { ...bundle, pdf: { ...bundle.pdf, reproducible: true } }
    }
    await expect(generateSyllabusExport(ARTIFACT, reproducible)).rejects.toThrow("El objeto privado existente no coincide con la exportación esperada.")
    expect(files.size).toBe(0)
  })

  it("records a safe failure for administrators", async () => {
    artifacts.set(ARTIFACT, { state: "en_ejecucion", objectId: null, completedAt: null })
    await failSyllabusExport(ARTIFACT, deps())
    expect(artifacts.get(ARTIFACT)?.state).toBe("fallido")
    expect(audits).toEqual([
      {
        actorId: null,
        roleAssignmentId: null,
        action: "documento.exportacion_fallida",
        resourceType: "artefacto_exportacion",
        resourceId: ARTIFACT,
        result: "fallido",
        metadata: { error_code: "exportacion_documento_fallida" },
        occurredAt: NOW,
      },
    ])
    expect(notices.notifications).toEqual([
      expect.objectContaining({
        userId: ADMIN,
        key: `flujo:documento.exportacion_fallida:${ARTIFACT}`,
        title: "No se pudieron generar los documentos",
        message: "Es el PDF del sílabo de Biología, revisión 3. Revise el servicio de documentos y la cola; después, Coordinación puede generarlo de nuevo desde «Documentos».",
        resourceType: "artefacto_exportacion",
      }),
    ])
    expect(JSON.stringify(notices.notifications)).not.toContain(SECRET)
  })

  it("does not fail a completed artifact", async () => {
    artifacts.set(ARTIFACT, { state: "completado", objectId: "x", completedAt: NOW })
    await failSyllabusExport(ARTIFACT, deps())
    expect(artifacts.get(ARTIFACT)?.state).toBe("completado")
    expect(audits).toEqual([])
    expect(notices.notifications).toEqual([])
  })
})

describe("RequestSyllabusExport", () => {
  type Row = { id: string; revisionId: string; key: string; requestedBy: string; requestedAt: number }
  let rows: Row[]
  let dispatched: string[]
  let requestAudits: AuditEventInput[]
  let approved: boolean
  let revisionSyllabus: string

  function tx(): ExportRequestTx {
    return {
      existingArtifact: async (revisionId, key) => {
        const row = rows.find((item) => item.revisionId === revisionId && item.key === key)
        return row ? { id: row.id, state: "pendiente", requestedBy: row.requestedBy } : null
      },
      lockSyllabus: async (id) => id === SYLLABUS,
      lockRevision: async (id) => (id === REVISION ? { syllabusId: revisionSyllabus, number: 3 } : null),
      approved: async () => approved,
      insertArtifact: async (row) => void rows.push(row),
      dispatchExport: (id) => void dispatched.push(id),
      recordAudit: async (event) => void requestAudits.push(event),
    }
  }
  const request = (key: string, actorId = TEACHER) => ({ revisionId: REVISION, syllabusId: SYLLABUS, key, actor: { id: actorId, roleAssignmentId: "r1" }, now: NOW, newId: () => ARTIFACT, rendererVersion: "phpword-docx-v4+libreoffice-pdf-v1" })
  const KEY = "9a5b0c3e-4f1d-4a2b-8c7d-6e5f4a3b2c1d"

  beforeEach(() => {
    rows = []
    dispatched = []
    requestAudits = []
    approved = true
    revisionSyllabus = SYLLABUS
  })

  it("creates a pending artifact, dispatches the job and audits the renderer version", async () => {
    expect(await requestExport(tx(), request(KEY))).toEqual({ id: ARTIFACT, state: "pendiente", requestedBy: TEACHER })
    expect(rows).toEqual([{ id: ARTIFACT, revisionId: REVISION, key: KEY, requestedBy: TEACHER, requestedAt: NOW }])
    expect(dispatched).toEqual([ARTIFACT])
    expect(requestAudits).toEqual([
      {
        actorId: TEACHER,
        roleAssignmentId: "r1",
        action: "documento.exportacion_solicitada",
        resourceType: "artefacto_exportacion",
        resourceId: ARTIFACT,
        result: "exito",
        metadata: { revision_number: 3, renderer_version: "phpword-docx-v4+libreoffice-pdf-v1" },
        occurredAt: NOW,
      },
    ])
  })

  it("is idempotent for the same requester and forbidden for anyone else", async () => {
    await requestExport(tx(), request(KEY))
    expect(await requestExport(tx(), request(KEY))).toEqual({ id: ARTIFACT, state: "pendiente", requestedBy: TEACHER })
    expect(rows).toHaveLength(1)
    expect(dispatched).toHaveLength(1)
    await expect(existingExport(tx(), REVISION, KEY, COORDINATOR)).rejects.toBeInstanceOf(ExportForbidden)
  })

  it("only an approved revision of the same syllabus generates documents", async () => {
    approved = false
    await expect(requestExport(tx(), request(KEY))).rejects.toEqual(new ExportRejected({ revision: ["Solo una revisión aprobada puede generar documentos."] }))
    approved = true
    revisionSyllabus = "50000000-0000-4000-8000-000000000002"
    await expect(requestExport(tx(), request(KEY))).rejects.toEqual(new ExportRejected({ revision: ["La revisión no pertenece al expediente solicitado."] }))
    expect(rows).toEqual([])
  })
})
