import { api } from '@/api/client';

export type EmailNoticeOption = { type: string; label: string; description: string; enabled: boolean };

export const getEmailPreferences = (): Promise<{ options: EmailNoticeOption[] }> =>
  api<{ options: EmailNoticeOption[] }>('/notifications/email-preferences');

export const updateEmailPreferences = (preferences: Record<string, boolean>): Promise<{ options: EmailNoticeOption[] }> =>
  api<{ options: EmailNoticeOption[] }>('/notifications/email-preferences', { method: 'PUT', body: JSON.stringify({ preferences }) });
