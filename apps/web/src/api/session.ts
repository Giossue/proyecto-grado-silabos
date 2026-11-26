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
  user: { id: string; name: string; email: string; email_verified: boolean; can_edit_identity: boolean; accessibility?: AccessibilityPreferences | null };
  active_role: ActiveRole | null;
  available_roles: ActiveRole[];
  institution?: { today: string; timezone: string };
};


export const getSession = () => api<Session>('/session');
export const login = (email: string, password: string): Promise<Session> =>
  api<Session>('/authentication/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
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
export type LogoutResult = { logout_url: string } | undefined;
export type AuthProviders = { keycloak: boolean };

export const logout = () => api<LogoutResult>('/authentication/logout', { method: 'POST' });
export const getAuthProviders = () => api<AuthProviders>('/authentication/providers');
export const leaveActiveRole = () => api<Session>('/active-role', { method: 'DELETE' });
export const selectActiveRole = (roleAssignmentId: string) =>
  api<Session>('/active-role', { method: 'PUT', body: JSON.stringify({ role_assignment_id: roleAssignmentId }) });
export const updateAccessibility = (preferences: AccessibilityPreferences) =>
  api<Session>('/authentication/accessibility', { method: 'PUT', body: JSON.stringify(preferences) });
export const updateProfile = (name: string, email: string) =>
  api<Session>('/authentication/profile', {
    method: 'PUT',
    body: JSON.stringify({ nombre: name, correo_electronico: email }),
  });
