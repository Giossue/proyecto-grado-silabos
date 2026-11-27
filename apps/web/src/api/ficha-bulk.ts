import { jsonBody, withPurgeConfirmation, type SubjectProfileField } from "@/api/career-academics";
import { fichaBulkPath } from "@/api/careerScope";
import { api } from "@/api/client";
import { setTemplateRuntime } from "@/lib/blocks/runtime";
import type { TemplateDefinitionPayload } from "@silabos/shared/lib/blocks/types";
import type { DocumentNode } from "@silabos/shared/lib/templateDocument";

export type BulkField = SubjectProfileField & { filled_subjects: string[] };

export type BulkFields = {
  fields: BulkField[];
  definition?: TemplateDefinitionPayload;
  variables?: Record<string, string>;
  lock_reason?: string | null;
};

export type BulkFill = { field_id: string; value: DocumentNode; subjects: string[]; replace: string[] };

export const getBulkFields = () =>
  api<BulkFields>(fichaBulkPath()).then((response) => {
    setTemplateRuntime(response.definition, response.variables);
    return response;
  });

export const fillBulkField = (payload: BulkFill) =>
  withPurgeConfirmation((confirmPurge) =>
    api<{ message: string; applied: number; skipped: number }>(fichaBulkPath(), { method: "POST", body: jsonBody(payload, confirmPurge) }),
  );
