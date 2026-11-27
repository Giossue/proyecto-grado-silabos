import { api } from '@/api/client';

export type SettingSource = 'pantalla' | 'entorno';
type Field<T> = { value: T; source: SettingSource };

export type SystemSettings = {
  notifications: { emails: Field<boolean | null>; digest_time: Field<string | null> };
  library: { driver: Field<string | null>; base_url: Field<string | null> };
  teacher_assistant: { enabled: Field<boolean | null> };
};

export type SettingsSection = 'notificaciones' | 'biblioteca' | 'asistente-docente';
export type ConnectionSection = Extract<SettingsSection, 'biblioteca'>;

export const getSystemSettings = (): Promise<SystemSettings> => api<SystemSettings>('/admin/system-settings');

export const updateSystemSettings = (section: SettingsSection, body: Record<string, unknown>): Promise<SystemSettings> =>
  api<SystemSettings>(`/admin/system-settings/${section}`, { method: 'PUT', body: JSON.stringify(body) });

export const testSystemConnection = (section: ConnectionSection): Promise<{ ok: boolean; message: string }> =>
  api<{ ok: boolean; message: string }>(`/admin/system-settings/${section}/test`, { method: 'POST' });
