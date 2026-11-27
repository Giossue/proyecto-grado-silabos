import type { ResponseCondition } from '@/lib/responseConditions';
import type { SyllabusDetail } from '@/api/syllabi';
import { setTemplateRuntime } from '@/lib/blocks/runtime';
import type { BlockDefinition, TemplateDefinitionPayload } from '@silabos/shared/lib/blocks/types';
import type { LockDetail } from '@/api/locks';
import type { DocumentLayout, DocumentLayoutOptions, DocumentStyleDraft } from '@/lib/documentLayout';
import { api } from '@/api/client';
import type { DocumentNode, TemplateVariable } from '@silabos/shared/lib/templateDocument';
import type { FieldResponsible } from '@/types/configuration';

export type TemplateField = { id: string; key: string; label: string; quien_llena: FieldResponsible; teacher_only?: boolean; content: DocumentNode; show_if?: ResponseCondition | null; max_length?: number | null };
export type TemplateAppearance = { font_family: string; body_font_size: number; title_font_size: number; section_font_size: number; field_font_size: number; text_color: string; accent_color: string; table_header_background: string; table_header_color: string; margin_cm: number; orientation: string; title_bold: boolean; title_italic: boolean; title_alignment: string; section_bold: boolean; section_italic: boolean; section_alignment: string; body_alignment: string };

export type TemplateSectionPayload = { id: string; key: string; title: string; orientation: 'portrait' | 'landscape'; fields: TemplateField[] };
export type RepeatableTableCellType = 'text' | 'choice' | 'number';
export type RepeatableTableColumn = { key?: string; title: string; type: RepeatableTableCellType; max_length?: number; multiline?: boolean; options?: Array<{ value?: string; label: string }>; maximum?: number; decimals?: number; width: number | null; required: boolean };
export type RepeatableTableDesign = { kind: string; label: string; list: string; item: string; min: number; max: number; initial: number; band: string | null; columns: RepeatableTableColumn[]; extras?: Record<string, unknown> };
export type BlockDesignState = { design: RepeatableTableDesign | null; reason: string | null };
export type DesignedTable = { kind: string; definition: BlockDefinition; design: RepeatableTableDesign; initial: Record<string, unknown> };
export type TemplatePayload = { processLock: string | null; blockDesigns?: Record<string, BlockDesignState>; processLockDetail?: LockDetail | null; templateChangedDuringPause?: boolean; variables?: TemplateVariable[]; presets?: TemplatePreset[]; definition?: TemplateDefinitionPayload; template: null | { id: string; name: string; description: string | null; titleBlock: { text: string }; layout?: DocumentLayout; layoutOptions?: DocumentLayoutOptions; sections: TemplateSectionPayload[] }; logos?: { institution: string; faculty: string; institution_size: { width: number; height: number }; faculty_size: { width: number; height: number } } };
export type TemplatePreset = { key: string; field_key: string; label: string; quien_llena: FieldResponsible; teacher_only?: boolean; content: DocumentNode };
/** El formulario que verá el docente con la plantilla guardada (datos de muestra; nada se guarda). */
export const getTemplateTeacherPreview = (templateId: string) =>
    api<{ sections: SyllabusDetail['sections'] }>(`/admin/template/${templateId}/teacher-preview`);

export const getTemplate = () => api<TemplatePayload>('/admin/template').then((payload) => {
    setTemplateRuntime(payload.definition, Object.fromEntries((payload.variables ?? []).map((variable) => [variable.key, ''])));

    return payload;
});
export const createTemplate = () => api<{ message: string; template_id: string }>('/admin/template', { method: 'POST', body: JSON.stringify({}) });
export const getTemplateJson = (id: string) => api<unknown>(`/admin/template/${id}/json`);
export const importTemplateJson = (id: string, body: unknown) => api<{ message: string }>(`/admin/template/${id}/json`, { method: 'PUT', body: JSON.stringify(body) });
export const uploadTemplateLogo = (id: string, file: File) => {
  const body = new FormData();
  body.append('logo', file);
  return api<{ message: string; logo: string }>(`/admin/template/${id}/logo`, { method: 'POST', body });
};
export const clearTemplate = (id: string) => api<{ message: string }>(`/admin/template/${id}/structure`, { method: 'DELETE' });
export const formatTemplate = (id: string) => api<{ message: string }>(`/admin/template/${id}/format`, { method: 'POST', body: JSON.stringify({}) });

export type TemplateDraftPayload = { version: 1; title: string; layout: DocumentLayout; document?: DocumentStyleDraft; teacher_fields: string[]; sections: Array<{ key: string; title: string; orientation: 'portrait' | 'landscape'; fields: Array<{ key: string; label: string; quien_llena: FieldResponsible; content: DocumentNode; show_if?: ResponseCondition | null; max_length?: number | null }> }>; block_changes?: Record<string, BlockDefinition> };
export const designRepeatableTable = (templateId: string, body: RepeatableTableDesign & { new?: boolean }) =>
    api<DesignedTable>(`/admin/template/${templateId}/blocks/design`, { method: 'POST', body: JSON.stringify(body) });
export type TemplateDraftImpactCounts = { in_progress: number; keep: number; lose: number; back_to_draft: number };
export type TemplateDraftImpact = TemplateDraftImpactCounts & { affected: boolean; counted?: boolean; message?: string; careers: Array<TemplateDraftImpactCounts & { name: string }> };
export type TemplateDraftProblem = { path: string; message: string; blocking: boolean };
export type TemplateDraftCheck = { problems: TemplateDraftProblem[] };
export const previewTemplateDraft = (templateId: string, body: TemplateDraftPayload) =>
    api<{ sections: SyllabusDetail['sections']; sheets: TemplateSectionPayload[] }>(`/admin/template/${templateId}/draft/preview`, { method: 'POST', body: JSON.stringify(body) });
export const getTemplateDraftImpact = (templateId: string, body: TemplateDraftPayload) =>
    api<TemplateDraftImpact>(`/admin/template/${templateId}/draft/impact`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
export const checkTemplateDraft = (templateId: string, body: TemplateDraftPayload) =>
    api<TemplateDraftCheck>(`/admin/template/${templateId}/draft/check`, { method: 'POST', body: JSON.stringify(body) });
