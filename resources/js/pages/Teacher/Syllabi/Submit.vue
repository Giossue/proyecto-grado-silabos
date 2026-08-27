<script setup lang="ts">
import { Form, Head, Link } from '@inertiajs/vue3';
import { FileCheck2, LockKeyhole, Send } from '@lucide/vue';
import SyllabusController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/SyllabusController';
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
import { FieldError } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { index as syllabiIndex } from '@/routes/syllabi';

type SyllabusForSubmission = {
    id: string;
    subject: string;
    code: string;
    convocation: string;
    period: string;
    state: string;
    lock_version: number;
    completion: number;
    sections: { id: string; title: string }[];
    validation: {
        completed_at: string;
        rule_version: string;
        blocking_errors: number;
        warnings: number;
    } | null;
    observations: {
        id: string;
        requested: boolean;
        state: string;
        response: { fixed: boolean } | null;
    }[];
    revisions: { id: string; number: number }[];
};

const props = defineProps<{ syllabus: SyllabusForSubmission }>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Mis sílabos', href: syllabiIndex() }] },
});

const idempotencyKey = crypto.randomUUID();
const unanswered = props.syllabus.observations.filter(
    (observation) =>
        observation.requested &&
        observation.state !== 'verified' &&
        observation.response === null,
).length;
const nextRevision = props.syllabus.revisions.length + 1;
</script>

<template>
    <Head :title="`Enviar ${syllabus.subject}`" />
    <PageFrame
        title="Confirmar envío"
        :description="`${syllabus.subject} · ${syllabus.code} · ${syllabus.period}`"
        size="narrow"
    >
        <template #eyebrow>
            <Button as-child variant="link" class="h-auto px-0">
                <Link :href="SyllabusController.edit(syllabus.id)">
                    ← Volver a la edición
                </Link>
            </Button>
        </template>
        <template #meta>
            <Badge variant="secondary">Revisión {{ nextRevision }}</Badge>
        </template>

        <Alert>
            <LockKeyhole aria-hidden="true" />
            <AlertTitle>El envío crea evidencia inmutable</AlertTitle>
            <AlertDescription>
                Se ejecutará nuevamente la validación determinística y se
                guardará una fotografía exacta del contenido. Esa revisión no
                podrá editarse; una corrección posterior producirá otra
                revisión.
            </AlertDescription>
        </Alert>

        <div class="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Contenido que se fijará</CardTitle>
                    <CardDescription>
                        Revise el alcance antes de continuar.
                    </CardDescription>
                </CardHeader>
                <CardContent class="space-y-3 text-sm">
                    <div class="flex justify-between gap-4">
                        <span class="text-muted-foreground">Completitud</span>
                        <strong>{{ syllabus.completion }} %</strong>
                    </div>
                    <div class="flex justify-between gap-4">
                        <span class="text-muted-foreground">Secciones</span>
                        <strong>{{ syllabus.sections.length }}</strong>
                    </div>
                    <div class="flex justify-between gap-4">
                        <span class="text-muted-foreground">Tipo de envío</span>
                        <strong>
                            {{
                                syllabus.state === 'correction_requested'
                                    ? 'Reenvío de corrección'
                                    : 'Primer envío'
                            }}
                        </strong>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Comprobaciones</CardTitle>
                    <CardDescription>
                        Las sugerencias de IA no forman parte de estos bloqueos.
                    </CardDescription>
                </CardHeader>
                <CardContent class="space-y-3 text-sm">
                    <p>
                        Última validación:
                        <strong>
                            {{
                                syllabus.validation
                                    ? `${syllabus.validation.blocking_errors} error(es)`
                                    : 'se ejecutará al enviar'
                            }}
                        </strong>
                    </p>
                    <p>
                        Observaciones solicitadas sin respuesta:
                        <strong>{{ unanswered }}</strong>
                    </p>
                    <p class="text-muted-foreground">
                        Si otra sesión guardó cambios, el sistema detendrá el
                        envío y pedirá recargar el expediente.
                    </p>
                </CardContent>
            </Card>
        </div>

        <Form
            v-bind="SyllabusController.submit.form(syllabus.id)"
            :options="{ preserveScroll: true }"
            class="flex flex-col items-stretch gap-3 sm:items-end"
            v-slot="{ errors, processing }"
        >
            <input
                type="hidden"
                name="lock_version"
                :value="syllabus.lock_version"
            />
            <input
                type="hidden"
                name="idempotency_key"
                :value="idempotencyKey"
            />
            <FieldError
                :errors="
                    [
                        errors.validation,
                        errors.syllabus,
                        errors.lock_version,
                    ].filter(Boolean)
                "
            />
            <div class="flex flex-col-reverse gap-3 sm:flex-row">
                <Button as-child variant="outline">
                    <Link :href="SyllabusController.edit(syllabus.id)">
                        Seguir editando
                    </Link>
                </Button>
                <Button type="submit" :disabled="processing || unanswered > 0">
                    <Spinner v-if="processing" />
                    <Send v-else aria-hidden="true" />
                    Crear revisión {{ nextRevision }} y enviar
                </Button>
            </div>
        </Form>

        <Alert v-if="unanswered > 0" variant="destructive">
            <FileCheck2 aria-hidden="true" />
            <AlertTitle>Faltan respuestas de corrección</AlertTitle>
            <AlertDescription>
                Responda las observaciones seleccionadas antes de reenviar.
            </AlertDescription>
        </Alert>
    </PageFrame>
</template>
