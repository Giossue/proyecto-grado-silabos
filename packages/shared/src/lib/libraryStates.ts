import { SYLLABUS_STATE_LABELS, type SyllabusState } from './syllabusStates';

export type LibraryReviewState = 'pendiente' | 'atendido';

export type LibraryReviewOutcome = 'firmado' | 'devuelto' | 'reemplazado';

type LibraryStatus = SyllabusState | 'reemplazado';
type Tone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

// Biblioteca muestra el mismo estado que el sílabo: «Aprobado» solo cuando lo aprueba Coordinación.
const LABELS: Record<LibraryStatus, string> = { ...SYLLABUS_STATE_LABELS, reemplazado: 'Anterior' };
const TONES: Record<LibraryStatus, Tone> = {
  sin_iniciar: 'neutral',
  borrador: 'neutral',
  en_revision: 'warning',
  correccion_solicitada: 'danger',
  aprobado: 'success',
  reemplazado: 'neutral',
};

// Opciones del filtro de estado.
export const LIBRARY_STATE_FILTERS: Record<'pendiente' | 'firmado' | 'devuelto', string> = {
  pendiente: SYLLABUS_STATE_LABELS.en_revision,
  firmado: 'Aprobados',
  devuelto: SYLLABUS_STATE_LABELS.correccion_solicitada,
};

type LibraryItem = { outcome: LibraryReviewOutcome | null; syllabus_state: string };

/** El estado visible: el del sílabo; un envío reemplazado por otro queda «Anterior». */
export const libraryStatus = (item: LibraryItem): string => (item.outcome === 'reemplazado' ? 'reemplazado' : item.syllabus_state);

/** Mientras está en revisión, quién lo tiene: Biblioteca o, ya firmada la bibliografía, Coordinación. */
export const libraryStage = (item: LibraryItem): string | null => {
  if (libraryStatus(item) !== 'en_revision') return null;
  return item.outcome === 'firmado' ? 'En coordinación' : 'En biblioteca';
};

export const libraryStatusLabel = (status: string): string =>
  Object.hasOwn(LABELS, status) ? LABELS[status as LibraryStatus] : 'Estado no disponible';

export const libraryStatusTone = (status: string): Tone =>
  Object.hasOwn(TONES, status) ? TONES[status as LibraryStatus] : 'neutral';
