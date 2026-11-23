import { api } from '@/api/client';
import type { ReviewDetail, SnapshotSection } from '@/api/reviews';
import type { SignaturePayload, SignatureSummary } from '@/api/signatures';
import type { PaginationMeta } from '@/types/pagination';

export type LibraryReviewState = 'pendiente' | 'atendido';

// Cómo terminó un envío atendido.
export type LibraryReviewOutcome = 'firmado' | 'devuelto' | 'reemplazado';

export type LibraryReviewItem = {
  revision_id: string;
  syllabus_id: string;
  subject: string;
  code: string;
  faculty?: string | null;
  career: string;
  period: string;
  parallels: string[];
  teachers: string[];
  revision_number: number;
  sent_at: string;
  sent_by: string;
  signed_by?: string | null;
  responsible?: string | null;
  state: LibraryReviewState;
  outcome: LibraryReviewOutcome | null;
};

export type LibraryComment = {
  comment: string;
  commented_at: string;
  commented_by: string;
  revision_number: number;
};

export type LibraryReviewDetail = LibraryReviewItem & {
  assigned_to_other?: boolean;
  can_comment: boolean;
  can_verify: boolean;
  /** Por qué no se puede decidir ahora (cerrada o en pausa), o null. */
  decision_block?: string | null;
  signing_statement?: string | null;
  signatures?: SignatureSummary[];
  verified_at: string | null;
  verified_by: string | null;
  /** Coordinación aprobó el sílabo y ya hay PDF. */
  approved_at?: string | null;
  presentation: ReviewDetail['presentation'];
  template_variables: Record<string, string>;
  sections: SnapshotSection[];
  comments: LibraryComment[];
  comment_reasons: Array<{ code: string; label: string }>;
};

export type LibraryReviewsPage = {
  filters: { state: string | null; q: string | null; faculty?: string | null };
  faculties?: Array<{ id: string; name: string }>;
  reviews: PaginationMeta & { data: LibraryReviewItem[] };
};

export const getLibraryReviews = (filters: { state?: string; q?: string; faculty?: string; page?: number } = {}) => {
  const query = new URLSearchParams();
  if (filters.state && filters.state !== 'all') query.set('state', filters.state);
  if (filters.faculty && filters.faculty !== 'all') query.set('faculty', filters.faculty);
  if (filters.q) query.set('q', filters.q);
  if (filters.page && filters.page > 1) query.set('page', String(filters.page));
  return api<LibraryReviewsPage>(`/library/reviews${query.size ? `?${query}` : ''}`);
};

export type LibraryHistoryPage = LibraryReviewsPage & { periods: Array<{ id: string; code: string }> };

export const getLibraryHistory = (filters: { state?: string; q?: string; faculty?: string; period?: string; mine?: boolean; page?: number } = {}) => {
  const query = new URLSearchParams();
  if (filters.state && filters.state !== 'all') query.set('state', filters.state);
  if (filters.q) query.set('q', filters.q);
  if (filters.faculty && filters.faculty !== 'all') query.set('faculty', filters.faculty);
  if (filters.period && filters.period !== 'all') query.set('period', filters.period);
  if (filters.mine) query.set('mine', '1');
  if (filters.page && filters.page > 1) query.set('page', String(filters.page));
  return api<LibraryHistoryPage>(`/library/history${query.size ? `?${query}` : ''}`);
};

export const getLibraryReview = (revisionId: string) =>
  api<{ review: LibraryReviewDetail }>(`/library/reviews/${revisionId}`);

export const commentLibraryReview = (revisionId: string, payload: { reasons: string[]; other?: string }) =>
  api<{ message: string }>(`/library/reviews/${revisionId}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const verifyLibraryReview = (revisionId: string, signature: SignaturePayload | null) =>
  api<{ message: string }>(`/library/reviews/${revisionId}/verify`, {
    method: 'POST',
    body: JSON.stringify({ signature }),
  });
