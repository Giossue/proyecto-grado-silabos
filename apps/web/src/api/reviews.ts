import { api } from "@/api/client";
import type { DocumentPresentation } from "@/api/syllabi";
import type { SignaturePayload, SignatureSummary } from "@/api/signatures";
import type { DocumentField, StoredResponsible } from "@/types/configuration";
import type { PaginationMeta } from "@/types/pagination";

export type ReviewStage = "biblioteca" | "coordinacion";
export const REVIEW_STAGE_LABELS: Record<ReviewStage, string> = { biblioteca: "En biblioteca", coordinacion: "En coordinación" };
export const reviewStageLabel = (stage: string | null | undefined): string => (stage && Object.hasOwn(REVIEW_STAGE_LABELS, stage) ? REVIEW_STAGE_LABELS[stage as ReviewStage] : "");

export type ReviewQueueItem = {
  id: string;
  revision_id: string;
  revision_number: number;
  subject: string;
  code: string;
  period: string;
  state: string;
  stage?: ReviewStage | null;
  teachers: string[];
  submitted_at: string;
};
export type ReviewsPage = {
  filters: { search: string };
  syllabi: {
    data: ReviewQueueItem[];
    current_page: number;
    last_page: number;
    per_page: number;
    from: number | null;
    to: number | null;
    total: number;
  };
};
export type SnapshotField = DocumentField;
export type SnapshotSection = {
  key: string;
  title: string;
  orientation?: 'portrait' | 'landscape';
  fields: SnapshotField[];
};
export type ReviewDetail = {
  syllabus: {
    id: string;
    subject: string;
    code: string;
    period: string;
    state: string;
    stage?: ReviewStage | null;
    teachers: string[];
  };
  my_stage?: ReviewStage | null;
  can_decide?: boolean;
  signing_statement?: string | null;
  signatures?: SignatureSummary[];
  presentation: DocumentPresentation;
  revision: {
    id: string;
    number: number;
    submitted_at: string;
    submitted_by: string;
    snapshot: {
      schema_version?: number;
      template_variables?: Record<string, string>;
      sections: SnapshotSection[];
    };
    is_current: boolean;
  };
  history: Array<{
    id: string;
    number: number;
    submitted_at: string;
    submitted_by: string;
    coordination_reviewed_at?: string | null;
    coordination_reviewed_by?: string | null;
    approved_at: string | null;
    approved_by?: string | null;
  }>;
  timeline: ReviewTimelineEvent[];
  correction_request: { justification: string | null; requested_at: string; stage?: ReviewStage; requested_by?: string | null } | null;
  decisions_allowed: boolean;
  /** Convocatoria cerrada: la revisión queda solo para consulta. La pausa la explica la franja. */
  convocation_closed?: boolean;
  /** Por qué no se puede decidir ahora (cerrada o en pausa), o null. */
  decision_block?: string | null;
  reset: { allowed: boolean; erases_history?: boolean; revisions?: number; signatures?: number; has_pdf?: boolean };
};
export type ReviewTimelineEvent = {
  kind: "enviado" | "biblioteca_verifico" | "coordinacion_aprobo" | "correccion" | "devuelto_biblioteca" | "aprobado";
  at: string;
  revision_id: string;
  revision_number: number;
  by: string | null;
  comment: string | null;
  previous_id: string | null;
};
export type ReviewComparison = {
  syllabus: { id: string; subject: string; code: string; period: string; current_revision_id?: string | null; revisions?: Array<{ id: string; number: number; submitted_at: string }> };
  comparison: {
    before_revision: number;
    after_revision: number;
    changed_fields: number;
    changes: Array<{
      section_key: string;
      section_title: string;
      field_key: string;
      label: string;
      quien_llena: StoredResponsible;
      change: "added" | "removed" | "modified";
      before: { value: unknown } | null;
      after: { value: unknown } | null;
    }>;
  };
};

export const getReviews = (
  filters: { search?: string; sort?: string; dir?: string; page?: number } = {},
) => {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.sort) query.set("sort", filters.sort);
  if (filters.sort && filters.dir) query.set("dir", filters.dir);
  if (filters.page && filters.page > 1) query.set("page", String(filters.page));
  return api<ReviewsPage>(
    `/coordination/reviews${query.size ? `?${query}` : ""}`,
  );
};
export const getReview = (revisionId: string) =>
  api<ReviewDetail>(`/coordination/reviews/${revisionId}`);
export const compareReviews = (beforeId: string, afterId: string) =>
  api<ReviewComparison>(`/coordination/reviews/${beforeId}/compare/${afterId}`);
export const requestCorrection = (
  revisionId: string,
  payload: { justification: string },
) =>
  api<{ message: string }>(
    `/coordination/reviews/${revisionId}/request-correction`,
    { method: "POST", body: JSON.stringify(payload) },
  );
export const approveReview = (revisionId: string, signature: SignaturePayload | null) =>
  api<{ message: string }>(`/coordination/reviews/${revisionId}/approve`, {
    method: "POST",
    body: JSON.stringify({ signature }),
  });
export const resetSyllabus = (syllabusId: string, reason: string) =>
  api<{ message: string }>(`/coordination/syllabi/${syllabusId}/reset`, { method: "POST", body: JSON.stringify({ reason }) });

export type CoordinationHistoryItem = {
  id: string;
  revision_id: string;
  period: string;
  subject: string;
  code: string;
  parallels: string[];
  author: string | null;
  approved_at: string | null;
};
export type CoordinationHistoryPage = {
  filters: { q: string | null; period: string | null };
  periods: Array<{ id: string; code: string }>;
  syllabi: PaginationMeta & { data: CoordinationHistoryItem[] };
};
export const getCoordinationHistory = (filters: { q?: string; period?: string; sort?: string; dir?: string; page?: number } = {}) => {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.period && filters.period !== "all") query.set("period", filters.period);
  if (filters.sort) query.set("sort", filters.sort);
  if (filters.sort && filters.dir) query.set("dir", filters.dir);
  if (filters.page && filters.page > 1) query.set("page", String(filters.page));
  return api<CoordinationHistoryPage>(`/coordination/history${query.size ? `?${query}` : ""}`);
};
