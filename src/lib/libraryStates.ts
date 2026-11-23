import type { LibraryReviewItem } from '@/api/library';
import { SYLLABUS_STATE_LABELS } from '@/lib/syllabusStates';

type LibraryStatus = 'pendiente' | 'firmado' | 'devuelto' | 'reemplazado';
type Tone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

// Biblioteca usa las mismas palabras que el sílabo: un envío pendiente está «En revisión»,
// uno firmado queda «Aprobado» y uno devuelto es «Corrección solicitada».
const LABELS: Record<LibraryStatus, string> = {
  pendiente: SYLLABUS_STATE_LABELS.en_revision,
  firmado: SYLLABUS_STATE_LABELS.aprobado,
  devuelto: SYLLABUS_STATE_LABELS.correccion_solicitada,
  reemplazado: 'Anterior',
};
const TONES: Record<LibraryStatus, Tone> = { pendiente: 'warning', firmado: 'success', devuelto: 'danger', reemplazado: 'neutral' };

// Opciones del filtro de estado.
export const LIBRARY_STATE_FILTERS: Record<'pendiente' | 'firmado' | 'devuelto', string> = {
  pendiente: SYLLABUS_STATE_LABELS.en_revision,
  firmado: 'Aprobados',
  devuelto: SYLLABUS_STATE_LABELS.correccion_solicitada,
};

/** El estado visible: «En revisión» mientras está pendiente; después, cómo terminó. */
export const libraryStatus = (item: Pick<LibraryReviewItem, 'state' | 'outcome'>): LibraryStatus =>
  item.state === 'pendiente' || item.outcome === null ? 'pendiente' : item.outcome;

export const libraryStatusLabel = (status: string): string =>
  Object.hasOwn(LABELS, status) ? LABELS[status as LibraryStatus] : 'Estado no disponible';

export const libraryStatusTone = (status: string): Tone =>
  Object.hasOwn(TONES, status) ? TONES[status as LibraryStatus] : 'neutral';
