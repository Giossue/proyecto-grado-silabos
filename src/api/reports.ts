import { api, apiBlob } from '@/api/client';

export type ReportState = 'sin_iniciar' | 'borrador' | 'en_revision' | 'correccion_solicitada' | 'aprobado';

export type ProcessReport = {
  process: { id: string; period: string | null; starts_at: string; due_at: string; state: string };
  kpis: { total: number; approved_percent: number; on_time_percent: number | null; review_days: number | null };
  careers: Array<{
    career: string;
    total: number;
    states: Record<ReportState, number>;
    returns: { coordinacion: number; biblioteca: number };
    late: number;
    approved: number;
    pending: number;
    returned: number;
    progress: number;
  }>;
  daily: Array<{ day: string; first: number; resubmitted: number }>;
  pending: Array<{ teachers: string; career: string; subject: string; parallel: string; state: ReportState; late: boolean }>;
};

export type ReportPayload = { options: Array<{ value: string; label: string }>; report: ProcessReport | null };

const query = (processId: string | null): string => (processId ? `?process=${encodeURIComponent(processId)}` : '');

export const getProcessReport = (processId: string | null) => api<ReportPayload>(`/admin/reports${query(processId)}`);

export const downloadProcessReport = async (processId: string | null, filename: string): Promise<void> => {
  const url = URL.createObjectURL(await apiBlob(`/admin/reports/export${query(processId)}`));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
