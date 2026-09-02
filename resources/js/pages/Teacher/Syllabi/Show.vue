<script setup lang="ts">
import { Form, Head, Link } from '@inertiajs/vue3';
import { FilePenLine, History, Send, ShieldCheck } from '@lucide/vue';
import ReviewController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ReviewController';
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
import { Spinner } from '@/components/ui/spinner';
import { show as documentsShow } from '@/routes/documents';
import { index as syllabiIndex } from '@/routes/syllabi';

type Observation = {
    id: string;
    revision_number: number;
    content: string;
    state: string;
    requested: boolean;
    response: {
        content: string;
        responded_at: string;
        fixed: boolean;
    } | null;
};

type SyllabusSummary = {
    id: string;
    subject: string;
    code: string;
    convocation: string;
    period: string;
    state: string;
    guardado_en: string | null;
    parallels: string[];
    teachers: string[];
    sections: { id: string; title: string }[];
    validation: {
        completed_at: string;
        blocking_errors: number;
        warnings: number;
    } | null;
    revisions: {
        id: string;
        number: number;
        submitted_at: string;
        submitted_by: string;
        approved_at: string | null;
    }[];
    observations: Observation[];
    reopening: {
        cause: string;
        reopened_at: string;
        reopened_by: string;
    } | null;
};

defineProps<{ syllabus: SyllabusSummary }>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Mis sílabos', href: syllabiIndex() }] },
});

const stateLabel = (state: string): string =>
    ({
        sin_iniciar: 'Sin iniciar',
        borrador: 'Borrador',
        en_revision: 'En revisión',
        correccion_solicitada: 'Corrección solicitada',
        aprobado: 'Aprobado',
    })[state] ?? 'Estado no disponible';

const observationState = (state: string): string =>
    ({
        abierta: 'Abierta',
        respondida: 'Respondida',
        verificada: 'Verificada',
    })[state] ?? 'Estado no disponible';
</script>

