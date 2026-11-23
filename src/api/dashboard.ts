import { api } from '@/api/client';

export type DashboardMetric = {
  key: string;
  label: string;
  value: number;
  suffix: string | null;
  hint: string;
};

export type SetupStep = {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  action: string | null;
};

export type SetupChecklist = {
  title: string;
  intro: string;
  done: number;
  total: number;
  steps: SetupStep[];
};

export type DashboardDeadline = {
  period: string;
  starts_at: string;
  due_at: string;
  state: 'upcoming' | 'active' | 'paused' | 'overdue' | 'closed';
  days_until_start: number;
  days_until_due: number;
  convocation_id: string | null;
  /** Solo en pausa: Administración pausó la convocatoria institucional o Coordinación la de su carrera. */
  paused_by: 'administracion' | 'coordinacion' | null;
  /** Ya pasó el último día de clases del período. */
  classes_ended: boolean;
  /** Coordinación: la institucional sigue, pero la convocatoria de su carrera aún no se abre. */
  career_pending: boolean;
};

export type CoordinationConvocation = {
  process_id: string;
  period: string;
  convocation_id: string | null;
  can_open: boolean;
  state: 'abierta' | 'pausada' | 'cerrada' | null;
  process_open: boolean;
};

export type Dashboard = {
  metrics: DashboardMetric[];
  setup: SetupChecklist | null;
  deadline: DashboardDeadline | null;
  coordination_convocation: CoordinationConvocation | null;
};

export const getDashboard = () => api<Dashboard>('/dashboard');

export const getDeadline = () => api<{ deadline: DashboardDeadline | null }>('/dashboard/deadline');
