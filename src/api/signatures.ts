export type SignatureRole = 'docente' | 'coordinacion' | 'biblioteca';

export type SignaturePayload = { statement: string; cms: string };

export type SignatureSummary = { role: SignatureRole; name: string; signed_at: string };

export const SIGNATURE_ROLE_LABELS: Record<SignatureRole, string> = {
  docente: 'Docente',
  coordinacion: 'Coordinación',
  biblioteca: 'Biblioteca',
};
