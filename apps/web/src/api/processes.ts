import { api } from '@/api/client';

export type SyllabusProcess = {
  id: string;
  name: string;
  state: 'abierto' | 'pausado' | 'cerrado';
  template: string;
  period_id: string;
  period_name: string;
  starts_at: string;
  due_at: string;
  convocations_count: number;
  configurable: boolean;
  deletable: boolean;
  extensions_used: number;
  extensions_max: number;
  extension_limit_on: string;
  extension_block_reason: string | null;
};

export type Processes = {
  processes: SyllabusProcess[];
  template: string | null;
  periods: Array<{ id: string; codigo: string }>;
  active_process: { name: string; period: string; state: string } | null;
};

export type ProcessPayload = {
  period_id: string;
  starts_at: string;
  due_at: string;
};

export const getProcesses = () => api<Processes>('/admin/processes');

export const createProcess = (payload: ProcessPayload) =>
  api<{ message: string }>('/admin/processes', { method: 'POST', body: JSON.stringify(payload) });

export type SyllabusStateCounts = Record<string, number>;

export type ProcessImpact = {
  syllabi: SyllabusStateCounts;
  total: number;
};

export const getProcessImpact = (processId: string) =>
  api<ProcessImpact>(`/admin/processes/${processId}/impact`);

export const deleteProcess = (processId: string, payload: { mensaje: string }) =>
  api<{ message: string }>(`/admin/processes/${processId}`, { method: 'DELETE', body: JSON.stringify(payload) });

export type ProcessTransitionPayload = {
  confirmar_rehacer?: boolean;
  confirmar_cambios?: boolean;
};

export const transitionProcess = (
  processId: string,
  transition: 'pausar' | 'reanudar' | 'cerrar',
  payload?: ProcessTransitionPayload,
) => api<{ message: string }>(`/admin/processes/${processId}/${transition}`, {
  method: 'POST',
  ...(payload ? { body: JSON.stringify(payload) } : {}),
});

export type DeadlineExtensionPayload = {
  due_at: string;
  /** Reabrir un periodo académico finalizado cuya plantilla cambió: confirma que sus sílabos se adapten. */
  confirmar_rehacer?: boolean;
  confirmar_cambios?: boolean;
};

export type PendingChangeCounts = { to_draft: number; restarted: number; to_coordination: number };

export const extendProcessDeadline = (processId: string, payload: DeadlineExtensionPayload) =>
  api<{ message: string }>(`/admin/processes/${processId}/deadline`, { method: 'POST', body: JSON.stringify(payload) });
