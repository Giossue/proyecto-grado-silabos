import { api, apiBlob } from '@/api/client';
const queryString = (filters: Record<string, string>) => { const query = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); }); return query.size ? `?${query}` : ''; };
export type AuditPayload = { filters: Record<string, string>; action_options: Array<{ value: string; label: string }>; period_options: Array<{ value: string; label: string }>; role_options: Array<{ value: string; label: string }>; career_options: Array<{ value: string; label: string }>; events: { data: Array<{ id: string; action: string; resource: string; target?: string; result: string; actor: string; role: string | null; career: string | null; details: Array<{ label: string; value: string | number | boolean }>; occurred_at: string }>; current_page: number; last_page: number; per_page: number; from: number | null; to: number | null; total: number } };
export const getAuditEvents = (filters: Record<string, string>) => api<AuditPayload>(`/admin/audit-events${queryString(filters)}`);
/** Excel con los eventos de los filtros elegidos (hojas «Eventos» y «Resumen»). */
export const downloadAuditWorkbook = async (filters: Record<string, string>, filename: string): Promise<void> => {
  const url = URL.createObjectURL(await apiBlob(`/admin/audit-events/export${queryString(filters)}`));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
