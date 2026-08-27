<script setup lang="ts">
import { Form, Head, Link } from '@inertiajs/vue3';
import AcademicSourceController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/AcademicSourceController';
import AcademicSourceFragmentSheet from '@/components/domain/configuration/AcademicSourceFragmentSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { index as sourcesIndex, show as sourceShow } from '@/routes/sources';

defineProps<{
    source: {
        id: string;
        name: string;
        type: string;
        authority: string;
        responsible: string;
        description: string | null;
        career_name: string;
        versions: { id: string; number: number; state: string }[];
    };
    selectedVersion: {
        id: string;
        number: number;
        state: string;
        valid_from: string | null;
        valid_until: string | null;
        fingerprint: string | null;
        fragments: {
            id: string;
            key: string;
            title: string;
            content: string | null;
            data_key: string | null;
            structured_value: unknown;
            fingerprint: string;
        }[];
        conflicts: {
            id: string;
            data_key: string;
            state: string;
            decision: string | null;
            active_source_name: string;
        }[];
    };
}>();

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Fuentes académicas', href: sourcesIndex() }],
    },
});
</script>

<template>
    <Head :title="source.name" />

    <PageFrame
        :title="source.name"
        :description="`${source.authority} · ${source.career_name}`"
    >
        <template #eyebrow>
            <Button as-child variant="link" class="h-auto px-0">
                <Link :href="sourcesIndex()">← Volver a fuentes</Link>
            </Button>
        </template>
        <template #meta>
            <Badge variant="outline">{{ source.type }}</Badge>
        </template>
        <template #actions>
            <AcademicSourceFragmentSheet
                v-if="selectedVersion.state === 'draft'"
                :source-version-id="selectedVersion.id"
            />
            <Form
                v-if="selectedVersion.state === 'draft'"
                v-bind="
                    AcademicSourceController.activate.form(selectedVersion.id)
                "
                v-slot="{ errors, processing }"
            >
                <FieldError :errors="[errors.version]" />
                <Button type="submit" :disabled="processing">
                    <Spinner v-if="processing" />
                    Activar versión
                </Button>
            </Form>
            <Form
                v-else
                v-bind="AcademicSourceController.clone.form(selectedVersion.id)"
                v-slot="{ processing }"
            >
                <Button type="submit" variant="outline" :disabled="processing">
                    <Spinner v-if="processing" />
                    Crear nueva versión
                </Button>
            </Form>
        </template>

        <div class="flex flex-wrap gap-2">
            <Button
                v-for="version in source.versions"
                :key="version.id"
                as-child
                size="sm"
                :variant="
                    version.id === selectedVersion.id ? 'secondary' : 'outline'
                "
            >
                <Link
                    :href="
                        sourceShow(source.id, {
                            query: { version: version.id },
                        })
                    "
                >
                    v{{ version.number }} ·
                    {{
                        version.state === 'active'
                            ? 'Activa'
                            : version.state === 'draft'
                              ? 'Borrador'
                              : 'Reemplazada'
                    }}
                </Link>
            </Button>
        </div>

        <Alert v-if="selectedVersion.state !== 'draft'">
            <AlertTitle>Versión inmutable</AlertTitle>
            <AlertDescription>
                Los fragmentos y su vigencia ya no se modifican. Huella SHA-256:
                {{ selectedVersion.fingerprint }}
            </AlertDescription>
        </Alert>

        <div class="flex flex-col gap-4">
            <Card>
                <CardHeader>
                    <CardTitle>Fragmentos de evidencia</CardTitle>
                    <CardDescription>
                        Cada fragmento conserva fuente, versión y huella para
                        citarse con precisión.
                    </CardDescription>
                </CardHeader>
                <CardContent class="flex flex-col gap-3">
                    <p
                        v-if="selectedVersion.fragments.length === 0"
                        class="text-sm text-muted-foreground"
                    >
                        Todavía no hay fragmentos.
                    </p>
                    <article
                        v-for="fragment in selectedVersion.fragments"
                        v-else
                        :key="fragment.id"
                        class="rounded-lg border p-4"
                    >
                        <div class="flex flex-wrap items-center gap-2">
                            <h3 class="font-medium">{{ fragment.title }}</h3>
                            <Badge v-if="fragment.data_key" variant="outline">
                                {{ fragment.data_key }}
                            </Badge>
                        </div>
                        <p
                            v-if="fragment.content"
                            class="mt-2 text-sm whitespace-pre-wrap"
                        >
                            {{ fragment.content }}
                        </p>
                        <pre
                            v-if="fragment.structured_value"
                            class="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs"
                            >{{
                                JSON.stringify(
                                    fragment.structured_value,
                                    null,
                                    2,
                                )
                            }}</pre>
                        <p class="mt-2 text-xs break-all text-muted-foreground">
                            Huella: {{ fragment.fingerprint }}
                        </p>
                    </article>
                </CardContent>
            </Card>

            <Card v-if="selectedVersion.conflicts.length > 0">
                <CardHeader>
                    <CardTitle>Contradicciones exactas</CardTitle>
                    <CardDescription>
                        Una persona decide y justifica; el sistema no aplica
                        precedencia automática.
                    </CardDescription>
                </CardHeader>
                <CardContent class="flex flex-col gap-4">
                    <div
                        v-for="conflict in selectedVersion.conflicts"
                        :key="conflict.id"
                        class="rounded-lg border border-destructive/40 p-4"
                    >
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="font-medium">
                                {{ conflict.data_key }}
                            </span>
                            <Badge variant="outline">
                                Fuente activa:
                                {{ conflict.active_source_name }}
                            </Badge>
                            <Badge
                                :variant="
                                    conflict.state === 'resolved'
                                        ? 'secondary'
                                        : 'outline'
                                "
                            >
                                {{
                                    conflict.state === 'resolved'
                                        ? 'Resuelto'
                                        : 'Pendiente'
                                }}
                            </Badge>
                        </div>

                        <Form
                            v-if="conflict.state === 'pending'"
                            v-bind="
                                AcademicSourceController.resolveConflict.form(
                                    conflict.id,
                                )
                            "
                            v-slot="{ errors, processing }"
                            class="mt-4"
                        >
                            <FieldGroup>
                                <Field :data-invalid="Boolean(errors.decision)">
                                    <FieldLabel
                                        :for="
                                            'source-conflict-decision-' +
                                            conflict.id
                                        "
                                    >
                                        Decisión
                                    </FieldLabel>
                                    <Select name="decision">
                                        <SelectTrigger
                                            :id="
                                                'source-conflict-decision-' +
                                                conflict.id
                                            "
                                            :aria-invalid="
                                                Boolean(errors.decision)
                                            "
                                        >
                                            <SelectValue
                                                placeholder="Seleccione"
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectItem value="candidate">
                                                    Conservar valor candidato
                                                </SelectItem>
                                                <SelectItem value="active">
                                                    Conservar valor activo
                                                </SelectItem>
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                    <FieldError :errors="[errors.decision]" />
                                </Field>

                                <Field
                                    :data-invalid="
                                        Boolean(errors.justification)
                                    "
                                >
                                    <FieldLabel
                                        :for="
                                            'source-conflict-justification-' +
                                            conflict.id
                                        "
                                    >
                                        Justificación académica
                                    </FieldLabel>
                                    <Textarea
                                        :id="
                                            'source-conflict-justification-' +
                                            conflict.id
                                        "
                                        name="justification"
                                        required
                                        :aria-invalid="
                                            Boolean(errors.justification)
                                        "
                                    />
                                    <FieldError
                                        :errors="[errors.justification]"
                                    />
                                </Field>

                                <Field orientation="horizontal">
                                    <Button
                                        type="submit"
                                        :disabled="processing"
                                    >
                                        <Spinner v-if="processing" />
                                        Registrar resolución
                                    </Button>
                                </Field>
                            </FieldGroup>
                        </Form>
                        <p v-else class="mt-2 text-sm text-muted-foreground">
                            Decisión:
                            {{
                                conflict.decision === 'candidate'
                                    ? 'valor candidato'
                                    : 'valor previamente activo'
                            }}.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    </PageFrame>
</template>
