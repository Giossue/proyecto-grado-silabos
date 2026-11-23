import { ApiError } from '@/api/client';
import { downloadDocument, getDocuments } from '@/api/documents';

export const openPdfWindow = (): Window | null => {
  const width = Math.min(1100, Math.round(window.screen.availWidth * 0.8));
  const height = Math.min(900, Math.round(window.screen.availHeight * 0.85));
  const left = Math.round((window.screen.availWidth - width) / 2);
  const top = Math.round((window.screen.availHeight - height) / 2);

  const tab = window.open('', 'silabos-pdf', `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
  tab?.focus();

  return tab;
};

export const showInPdfWindow = (tab: Window | null, url: string): void => {
  if (tab) {
    tab.location.href = url;
    tab.focus();
  } else window.location.assign(url);
};

export const openRevisionPdf = async (revisionId: string): Promise<string | null> => {
  const tab = openPdfWindow();
  try {
    const { artifacts } = await getDocuments(revisionId);
    const latest = [...artifacts]
      .filter((artifact) => artifact.estado === 'completado' && artifact.files !== null)
      .sort((left, right) => new Date(right.requested_at).getTime() - new Date(left.requested_at).getTime())[0];
    if (!latest) {
      tab?.close();
      return 'El PDF aún no está listo';
    }
    const url = URL.createObjectURL(await downloadDocument(latest.id));
    showInPdfWindow(tab, url);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

    return null;
  } catch (reason) {
    tab?.close();

    return reason instanceof ApiError ? reason.message : 'No se pudo abrir el PDF';
  }
};
