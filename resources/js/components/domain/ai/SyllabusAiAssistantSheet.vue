<script setup lang="ts">
import { router } from '@inertiajs/vue3';
import {
    Bot,
    Check,
    ChevronRight,
    CircleAlert,
    Clock3,
    FileText,
    Sparkles,
} from '@lucide/vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
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
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';

type Evidence = {
    id: string;
    source: string;
    excerpt: string;
};

type Recommendation = {
    id: string;
    title: string;
    explanation: string;
    suggested_text: string;
    evidence_ids: string[];
    my_decisions: string[];
    applied: boolean;
    feedback_url: string;
    apply_url: string;
};

type Execution = {
    id: string;
    status:
        | 'pendiente'
        | 'en_ejecucion'
        | 'completada'
        | 'no_concluyente'
        | 'fallida';
    requested_at: string;
    completed_at: string | null;
    stale: boolean;
    section: { id: string; title: string };
    field: { id: string; label: string };
    input_content: string;
    reason: string | null;
    error_message: string | null;
    evidence: Evidence[];
    recommendations: Recommendation[];
};

export type SyllabusAiAssistance = {
    available: boolean;
    is_provisional_simulator: boolean;
    review_url: string;
    sources: string[];
    executions: Execution[];
};

const props = defineProps<{
    assistance: SyllabusAiAssistance;
    syllabusVersion: number;
    canReview: boolean;
    saving: boolean;
}>();

const open = ref(false);
const requestingReview = ref(false);
const decidingId = ref<string | null>(null);
const applyOpen = ref(false);
const activeRecommendation = ref<{
    execution: Execution;
    recommendation: Recommendation;
} | null>(null);
const reviewKey = ref(crypto.randomUUID());
let polling: ReturnType<typeof setInterval> | null = null;

const hasProcessing = computed(() =>
    props.assistance.executions.some((execution) =>
        ['pendiente', 'en_ejecucion'].includes(execution.status),
    ),
);

const hasResults = computed(() => props.assistance.executions.length > 0);

const statusLabel = (execution: Execution): string => {
    if (execution.stale) {
        return 'Desactualizado';
    }

    return {
        pendiente: 'Pendiente',
        en_ejecucion: 'Revisando',
        completada: 'Revisado',
        no_concluyente: 'Sin conclusión',
        fallida: 'No disponible',
    }[execution.status];
};

const statusVariant = (execution: Execution) => {
    if (execution.status === 'fallida') {
        return 'destructive' as const;
    }

    if (execution.status === 'completada' && !execution.stale) {
        return 'default' as const;
    }

    return 'secondary' as const;
};

const citedEvidence = (
    execution: Execution,
    recommendation: Recommendation,
): Evidence[] =>
    execution.evidence.filter((evidence) =>
        recommendation.evidence_ids.includes(evidence.id),
    );

const requestReview = (): void => {
    if (!props.canReview || props.saving || requestingReview.value) {
        return;
    }

    requestingReview.value = true;
    router.post(
        props.assistance.review_url,
        {
            idempotency_key: reviewKey.value,
            version_bloqueo: props.syllabusVersion,
        },
        {
            preserveScroll: true,
            preserveState: true,
            onSuccess: () => {
                reviewKey.value = crypto.randomUUID();
            },
            onFinish: () => {
                requestingReview.value = false;
            },
        },
    );
};

const recordDecision = (
    recommendation: Recommendation,
    decision: 'aceptada' | 'ignorada' | 'no_util',
): void => {
    decidingId.value = recommendation.id;
    router.post(
        recommendation.feedback_url,
        { decision },
        {
            preserveScroll: true,
            preserveState: true,
            onFinish: () => {
                decidingId.value = null;
            },
        },
    );
};

const reviewChange = (
    execution: Execution,
    recommendation: Recommendation,
): void => {
    activeRecommendation.value = { execution, recommendation };
    applyOpen.value = true;
};

const applyRecommendation = (): void => {
    if (!activeRecommendation.value || decidingId.value !== null) {
        return;
    }

    const recommendation = activeRecommendation.value.recommendation;
    decidingId.value = recommendation.id;
    router.post(
        recommendation.apply_url,
        {
            version_bloqueo: props.syllabusVersion,
            return_to_editor: true,
        },
        {
            preserveScroll: true,
            onSuccess: () => {
                applyOpen.value = false;
                open.value = false;
            },
            onFinish: () => {
                decidingId.value = null;
            },
        },
    );
};