<template>
    <Head :title="syllabus.subject" />
    <PageFrame
        :title="syllabus.subject"
        :description="`${syllabus.code} · ${syllabus.period}`"
    >
        <template #eyebrow>
            <Button as-child variant="link" class="h-auto px-0">
                <Link :href="syllabiIndex()">← Volver a mis sílabos</Link>
            </Button>
        </template>
        <template #meta>
            <Badge
                :variant="
                    ['borrador', 'correccion_solicitada'].includes(
                        syllabus.state,
                    )
                        ? 'secondary'
                        : 'outline'
                "
            >
                {{ stateLabel(syllabus.state) }}
            </Badge>
        </template>
        <template #actions>
            <Form
                v-if="syllabus.state === 'sin_iniciar'"
                v-bind="SyllabusController.start.form(syllabus.id)"
                v-slot="{ processing }"
            >
                <Button type="submit" :disabled="processing">
                    <Spinner v-if="processing" />
                    Iniciar borrador
                </Button>
            </Form>
            <template
                v-else-if="
                    ['borrador', 'correccion_solicitada'].includes(
                        syllabus.state,
                    )
                "
            >
                <Button as-child variant="outline">
                    <Link :href="SyllabusController.edit(syllabus.id)">
                        Continuar edición
                    </Link>
                </Button>
                <Button as-child>
                    <Link
                        :href="
                            SyllabusController.submitConfirmation(syllabus.id)
                        "
                    >
                        <Send aria-hidden="true" />
                        Revisar y enviar
                    </Link>
                </Button>
            </template>
        </template>

        <Alert v-if="syllabus.state === 'en_revision'">
            <ShieldCheck aria-hidden="true" />
            <AlertTitle>La revisión enviada está protegida</AlertTitle>
            <AlertDescription>
                Coordinación revisa el contenido enviado. El borrador no se
                puede editar hasta que se solicite una corrección o se apruebe.
            </AlertDescription>
        </Alert>

        <Alert v-else-if="syllabus.state === 'aprobado'">
            <ShieldCheck aria-hidden="true" />
            <AlertTitle>Sílabo aprobado</AlertTitle>
            <AlertDescription>
                La aprobación se conserva en el historial. Una reapertura futura
                mantendrá este respaldo.
            </AlertDescription>
        </Alert>

        <Alert v-else-if="syllabus.state === 'correccion_solicitada'">
            <FilePenLine aria-hidden="true" />
            <AlertTitle>Hay una corrección habilitada</AlertTitle>
            <AlertDescription>
                Edite únicamente lo necesario, responda las observaciones
                seleccionadas y reenvíe. La revisión anterior no cambia.
                <span v-if="syllabus.reopening" class="mt-2 block">
                    Reapertura: {{ syllabus.reopening.cause }}
                </span>
            </AlertDescription>
        </Alert>

        <Alert v-else>
            <ShieldCheck aria-hidden="true" />
            <AlertTitle>Configuración fijada</AlertTitle>
            <AlertDescription>
                Al iniciar, la plantilla y los datos maestros quedan vinculados
                al expediente. Los campos institucionales son de solo lectura.
            </AlertDescription>
        </Alert>

        <div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <div class="flex flex-col gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Contenido esperado</CardTitle>
                        <CardDescription>
                            La plantilla contiene
                            {{ syllabus.sections.length }} secciones.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ol class="grid gap-3 sm:grid-cols-2">
                            <li
                                v-for="(section, index) in syllabus.sections"
                                :key="section.id"
                                class="rounded-md border p-3 text-sm"
                            >
                                <span class="text-muted-foreground">
                                    {{ index + 1 }}.
                                </span>
                                {{ section.title }}
                            </li>
                        </ol>
                    </CardContent>
                </Card>

                <Card v-if="syllabus.observations.length > 0">
                    <CardHeader>
                        <CardTitle>Observaciones de revisión</CardTitle>
                        <CardDescription>
                            Las respuestas se fijan al reenviar una revisión.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-4">
                        <article
                            v-for="observation in syllabus.observations"
                            :key="observation.id"
                            class="rounded-md border p-4"
                        >
                            <div class="flex flex-wrap gap-2">
                                <Badge variant="outline">
                                    Revisión {{ observation.revision_number }}
                                </Badge>
                                <Badge
                                    :variant="
                                        observation.state === 'verificada'
                                            ? 'secondary'
                                            : 'destructive'
                                    "
                                >
                                    {{ observationState(observation.state) }}
                                </Badge>
                                <Badge
                                    v-if="observation.requested"
                                    variant="outline"
                                >
                                    Requiere respuesta
                                </Badge>
                            </div>
                            <p class="mt-3 text-sm whitespace-pre-wrap">
                                {{ observation.content }}
                            </p>
                            <div
                                v-if="observation.response"
                                class="mt-3 rounded bg-muted p-3 text-sm"
                            >
                                <div class="font-medium">Su respuesta</div>
                                <p class="mt-1 whitespace-pre-wrap">
                                    {{ observation.response.content }}
                                </p>
                                <Badge class="mt-2" variant="outline">
                                    {{
                                        observation.response.fixed
                                            ? 'Fijada en una revisión'
                                            : 'Pendiente de reenvío'
                                    }}
                                </Badge>
                            </div>
                        </article>
                    </CardContent>
                </Card>

                <Card v-if="syllabus.revisions.length > 0">
                    <CardHeader>
                        <CardTitle class="flex items-center gap-2">
                            <History class="size-5" aria-hidden="true" />
                            Historial
                        </CardTitle>
                        <CardDescription>
                            Cada envío se conserva en el historial.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ol class="space-y-3">
                            <li
                                v-for="(revision, index) in syllabus.revisions"
                                :key="revision.id"
                                class="flex flex-col justify-between gap-3 rounded-md border p-4 sm:flex-row sm:items-center"
                            >
                                <div>
                                    <div class="font-medium">
                                        Revisión {{ revision.number }}
                                        <Badge
                                            v-if="revision.approved_at"
                                            class="ml-2"
                                            variant="secondary"
                                        >
                                            Aprobada
                                        </Badge>
                                    </div>
                                    <div class="text-sm text-muted-foreground">
                                        {{ revision.submitted_by }} ·
                                        {{
                                            new Date(
                                                revision.submitted_at,
                                            ).toLocaleString('es-EC')
                                        }}
                                    </div>
                                </div>
                                <div class="flex flex-wrap gap-2">
                                    <Button
                                        v-if="revision.approved_at"
                                        as-child
                                        size="sm"
                                        variant="outline"
                                    >
                                        <Link
                                            :href="documentsShow(revision.id)"
                                        >
                                            Documentos
                                        </Link>
                                    </Button>
                                    <Button
                                        v-if="index > 0"
                                        as-child
                                        size="sm"
                                        variant="outline"
                                    >
                                        <Link
                                            :href="
                                                ReviewController.compare({
                                                    before: syllabus.revisions[
                                                        index - 1
                                                    ].id,
                                                    after: revision.id,
                                                })
                                            "
                                        >
                                            Comparar
                                        </Link>
                                    </Button>
                                </div>
                            </li>
                        </ol>
                    </CardContent>
                </Card>
            </div>

            <div class="flex flex-col gap-6">
                <Card>
                    <CardHeader><CardTitle>Asignación</CardTitle></CardHeader>
                    <CardContent class="flex flex-col gap-3 text-sm">
                        <div>
                            <div class="font-medium">Convocatoria</div>
                            <div class="text-muted-foreground">
                                {{ syllabus.convocation }}
                            </div>
                        </div>
                        <div>
                            <div class="font-medium">Paralelos</div>
                            <div class="text-muted-foreground">
                                {{ syllabus.parallels.join(', ') }}
                            </div>
                        </div>
                        <div>
                            <div class="font-medium">
                                Docentes colaboradores
                            </div>
                            <div class="text-muted-foreground">
                                {{ syllabus.teachers.join(', ') }}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    </PageFrame>
</template>
