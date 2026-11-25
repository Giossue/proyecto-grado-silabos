import { jsonBody, withPurgeConfirmation } from '@/api/career-academics';
import { api } from '@/api/client';
import type { RoleCode } from '@/api/session';

export type ManagedUser = {
  id: string;
  nombre: string;
  correo_electronico: string;
  active: boolean;
  pending_activation: boolean;
  /** Pendiente y sin invitación vigente: se puede reenviar. */
  invitation_expired: boolean;
  two_factor_enabled: boolean;
  roles: Array<{ id: string; code: RoleCode; name: string; career_name: string | null }>;
  careers: Array<string | null>;
  assignments: Array<{ id: string; role_name: string; career_name: string | null; active: boolean }>;
};

export type ManagedUsersResponse = {
  users: { data: ManagedUser[]; current_page: number; last_page: number; per_page: number; from: number | null; to: number | null; total: number };
  filters: { q: string | null; status: string | null; role: string | null; career: string | null };
  roles: Array<{ codigo: RoleCode; nombre: string }>;
  careers: Array<{ id: string; nombre: string }>;
};

export const getManagedUsers = (filters: { q?: string; status?: string; role?: string; career?: string; sort?: string; dir?: string; page?: number } = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value && value !== 'all') query.set(key, String(value));
  return api<ManagedUsersResponse>(`/admin/users${query.size ? `?${query}` : ''}`);
};

export const createManagedUser = (payload: { nombres: string; apellidos: string; correo_electronico: string; role_code: string; career_id: string | null; replace_coordinator?: boolean }) =>
  withPurgeConfirmation((confirm) => api<{ message: string }>('/admin/users', { method: 'POST', body: jsonBody(payload, confirm) }));
export const resendManagedUserInvitation = (userId: string) =>
  api<{ message: string }>(`/admin/users/${userId}/resend-activation`, { method: 'POST' });
export const removeManagedUserRole = (userId: string, assignmentId: string) => api<{ message: string }>(`/admin/users/${userId}/roles/${assignmentId}`, { method: 'DELETE' });
export const deleteManagedUser = (userId: string) => api<{ message: string }>(`/admin/users/${userId}`, { method: 'DELETE' });
export const updateManagedUser = (userId: string, payload: { nombre: string; correo_electronico: string; active?: boolean; role_code?: string; career_id?: string | null; replace_coordinator?: boolean }) =>
  withPurgeConfirmation((confirm) => api<{ message: string }>(`/admin/users/${userId}`, { method: 'PATCH', body: jsonBody(payload, confirm) }));
