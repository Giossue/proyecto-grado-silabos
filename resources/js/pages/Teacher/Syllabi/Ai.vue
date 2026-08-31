<script setup lang="ts">
import { Form, Head, Link, router } from '@inertiajs/vue3';
import {
    CircleAlert,
    Clock3,
    Eye,
    FileSearch,
    ShieldCheck,
    Sparkles,
    ThumbsDown,
} from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted } from 'vue';
import AiAssistanceController from '@/actions/App/Modules/AiAssistance/Presentation/Http/Controllers/AiAssistanceController';
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

type Evidence = {
    id: string;
    source: string;
    authority: string;
    version: number;
    fragment_title: string;
    excerpt: string;
};

type Recommendation = {
    id: string;
    type: string;
    title: string;
    explanation: string;
    suggested_text: string;
    evidence_ids: string[];
    my_decisions: string[];
    applied: boolean;
};

type Execution = {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'inconclusive' | 'failed';
    requested_at: string;
    completed_at: string | null;
    analysis_label: string;
    input_content: string;
    reason: string | null;
    error_message: string | null;
    evidence: Evidence[];
    recommendations: Recommendation[];
};

const props = defineProps<{
    syllabus: {
        id: string;
        subject: string;
        state: string;
        lock_version: number;
    };
    field: {
        id: string;
        key: string;
        label: string;
        content: string;
    };
    environment: {
        is_provisional_simulator: boolean;
    };
    executions: Execution[];
}>();

defineOptions({
    layout: {
        breadcrumbs: [
            { title: 'Mis sílabos', href: '/mis-silabos' },
            { title: 'Asistencia de IA', href: '#' },
        ],
    },
});

const latest = computed(() => props.executions[0] ?? null);
const isProcessing = computed(
    () =>
        latest.value?.status === 'pending' ||
        latest.value?.status === 'running',
);
const requestKey = crypto.randomUUID();
let polling: ReturnType<typeof setInterval> | null = null;

const statusLabel = (status: Execution['status']): string =>
    ({
        pending: 'Pendiente',
        running: 'Procesando',
        completed: 'Completado',
        inconclusive: 'No concluyente',
        failed: 'Fallido',
    })[status];

const statusVariant = (status: Execution['status']) => {
    if (status === 'failed') {
        return 'destructive' as const;
    }

    if (status === 'completed') {
        return 'default' as const;
    }

    return 'secondary' as const;
};

const referencedEvidence = (
    execution: Execution,
    recommendation: Recommendation,
): Evidence[] =>
    execution.evidence.filter((item) =>
        recommendation.evidence_ids.includes(item.id),
    );

const dateTime = (value: string): string =>
    new Intl.DateTimeFormat('es-EC', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));

onMounted(() => {
    if (isProcessing.value) {
        polling = setInterval(() => {
            router.reload({
                only: ['syllabus', 'field', 'executions'],
            });
        }, 4000);
    }
});

onBeforeUnmount(() => {
    if (polling) {
        clearInterval(polling);
    }
});
</script>

