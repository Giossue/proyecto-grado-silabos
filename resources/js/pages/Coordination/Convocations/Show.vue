<script setup lang="ts">
import { Form, Head, Link } from '@inertiajs/vue3';
import {
    CalendarRange,
    CheckCircle2,
    CircleDashed,
    FilePenLine,
    Files,
} from '@lucide/vue';
import ConvocationController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ConvocationController';
import PageFrame from '@/components/domain/PageFrame.vue';
import DeadlineExtensionSheet from '@/components/domain/syllabus/DeadlineExtensionSheet.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
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
import {
    Table,
    TableBody,
    TableCell,
    TableEmpty,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useClientPagination } from '@/composables/useClientPagination';
import { index as convocationsIndex } from '@/routes/convocations';

const props = defineProps<{
    convocation: {
        id: string;
        name: string;
        state: string;
        grouping_mode: string;
        period: string;
        template: string;
        sources: string[];
        start_date: string | null;
        draft_deadline: string | null;
        counts: {
            total: number;
            not_started: number;
            draft: number;
            in_review: number;
            approved: number;
        };
        syllabi: {
            id: string;
            subject: string;
            code: string;
            state: string;
            completion: number;
            parallels: string[];
            teachers: string[];
        }[];
    };
}>();

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Convocatorias', href: convocationsIndex() }],
    },
});

const stateLabel = (state: string): string =>
    ({
        not_started: 'Sin iniciar',
        draft: 'Borrador',
        in_review: 'En revisión',
        correction_requested: 'Corrección solicitada',
        approved: 'Aprobado',
    })[state] ?? state;

const formatDate = (value: string | null): string =>
    value
        ? new Intl.DateTimeFormat('es-EC', {
              dateStyle: 'long',
              timeStyle: 'short',
          }).format(new Date(value))
        : 'Sin fecha';

const formattedStart = formatDate(props.convocation.start_date);
const formattedDeadline = formatDate(props.convocation.draft_deadline);
const {
    items: syllabusPage,
    meta: syllabusMeta,
    setPage: setSyllabusPage,
} = useClientPagination(() => props.convocation.syllabi);
</script>

