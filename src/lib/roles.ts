import type { ActiveRole, RoleCode } from '@/api/session';

const labels: Record<RoleCode, string> = {
  administrador: 'Administrador',
  coordinador: 'Coordinador',
  docente: 'Docente',
  bibliotecario: 'Bibliotecario',
};

export const LIBRARY_SCOPE = 'Biblioteca · toda la universidad';

export const roleLabel = (code: string): string =>
  Object.hasOwn(labels, code) ? labels[code as RoleCode] : code;

export const roleNeedsCareer = (code: string): boolean =>
  code === 'coordinador' || code === 'docente';

export const scopeTitle = (role: Pick<ActiveRole, 'code' | 'career_name'>): string => {
  if (role.code === 'bibliotecario') return LIBRARY_SCOPE;
  if (role.code === 'docente' && role.career_name) return `Docente · ${role.career_name}`;
  return role.career_name ?? roleLabel(role.code);
};