<template>
    <Head :title="`Asistencia de IA · ${field.label}`" />
    <PageFrame
        title="Asistencia de IA"
        :description="`${syllabus.subject} · ${field.label}`"
        size="wide"
    >
        <template #eyebrow>
            <Button as-child variant="link" class="h-auto px-0">
                <Link :href="SyllabusController.edit(syllabus.id)">
                    ← Volver al editor
                </Link>
            </Button>
        </template>
        <template #actions>
            <Form
                v-bind="
                    AiAssistanceController.store.form({
                        syllabus: syllabus.id,
                        field: field.id,
                    })
                "
                v-slot="{ errors, processing }"
                class="flex flex-col items-start gap-2"
            >
                <input
                    type="hidden"
                    name="idempotency_key"
                    :value="requestKey"
                />
                <Button type="submit" :disabled="processing || isProcessing">
                    <Spinner v-if="processing || isProcessing" />
                    <Sparkles v-else aria-hidden="true" />
                    {{
                        isProcessing
                            ? 'Análisis en curso'
                            : 'Solicitar análisis'
                    }}
                </Button>
                <p
                    v-if="errors.idempotency_key"
                    class="text-sm text-destructive"
                >
                    {{ errors.idempotency_key }}
                </p>
            </Form>
        </template>

        <Alert v-if="environment.is_provisional_simulator">
            <ShieldCheck aria-hidden="true" />
            <AlertTitle>Asistencia de IA en pruebas</AlertTitle>
            <AlertDescription>
                Revise siempre las sugerencias antes de aplicarlas. Esta
                asistencia todavía no representa una recomendación
                institucional.
            </AlertDescription>
        </Alert>

        <Alert>
            <FileSearch aria-hidden="true" />
            <AlertTitle
                >Ayuda separada de la validación determinística</AlertTitle
            >
            <AlertDescription>
                Las recomendaciones no aprueban, bloquean ni cambian el estado
                del sílabo. El texto solo cambia tras revisar la vista previa y
                confirmar “Aplicar”. Si la ayuda falla, puede seguir guardando,
                validando y enviando.
            </AlertDescription>
        </Alert>

        <div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <main class="flex min-w-0 flex-col gap-6">
                <Card v-if="executions.length === 0">
                    <CardHeader>
                        <CardTitle>Aún no hay análisis</CardTitle>
                        <CardDescription>
                            La solicitud fijará el contenido actual y únicamente
                            las fuentes activas, vigentes y vinculadas a la
                            convocatoria.
                        </CardDescription>
                    </CardHeader>
                </Card>

                <Card v-for="execution in executions" :key="execution.id">
                    <CardHeader>
                        <div
                            class="flex flex-wrap items-center justify-between gap-3"
                        >
                            <div>
                                <CardTitle class="text-base">
                                    Análisis del
                                    {{ dateTime(execution.requested_at) }}
                                </CardTitle>
                                <CardDescription>
                                    {{ execution.analysis_label }} · contenido y
                                    fuentes considerados al solicitarlo
                                </CardDescription>
                            </div>
                            <Badge :variant="statusVariant(execution.status)">
                                <Spinner
                                    v-if="
                                        execution.status === 'pending' ||
                                        execution.status === 'running'
                                    "
                                />
                                {{ statusLabel(execution.status) }}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent class="flex flex-col gap-5">
                        <Alert
                            v-if="
                                execution.status === 'pending' ||
                                execution.status === 'running'
                            "
                        >
                            <Clock3 aria-hidden="true" />
                            <AlertTitle>Trabajo asíncrono en curso</AlertTitle>
                            <AlertDescription>
                                Puede abandonar esta página; recibirá una
                                notificación al finalizar.
                            </AlertDescription>
                        </Alert>

                        <Alert
                            v-else-if="execution.status === 'failed'"
                            variant="destructive"
                        >
                            <CircleAlert aria-hidden="true" />
                            <AlertTitle
                                >La ayuda no pudo completarse</AlertTitle
                            >
                            <AlertDescription>
                                {{ execution.error_message }} El borrador
                                permanece intacto.
                            </AlertDescription>
                        </Alert>

                        <Alert v-else-if="execution.status === 'inconclusive'">
                            <Eye aria-hidden="true" />
                            <AlertTitle>Resultado no concluyente</AlertTitle>
                            <AlertDescription>{{
                                execution.reason
                            }}</AlertDescription>
                        </Alert>

                        <article
                            v-for="recommendation in execution.recommendations"
                            :key="recommendation.id"
                            class="space-y-4 rounded-lg border p-4"
                        >
                            <div
                                class="flex flex-wrap items-start justify-between gap-3"
                            >
                                <div>
                                    <h2 class="font-semibold">
                                        {{ recommendation.title }}
                                    </h2>
                                    <p
                                        class="mt-1 text-sm text-muted-foreground"
                                    >
                                        {{ recommendation.explanation }}
                                    </p>
                                </div>
                                <Badge variant="outline">Recomendación</Badge>
                            </div>

                            <div class="grid gap-3 md:grid-cols-2">
                                <section class="rounded-md bg-muted/40 p-3">
                                    <h3 class="mb-2 text-sm font-medium">
                                        Texto analizado
                                    </h3>
                                    <p class="text-sm whitespace-pre-wrap">
                                        {{
                                            execution.input_content ||
                                            'Campo vacío'
                                        }}
                                    </p>
                                </section>
                                <section class="rounded-md border p-3">
                                    <h3 class="mb-2 text-sm font-medium">
                                        Texto sugerido
                                    </h3>
                                    <p class="text-sm whitespace-pre-wrap">
                                        {{ recommendation.suggested_text }}
                                    </p>
                                </section>
                            </div>

                            <section>
                                <h3 class="mb-2 text-sm font-medium">
                                    Evidencia citada
                                </h3>
                                <div class="space-y-2">
                                    <details
                                        v-for="evidence in referencedEvidence(
                                            execution,
                                            recommendation,
                                        )"
                                        :key="evidence.id"
                                        class="rounded-md border p-3"
                                    >
                                        <summary
                                            class="cursor-pointer text-sm font-medium"
                                        >
                                            {{ evidence.source }} · versión
                                            {{ evidence.version }} ·
                                            {{ evidence.fragment_title }}
                                        </summary>
                                        <p
                                            class="mt-2 text-xs text-muted-foreground"
                                        >
                                            Autoridad: {{ evidence.authority }}
                                        </p>
                                        <p
                                            class="mt-2 text-sm whitespace-pre-wrap"
                                        >
                                            {{ evidence.excerpt }}
                                        </p>
                                    </details>
                                </div>
                            </section>

                            <div class="flex flex-wrap items-center gap-2">
                                <Form
                                    v-bind="
                                        AiAssistanceController.feedback.form({
                                            syllabus: syllabus.id,
                                            field: field.id,
                                            recommendation: recommendation.id,
                                        })
                                    "
                                    :options="{ preserveScroll: true }"
                                    v-slot="{ processing }"
                                >
                                    <input
                                        type="hidden"
                                        name="decision"
                                        value="accepted"
                                    />
                                    <Button
                                        type="submit"
                                        size="sm"
                                        variant="outline"
                                        :disabled="
                                            processing ||
                                            recommendation.my_decisions.includes(
                                                'accepted',
                                            )
                                        "
                                    >
                                        {{
                                            recommendation.my_decisions.includes(
                                                'accepted',
                                            )
                                                ? 'Aceptada'
                                                : 'Aceptar'
                                        }}
                                    </Button>
                                </Form>
                                <Form
                                    v-bind="
                                        AiAssistanceController.feedback.form({
                                            syllabus: syllabus.id,
                                            field: field.id,
                                            recommendation: recommendation.id,
                                        })
                                    "
                                    :options="{ preserveScroll: true }"
                                    v-slot="{ processing }"
                                >
                                    <input
                                        type="hidden"
                                        name="decision"
                                        value="ignored"
                                    />
                                    <Button
                                        type="submit"
                                        size="sm"
                                        variant="ghost"
                                        :disabled="
                                            processing ||
                                            recommendation.my_decisions.includes(
                                                'ignored',
                                            )
                                        "
                                    >
                                        Ignorar
                                    </Button>
                                </Form>
                                <Form
                                    v-bind="
                                        AiAssistanceController.feedback.form({
                                            syllabus: syllabus.id,
                                            field: field.id,
                                            recommendation: recommendation.id,
                                        })
                                    "
                                    :options="{ preserveScroll: true }"
                                    v-slot="{ processing }"
                                >
                                    <input
                                        type="hidden"
                                        name="decision"
                                        value="not_useful"
                                    />
                                    <Button
                                        type="submit"
                                        size="sm"
                                        variant="ghost"
                                        :disabled="
                                            processing ||
                                            recommendation.my_decisions.includes(
                                                'not_useful',
                                            )
                                        "
                                    >
                                        <ThumbsDown aria-hidden="true" />
                                        No es útil
                                    </Button>
                                </Form>

                                <Badge v-if="recommendation.applied">
                                    Aplicada
                                </Badge>
                                <Dialog v-else>
                                    <DialogTrigger as-child>
                                        <Button type="button" size="sm">
                                            <Eye aria-hidden="true" />
                                            Revisar y aplicar
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent class="sm:max-w-2xl">
                                        <DialogHeader>
                                            <DialogTitle>
                                                Confirmar cambio en
                                                {{ field.label }}
                                            </DialogTitle>
                                            <DialogDescription>
                                                Esta acción modifica solo el
                                                campo. No envía, aprueba ni
                                                cambia el estado del sílabo.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div
                                            class="max-h-[55vh] space-y-4 overflow-y-auto"
                                        >
                                            <section
                                                class="rounded-md bg-muted/40 p-3"
                                            >
                                                <h3
                                                    class="mb-2 text-sm font-medium"
                                                >
                                                    Antes
                                                </h3>
                                                <p
                                                    class="text-sm whitespace-pre-wrap"
                                                >
                                                    {{
                                                        field.content ||
                                                        'Campo vacío'
                                                    }}
                                                </p>
                                            </section>
                                            <section
                                                class="rounded-md border p-3"
                                            >
                                                <h3
                                                    class="mb-2 text-sm font-medium"
                                                >
                                                    Después
                                                </h3>
                                                <p
                                                    class="text-sm whitespace-pre-wrap"
                                                >
                                                    {{
                                                        recommendation.suggested_text
                                                    }}
                                                </p>
                                            </section>
                                        </div>
                                        <Form
                                            v-bind="
                                                AiAssistanceController.apply.form(
                                                    {
                                                        syllabus: syllabus.id,
                                                        field: field.id,
                                                        recommendation:
                                                            recommendation.id,
                                                    },
                                                )
                                            "
                                            v-slot="{ errors, processing }"
                                        >
                                            <input
                                                type="hidden"
                                                name="lock_version"
                                                :value="syllabus.lock_version"
                                            />
                                            <p
                                                v-if="
                                                    errors.recommendation ||
                                                    errors.lock_version
                                                "
                                                class="mb-3 text-sm text-destructive"
                                            >
                                                {{
                                                    errors.recommendation ??
                                                    errors.lock_version
                                                }}
                                            </p>
                                            <DialogFooter>
                                                <Button
                                                    type="submit"
                                                    :disabled="processing"
                                                >
                                                    <Spinner
                                                        v-if="processing"
                                                    />
                                                    Aplicar este texto
                                                </Button>
                                            </DialogFooter>
                                        </Form>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </article>
                    </CardContent>
                </Card>
            </main>

            <aside class="flex flex-col gap-6 lg:sticky lg:top-4 lg:h-fit">
                <Card>
                    <CardHeader>
                        <CardTitle class="text-base"
                            >Contenido actual</CardTitle
                        >
                        <CardDescription>
                            Cambios guardados en este borrador.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p class="text-sm whitespace-pre-wrap">
                            {{ field.content || 'El campo está vacío.' }}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle class="text-base"
                            >Límites de esta ayuda</CardTitle
                        >
                    </CardHeader>
                    <CardContent class="text-sm text-muted-foreground">
                        <ul class="list-disc space-y-2 pl-5">
                            <li>
                                No asigna calificaciones ni niveles de
                                confianza.
                            </li>
                            <li>No decide qué fuente tiene precedencia.</li>
                            <li>No modifica el texto automáticamente.</li>
                            <li>
                                Conserva fuente, versión y fragmento citado.
                            </li>
                        </ul>
                    </CardContent>
                </Card>
            </aside>
        </div>
    </PageFrame>
</template>