<template>
    <Head :title="convocation.name" />
    <PageFrame
        :icon="CalendarRange"
        :title="convocation.name"
        :description="`${convocation.period} · ${convocation.template}`"
    >
        <template #eyebrow>
            <Button as-child variant="link" class="h-auto px-0">
                <Link :href="convocationsIndex()"
                    >← Volver a convocatorias</Link
                >
            </Button>
        </template>
        <template #meta>
            <Badge
                :variant="
                    convocation.state === 'open' ? 'secondary' : 'outline'
                "
            >
                {{
                    convocation.state === 'open' ? 'Abierta' : 'En preparación'
                }}
            </Badge>
        </template>
        <template #actions>
            <div class="flex flex-wrap items-start gap-2">
                <DeadlineExtensionSheet
                    v-if="convocation.state !== 'closed'"
                    :convocation-id="convocation.id"
                />
                <Form
                    v-if="convocation.state === 'preparation'"
                    v-bind="ConvocationController.open.form(convocation.id)"
                    v-slot="{ errors, processing }"
                >
                    <div class="flex flex-col items-start gap-2">
                        <FieldError :errors="[errors.convocation]" />
                        <Button type="submit" :disabled="processing">
                            <Spinner v-if="processing" />
                            Abrir y generar expedientes
                        </Button>
                    </div>
                </Form>
            </div>
        </template>

        <Alert v-if="convocation.state === 'preparation'">
            <AlertTitle>Revise antes de abrir</AlertTitle>
            <AlertDescription>
                La apertura fija esta plantilla y estas fuentes, valida que cada
                paralelo tenga docente vigente y genera todos los expedientes en
                una sola transacción. Si algo falta, no se crea ninguno.
            </AlertDescription>
        </Alert>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
                <CardHeader>
                    <CardDescription>Expedientes</CardDescription>
                    <CardTitle class="text-3xl">{{
                        convocation.counts.total
                    }}</CardTitle>
                </CardHeader>
                <CardContent
                    class="flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <Files aria-hidden="true" />
                    Generados
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardDescription>Sin iniciar</CardDescription>
                    <CardTitle class="text-3xl">{{
                        convocation.counts.not_started
                    }}</CardTitle>
                </CardHeader>
                <CardContent
                    class="flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <CircleDashed aria-hidden="true" />
                    Requieren acción docente
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardDescription>En elaboración</CardDescription>
                    <CardTitle class="text-3xl">{{
                        convocation.counts.draft
                    }}</CardTitle>
                </CardHeader>
                <CardContent
                    class="flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <FilePenLine aria-hidden="true" />
                    Borradores activos
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardDescription>Aprobados</CardDescription>
                    <CardTitle class="text-3xl">{{
                        convocation.counts.approved
                    }}</CardTitle>
                </CardHeader>
                <CardContent
                    class="flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <CheckCircle2 aria-hidden="true" />
                    Cierre del flujo
                </CardContent>
            </Card>
        </div>

        <div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <Card>
                <CardHeader>
                    <CardTitle>Seguimiento por expediente</CardTitle>
                    <CardDescription>
                        Elaboración desde {{ formattedStart }} hasta
                        {{ formattedDeadline }}. Vencido el plazo, el envío se
                        bloquea hasta que conceda una prórroga.
                    </CardDescription>
                </CardHeader>
                <CardContent class="flex flex-col gap-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Asignatura</TableHead>
                                <TableHead>Paralelos y docentes</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead class="text-right"
                                    >Completitud</TableHead
                                >
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableEmpty
                                v-if="convocation.syllabi.length === 0"
                                :colspan="4"
                            >
                                Los expedientes aparecerán después de abrir la
                                convocatoria.
                            </TableEmpty>
                            <TableRow
                                v-for="syllabus in syllabusPage"
                                v-else
                                :key="syllabus.id"
                            >
                                <TableCell>
                                    <div class="font-medium">
                                        {{ syllabus.subject }}
                                    </div>
                                    <div class="text-sm text-muted-foreground">
                                        {{ syllabus.code }}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div>
                                        Paralelos
                                        {{ syllabus.parallels.join(', ') }}
                                    </div>
                                    <div class="text-sm text-muted-foreground">
                                        {{ syllabus.teachers.join(', ') }}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline">
                                        {{ stateLabel(syllabus.state) }}
                                    </Badge>
                                </TableCell>
                                <TableCell class="text-right">
                                    {{ syllabus.completion.toFixed(0) }} %
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                    <TablePagination
                        :meta="syllabusMeta"
                        mode="client"
                        label="Paginación del seguimiento de convocatoria"
                        @update:page="setSyllabusPage"
                    />
                </CardContent>
            </Card>

            <Card class="h-fit">
                <CardHeader>
                    <CardTitle>Configuración fijada</CardTitle>
                    <CardDescription>
                        No cambia los expedientes después de abrir.
                    </CardDescription>
                </CardHeader>
                <CardContent class="flex flex-col gap-4 text-sm">
                    <div>
                        <div class="font-medium">Agrupación</div>
                        <div class="text-muted-foreground">
                            {{
                                convocation.grouping_mode === 'per_parallel'
                                    ? 'Un sílabo por paralelo'
                                    : 'Un sílabo por oferta'
                            }}
                        </div>
                    </div>
                    <div>
                        <div class="font-medium">Plantilla</div>
                        <div class="text-muted-foreground">
                            {{ convocation.template }}
                        </div>
                    </div>
                    <div>
                        <div class="font-medium">Fuentes</div>
                        <ul
                            class="mt-1 flex list-disc flex-col gap-1 pl-5 text-muted-foreground"
                        >
                            <li
                                v-for="source in convocation.sources"
                                :key="source"
                            >
                                {{ source }}
                            </li>
                        </ul>
                    </div>
                </CardContent>
            </Card>
        </div>
    </PageFrame>
</template>
