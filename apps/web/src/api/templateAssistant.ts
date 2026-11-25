import type { ResponseCondition } from '@/lib/responseConditions';
import type { BlockDefinition } from '@silabos/shared/lib/blocks/types';
import { api } from '@/api/client';
import type { DocumentNode } from '@silabos/shared/lib/templateDocument';
import type { FieldResponsible } from '@/types/configuration';

export type TemplateProposalStatus = 'pendiente' | 'aplicada' | 'descartada' | 'vencida' | 'reemplazada';

export type TemplateAssistantMessage = {
    id: string;
    role: 'usuario' | 'asistente';
    status: 'pendiente' | 'en_ejecucion' | 'completado' | 'fallido';
    result: 'propuesta' | 'respuesta' | 'pregunta' | 'fallido' | null;
    content: string;
    error: string | null;
    created_at: string;
    proposal: { id: string; status: TemplateProposalStatus; changes: string[]; draft_version: string } | null;
};

export type TemplateAssistantChat = {
    available: boolean;
    locked: boolean;
    suggestions: string[];
    messages: TemplateAssistantMessage[];
};

export type TemplateAssistantDraft = {
    sections: Array<{
        key: string;
        title: string;
        orientation: 'portrait' | 'landscape';
        fields: Array<{ key: string; label: string; quien_llena: FieldResponsible; content: DocumentNode; show_if?: ResponseCondition | null; max_length?: number | null }>;
    }>;
    version: string;
};

export type TemplateAssistantProposal = {
    id: string;
    status: TemplateProposalStatus;
    draft_version: string;
    changes: string[];
    changed: { sections: string[]; fields: string[] };
    sections: Array<{
        key: string;
        title: string;
        orientation: 'portrait' | 'landscape';
        fields: Array<{ key: string; label: string; quien_llena: FieldResponsible; content: DocumentNode; show_if?: ResponseCondition | null; max_length?: number | null }>;
    }>;
    block_changes?: Record<string, BlockDefinition>;
};

export const getTemplateAssistant = () => api<TemplateAssistantChat>('/admin/template/assistant');
export const sendTemplateAssistantMessage = (message: string, draft: TemplateAssistantDraft, idempotencyKey: string = crypto.randomUUID()) =>
    api<{ message: string; assistant_message_id: string }>('/admin/template/assistant/messages', {
        method: 'POST',
        body: JSON.stringify({ message, idempotency_key: idempotencyKey, draft: draft.sections, draft_version: draft.version }),
    });
export const clearTemplateAssistant = () => api<{ message: string }>('/admin/template/assistant', { method: 'DELETE' });
export const getTemplateAssistantProposal = (id: string) => api<TemplateAssistantProposal>(`/admin/template/assistant/proposals/${id}`);
export const applyTemplateAssistantProposal = (id: string) =>
    api<{ message: string }>(`/admin/template/assistant/proposals/${id}/apply`, { method: 'POST', body: JSON.stringify({}) });
export const discardTemplateAssistantProposal = (id: string) =>
    api<{ message: string }>(`/admin/template/assistant/proposals/${id}/discard`, { method: 'POST', body: JSON.stringify({}) });