const goToSection = (sectionId: string): void => {
    open.value = false;
    window.setTimeout(() => {
        document
            .getElementById(`section-${sectionId}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
};

const stopPolling = (): void => {
    if (polling !== null) {
        clearInterval(polling);
        polling = null;
    }
};

watch(
    hasProcessing,
    (processing) => {
        stopPolling();

        if (processing) {
            polling = setInterval(() => {
                router.reload({
                    only: ['ai_assistance'],
                });
            }, 4000);
        }
    },
    { immediate: true },
);

onBeforeUnmount(stopPolling);
</script>

<template>
    <Sheet v-model:open="open">
        <SheetTrigger :as-child="true">
            <Button type="button" variant="outline"> Asistente IA </Button>
        </SheetTrigger>

        <SheetContent side="right" class="w-full gap-0 sm:max-w-xl">
            <SheetHeader class="pr-12">
                <div class="flex items-center gap-2">
                    <SheetTitle>Asistente IA</SheetTitle>
                    <Badge variant="secondary">Recomendación</Badge>
                </div>
                <SheetDescription>
                    Revisa el sílabo completo y explica cada sugerencia con su
                    fuente
                </SheetDescription>
            </SheetHeader>

            <Separator />

            <div
                class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
                aria-live="polite"
            >
                <Alert v-if="assistance.is_provisional_simulator">
                    <Sparkles aria-hidden="true" />
                    <AlertTitle>Modo de demostración</AlertTitle>
                    <AlertDescription>
                        El flujo y las citas son reales, pero el modelo actual
                        todavía es el simulador técnico
                    </AlertDescription>
                </Alert>

                <Card>
                    <CardHeader>
                        <div class="flex items-start gap-3">
                            <div
                                class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"
                            >
                                <Bot aria-hidden="true" />
                            </div>
                            <div class="flex min-w-0 flex-col gap-1">
                                <CardTitle class="text-base">
                                    Revisión contextual
                                </CardTitle>
                                <CardDescription>
                                    Analizaré únicamente los campos habilitados
                                    y las fuentes elegidas por Coordinación
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent
                        v-if="assistance.sources.length > 0"
                        class="flex flex-col gap-2"
                    >
                        <p class="text-xs font-medium text-muted-foreground">
                            Fuentes disponibles
                        </p>
                        <div class="flex flex-wrap gap-2">
                            <Badge
                                v-for="source in assistance.sources"
                                :key="source"
                                variant="outline"
                            >
                                {{ source }}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                <Empty v-if="!hasResults" class="min-h-64 border">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <FileText aria-hidden="true" />
                        </EmptyMedia>
                        <EmptyTitle>Aún no hay una revisión</EmptyTitle>
                        <EmptyDescription v-if="canReview">
                            El sílabo está listo. Inicia la revisión para
                            recibir consejos organizados por sección
                        </EmptyDescription>
                        <EmptyDescription v-else>
                            Completa los campos obligatorios y valida el sílabo
                            para habilitar la revisión
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent v-if="canReview">
                        <Button
                            type="button"
                            :disabled="requestingReview || saving"
                            @click="requestReview"
                        >
                            <Spinner
                                v-if="requestingReview"
                                data-icon="inline-start"
                            />
                            <Sparkles
                                v-else
                                data-icon="inline-start"
                                aria-hidden="true"
                            />
                            Revisar sílabo
                        </Button>
                    </EmptyContent>
                </Empty>

                <Card
                    v-for="execution in assistance.executions"
                    v-else
                    :key="execution.id"
                >
                    <CardHeader>
                        <div class="flex items-start justify-between gap-3">
                            <div class="flex min-w-0 flex-col gap-1">
                                <button
                                    type="button"
                                    class="flex items-center gap-1 text-left text-sm font-medium hover:underline"
                                    @click="goToSection(execution.section.id)"
                                >
                                    {{ execution.section.title }}
                                    <ChevronRight aria-hidden="true" />
                                </button>
                                <CardTitle class="text-base">
                                    {{ execution.field.label }}
                                </CardTitle>
                            </div>
                            <Badge :variant="statusVariant(execution)">
                                <Spinner
                                    v-if="
                                        execution.status === 'pendiente' ||
                                        execution.status === 'en_ejecucion'
                                    "
                                    data-icon="inline-start"
                                />
                                {{ statusLabel(execution) }}
                            </Badge>
                        </div>
                        <CardDescription v-if="execution.stale">
                            El borrador cambió después de este análisis
                        </CardDescription>
                    </CardHeader>

                    <CardContent class="flex flex-col gap-4">
                        <Alert
                            v-if="
                                execution.status === 'pendiente' ||
                                execution.status === 'en_ejecucion'
                            "
                        >
                            <Clock3 aria-hidden="true" />
                            <AlertTitle>Revisión en curso</AlertTitle>
                            <AlertDescription>
                                Puedes continuar editando mientras termina
                            </AlertDescription>
                        </Alert>

                        <Alert
                            v-else-if="execution.status === 'fallida'"
                            variant="destructive"
                        >
                            <CircleAlert aria-hidden="true" />
                            <AlertTitle
                                >No se pudo revisar este campo</AlertTitle
                            >
                            <AlertDescription>
                                {{ execution.error_message }} El sílabo sigue
                                disponible
                            </AlertDescription>
                        </Alert>

                        <Alert
                            v-else-if="execution.status === 'no_concluyente'"
                        >
                            <FileText aria-hidden="true" />
                            <AlertTitle>Sin recomendación</AlertTitle>
                            <AlertDescription>
                                {{ execution.reason }}
                            </AlertDescription>
                        </Alert>

                        <article
                            v-for="recommendation in execution.recommendations"
                            :key="recommendation.id"
                            class="flex flex-col gap-3 rounded-md border p-3"
                        >
                            <div class="flex items-start justify-between gap-3">
                                <div class="flex min-w-0 flex-col gap-1">
                                    <h3 class="font-medium">
                                        {{ recommendation.title }}
                                    </h3>
                                    <p class="text-sm text-muted-foreground">
                                        {{ recommendation.explanation }}
                                    </p>
                                </div>
                                <Badge
                                    v-if="recommendation.applied"
                                    variant="secondary"
                                >
                                    <Check
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                    />
                                    Aplicada
                                </Badge>
                            </div>

                            <div
                                class="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap"
                            >
                                {{ recommendation.suggested_text }}
                            </div>

                            <details
                                v-for="evidence in citedEvidence(
                                    execution,
                                    recommendation,
                                )"
                                :key="evidence.id"
                                class="rounded-md border px-3 py-2"
                            >
                                <summary
                                    class="cursor-pointer text-sm font-medium"
                                >
                                    {{ evidence.source }}
                                </summary>
                                <p
                                    class="pt-2 text-sm whitespace-pre-wrap text-muted-foreground"
                                >
                                    {{ evidence.excerpt }}
                                </p>
                            </details>

                            <div
                                v-if="!recommendation.applied"
                                class="flex flex-wrap gap-2"
                            >
                                <Button
                                    type="button"
                                    size="sm"
                                    :disabled="
                                        execution.stale ||
                                        decidingId === recommendation.id
                                    "
                                    @click="
                                        reviewChange(execution, recommendation)
                                    "
                                >
                                    Revisar cambio
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    :disabled="
                                        decidingId === recommendation.id ||
                                        recommendation.my_decisions.includes(
                                            'ignorada',
                                        )
                                    "
                                    @click="
                                        recordDecision(
                                            recommendation,
                                            'ignorada',
                                        )
                                    "
                                >
                                    Ignorar
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    :disabled="
                                        decidingId === recommendation.id ||
                                        recommendation.my_decisions.includes(
                                            'no_util',
                                        )
                                    "
                                    @click="
                                        recordDecision(
                                            recommendation,
                                            'no_util',
                                        )
                                    "
                                >
                                    No es útil
                                </Button>
                            </div>
                        </article>
                    </CardContent>
                </Card>
            </div>

            <Separator />

            <SheetFooter>
                <p class="text-xs text-muted-foreground">
                    La IA recomienda; tú decides qué aplicar
                </p>
                <Button
                    v-if="hasResults && canReview"
                    type="button"
                    :disabled="requestingReview || saving || hasProcessing"
                    @click="requestReview"
                >
                    <Spinner
                        v-if="requestingReview || hasProcessing"
                        data-icon="inline-start"
                    />
                    <Sparkles
                        v-else
                        data-icon="inline-start"
                        aria-hidden="true"
                    />
                    {{
                        hasProcessing
                            ? 'Revisión en curso'
                            : 'Revisar nuevamente'
                    }}
                </Button>
            </SheetFooter>
        </SheetContent>
    </Sheet>

    <Dialog v-model:open="applyOpen">
        <DialogContent v-if="activeRecommendation" class="sm:max-w-2xl">
            <DialogHeader>
                <DialogTitle>
                    Aplicar cambio en
                    {{ activeRecommendation.execution.field.label }}
                </DialogTitle>
                <DialogDescription>
                    Compara el contenido analizado con la propuesta antes de
                    modificar el borrador
                </DialogDescription>
            </DialogHeader>

            <div class="grid max-h-[55vh] gap-4 overflow-y-auto md:grid-cols-2">
                <section class="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
                    <h3 class="text-sm font-medium">Antes</h3>
                    <p class="text-sm whitespace-pre-wrap">
                        {{ activeRecommendation.execution.input_content }}
                    </p>
                </section>
                <section class="flex flex-col gap-2 rounded-md border p-3">
                    <h3 class="text-sm font-medium">Después</h3>
                    <p class="text-sm whitespace-pre-wrap">
                        {{ activeRecommendation.recommendation.suggested_text }}
                    </p>
                </section>
            </div>

            <DialogFooter>
                <DialogClose :as-child="true">
                    <Button type="button" variant="outline">Cancelar</Button>
                </DialogClose>
                <Button
                    type="button"
                    :disabled="
                        decidingId === activeRecommendation.recommendation.id
                    "
                    @click="applyRecommendation"
                >
                    <Spinner
                        v-if="
                            decidingId ===
                            activeRecommendation.recommendation.id
                        "
                        data-icon="inline-start"
                    />
                    <Check v-else data-icon="inline-start" aria-hidden="true" />
                    Aplicar cambio
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
