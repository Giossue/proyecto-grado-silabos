import { api } from '@/api/client';

export type ConvocationState = 'sin_iniciar' | 'preparacion' | 'abierta' | 'pausada' | 'cerrada';

export type ConvocationDetail = {
  convocation: {
    id: string;
    name: string;
    state: ConvocationState;
    process: { name: string; state: string };
    period: string;
    template: string;
    start_date: string | null;
    draft_deadline: string | null;
    counts: { total: number; not_started: number; draft: number; in_review: number; approved: number };
    syllabi: Array<{ id: string; subject: string; code: string; state: string; stage?: string | null; revision_id?: string | null; returned_by?: string | null; iniciado_en: string | null; parallels: string[]; teachers: string[] }>;
  };
};

export const createConvocation = (processId: string) =>
  api<{ message: string; convocation_id: string }>('/coordination/convocations', { method: 'POST', body: JSON.stringify({ process_id: processId }) });

export const getConvocation = (convocationId: string) => api<ConvocationDetail>(`/coordination/convocations/${convocationId}`);

export const transitionConvocation = (convocationId: string, transition: 'pausar' | 'reanudar') =>
  api<{ message: string }>(`/coordination/convocations/${convocationId}/${transition}`, { method: 'POST' });
