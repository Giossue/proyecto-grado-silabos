import { sessionState } from '@/state/session';

const key = (): string => `silabos:biblioteca:facultad:${sessionState.current.value?.user.id ?? ''}`;

export const savedLibraryFaculty = (): string => {
  try { return localStorage.getItem(key()) ?? ''; } catch { return ''; }
};

export const rememberLibraryFaculty = (faculty: string): void => {
  try {
    if (faculty === 'all') localStorage.removeItem(key());
    else localStorage.setItem(key(), faculty);
  } catch { return; }
};
