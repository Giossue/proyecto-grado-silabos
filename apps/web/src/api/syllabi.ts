import { setTemplateRuntime } from "@/lib/blocks/runtime";
import type { DocumentStyle, TemplateDefinitionPayload } from "@silabos/shared/lib/blocks/types";
import type { DocumentNode } from "@silabos/shared/lib/templateDocument";
import { api } from "@/api/client";
import type { TemplateAppearance } from "@/api/template";
import type { DocumentField } from "@/types/configuration";
import type { SignaturePayload, SignatureSummary } from "@/api/signatures";

export type DocumentPresentation = {
  document?: DocumentStyle;
  appearance: TemplateAppearance;
  title: string;
  logos: { institution: string; faculty: string };
};

export type SyllabusRow = {
  id: string;
  subject: string;
  code: string;
  convocation: string;
  period: string;
  state:
    | "sin_iniciar"
    | "borrador"
    | "en_revision"
    | "correccion_solicitada"
    | "aprobado";
  iniciado_en: string | null;
  parallels: string[];
  guardado_en: string | null;
};

export type SyllabusPage = {
  data: SyllabusRow[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
};

export type SyllabiResponse = {
  filters: { q: string | null; state: string | null };
  syllabi: SyllabusPage;
  /** La carrera tiene un periodo académico abierto o en pausa. */
  convocation_open?: boolean;
};

export type SyllabusDetail = {
  id: string;
  subject: string;
  code: string;
  convocation: string;
  period: string;
  state: SyllabusRow["state"];
  version_bloqueo: number;
  editable?: boolean;
  edit_block_reason?: string | null;
  /** Pausa, cierre o plazo vencido: la franja ya lo explica y no se repite en el sílabo. */
  edit_blocked_by_convocation?: boolean;
  approved_revision_id?: string | null;
  iniciado_en: string | null;
  parallels: string[];
  copy_sources?: Array<{ id: string; parallel: string; state: SyllabusRow["state"] }>;
  teachers: string[];
  template_variables?: Record<string, string>;
  definition?: TemplateDefinitionPayload;
  validation?: {
    version_bloqueo: number;
    blocking_errors: number;
    warnings: number;
    results: Array<{ field_id: string | null; code: string; severity: string; message: string }>;
  } | null;
  presentation: DocumentPresentation;
  sections: Array<{
    id: string;
    key: string;
    title: string;
    description: string | null;
    fields: SyllabusField[];
    orientation: 'portrait' | 'landscape';
  }>;
  review_stage?: "biblioteca" | "coordinacion" | null;
  signatures?: SignatureSummary[];
  teacher_signature_required?: boolean;
  /** En corrección solicitada: el docente no ha cambiado nada desde que se la pidieron. */
  unchanged_since_correction?: boolean;
  review_comments?: Array<{
    stage: "biblioteca" | "coordinacion";
    comment: string;
    commented_at: string;
    commented_by: string;
    revision_number: number;
  }>;
};

export type SyllabusField = DocumentField & {
  id: string;
  required: boolean;
  teacher_editable: boolean;
};

export const getTeacherSyllabi = (
  filters: { q?: string; state?: string; page?: number } = {},
) => {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.state && filters.state !== "all")
    query.set("state", filters.state);
  if (filters.page && filters.page > 1) query.set("page", String(filters.page));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";

  return api<SyllabiResponse>(`/teacher/syllabi${suffix}`);
};

const rememberBlocks = <T extends { syllabus: SyllabusDetail }>(response: T): T => {
  setTemplateRuntime(response.syllabus.definition, response.syllabus.template_variables);
  return response;
};
export const getTeacherSyllabus = (syllabusId: string) =>
  api<{ syllabus: SyllabusDetail }>(`/teacher/syllabi/${syllabusId}`).then(rememberBlocks);
export const startTeacherSyllabus = (syllabusId: string) =>
  api<{ message: string; syllabus: SyllabusDetail }>(
    `/teacher/syllabi/${syllabusId}/start`,
    { method: "POST" },
  ).then(rememberBlocks);
export const saveTeacherField = (
  syllabusId: string,
  fieldId: string,
  version: number,
  value: unknown,
) =>
  api<{ estado?: SyllabusDetail["state"]; version_bloqueo: number; guardado_en: string | null; document: DocumentNode }>(
    `/teacher/syllabi/${syllabusId}/fields/${fieldId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ version_bloqueo: version, value }),
    },
  );
export const copyTeacherSyllabus = (
  syllabusId: string,
  sourceId: string,
  version: number,
) =>
  api<{ message: string; syllabus: SyllabusDetail }>(
    `/teacher/syllabi/${syllabusId}/copy-from/${sourceId}`,
    { method: "POST", body: JSON.stringify({ version_bloqueo: version }) },
  );
export const validateTeacherSyllabus = (syllabusId: string) =>
  api<{
    message: string;
    validation: {
      version_bloqueo: number;
      blocking_errors: number;
      warnings: number;
      results: Array<{
        field_id: string | null;
        code: string;
        severity: string;
        message: string;
      }>;
    };
  }>(`/teacher/syllabi/${syllabusId}/validate`, { method: "POST" });
export const getTeacherSigningStatement = (syllabusId: string, version: number) =>
  api<{ statement: string; required: boolean }>(
    `/teacher/syllabi/${syllabusId}/signing-statement`,
    { method: "POST", body: JSON.stringify({ version_bloqueo: version }) },
  );
export const submitTeacherSyllabus = (
  syllabusId: string,
  version: number,
  idempotencyKey: string = crypto.randomUUID(),
  signature: SignaturePayload | null = null,
) =>
  api<{ message: string; syllabus: SyllabusDetail }>(
    `/teacher/syllabi/${syllabusId}/submit`,
    {
      method: "POST",
      body: JSON.stringify({
        version_bloqueo: version,
        idempotency_key: idempotencyKey,
        ...(signature ? { signature } : {}),
      }),
    },
  );
export type HistoryCareer = { id: string; code: string; name: string; syllabi_count: number };

export type HistorySyllabus = {
  id: string;
  subject: string;
  period: string;
  state: SyllabusRow["state"];
  parallels: string[];
  guardado_en: string | null;
};

export const getTeacherHistory = () => api<{ careers: HistoryCareer[] }>("/teacher/history");

export const getTeacherHistoryCareer = (career: string) =>
  api<{ career: { id: string; name: string }; syllabi: HistorySyllabus[] }>(
    `/teacher/history/${encodeURIComponent(career)}`,
  );
