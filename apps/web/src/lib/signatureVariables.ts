export const SIGNATURE_PREFIX = 'firma_';

export const SIGNATURE_VARIABLES = ['firma_docente', 'firma_coordinador', 'firma_bibliotecario'] as const;

const FALLBACK_LABELS: Record<string, string> = {
  firma_docente: 'Firma del docente',
  firma_coordinador: 'Firma de coordinación',
  firma_bibliotecario: 'Firma de biblioteca',
};

export const isSignatureVariable = (id: string): boolean => id.startsWith(SIGNATURE_PREFIX);

export const signatureLabel = (id: string, value?: string | null): string => {
  const lines = (value ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? FALLBACK_LABELS[id] ?? '';
};
