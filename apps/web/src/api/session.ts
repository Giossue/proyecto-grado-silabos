import { api } from '@/api/client';

export type RoleCode = 'administrador' | 'coordinador' | 'docente' | 'bibliotecario';

export type ActiveRole = {
  id: string;
  code: RoleCode;
  career_id: string | null;
  career_name: string | null;
};

export type AccessibilityPreferences = { high_contrast: boolean; text_size: string; no_motion: boolean; dyslexia?: boolean };

export type Session = {
  user: { id: string; name: string; email: string; email_verified: boolean; can_edit_identity: boolean; formation?: string | null; accessibility?: AccessibilityPreferences | null };
  active_role: ActiveRole | null;
  available_roles: ActiveRole[];
  institution?: { today: string; timezone: string };
};

export type TwoFactorStatus = { enabled: boolean; confirmation_required: boolean };
export type DeviceSession = { id: string; ip_address: string | null; device: string; last_activity: string; current: boolean };
export type LoginResult = Session | { two_factor_required: true; message: string };

export const getSession = () => api<Session>('/session');
export const login = (email: string, password: string): Promise<LoginResult> =>
  api<LoginResult>('/authentication/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
export const completeTwoFactorLogin = (code: string, recoveryCode: string): Promise<{ message: string }> =>
  api<{ message: string }>('/authentication/two-factor/challenge', {
    method: 'POST',
    body: JSON.stringify({ code: code || undefined, recovery_code: recoveryCode || undefined }),
  });
export const requestPasswordRecovery = (email: string): Promise<{ message: string }> =>
  api<{ message: string }>('/authentication/password-recovery', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
export const resetForgottenPassword = (email: string, token: string, password: string, passwordConfirmation: string): Promise<{ message: string }> =>
  api<{ message: string }>('/authentication/password-reset', {
    method: 'POST',
    body: JSON.stringify({ email, token, password, password_confirmation: passwordConfirmation }),
  });
export const activateAccount = (token: string, password: string, passwordConfirmation: string): Promise<{ message: string }> =>
  api<{ message: string }>('/authentication/account-activation', {
    method: 'POST',
    body: JSON.stringify({ token, password, password_confirmation: passwordConfirmation }),
  });
export const resendActivation = () => api<{ message: string }>('/authentication/account-activation/resend', { method: 'POST' });
export const getTwoFactorStatus = () => api<TwoFactorStatus>('/authentication/two-factor');
export const enableTwoFactor = (currentPassword: string) =>
  api<TwoFactorStatus & { qr_code_svg: string }>('/authentication/two-factor', { method: 'POST', body: JSON.stringify({ current_password: currentPassword }) });
export const confirmTwoFactor = (code: string) => api<TwoFactorStatus & { recovery_codes: string[] }>('/authentication/two-factor/confirm', { method: 'POST', body: JSON.stringify({ code }) });
export const disableTwoFactor = (currentPassword: string, code = '', recoveryCode = '') =>
  api<TwoFactorStatus>('/authentication/two-factor', {
    method: 'DELETE',
    body: JSON.stringify({ current_password: currentPassword, code: code || undefined, recovery_code: recoveryCode || undefined }),
  });
export const regenerateRecoveryCodes = (currentPassword: string) =>
  api<TwoFactorStatus & { recovery_codes: string[] }>('/authentication/two-factor/recovery-codes', {
    method: 'POST', body: JSON.stringify({ current_password: currentPassword }),
  });
export const getDeviceSessions = () => api<{ sessions: DeviceSession[] }>('/authentication/sessions');
export const closeDeviceSession = (sessionId: string) =>
  api<{ message: string }>(`/authentication/sessions/${sessionId}`, { method: 'DELETE' });
export const closeOtherDeviceSessions = (currentPassword: string) =>
  api<{ message: string; closed_sessions: number }>('/authentication/sessions/others', {
    method: 'DELETE', body: JSON.stringify({ current_password: currentPassword }),
  });
export const logout = () => api<void>('/authentication/logout', { method: 'POST' });
export const leaveActiveRole = () => api<Session>('/active-role', { method: 'DELETE' });
export const selectActiveRole = (roleAssignmentId: string) =>
  api<Session>('/active-role', { method: 'PUT', body: JSON.stringify({ role_assignment_id: roleAssignmentId }) });
export const updatePassword = (password: string, passwordConfirmation: string, currentPassword?: string) =>
  api<Session>('/authentication/password', {
    method: 'PUT',
    body: JSON.stringify({ password, password_confirmation: passwordConfirmation, current_password: currentPassword }),
  });
export const updateAccessibility = (preferences: AccessibilityPreferences) =>
  api<Session>('/authentication/accessibility', { method: 'PUT', body: JSON.stringify(preferences) });
export const updateFormation = (formation: string) =>
  api<Session>('/authentication/formation', {
    method: 'PUT',
    body: JSON.stringify({ formacion_experiencia: formation }),
  });
export const updateProfile = (name: string, email: string) =>
  api<Session>('/authentication/profile', {
    method: 'PUT',
    body: JSON.stringify({ nombre: name, correo_electronico: email }),
  });
