<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
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
import { Field, FieldLabel } from '@/components/ui/field';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableEmpty,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useClientFilter } from '@/composables/useClientFilter';
import { useClientPagination } from '@/composables/useClientPagination';
import { index as convocationsIndex } from '@/routes/convocations';

const props = defineProps<{
    convocation: {
        id: string;
        name: string;
        state: string;
        process: { name: string; state: string };
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
        sin_iniciar: 'Sin iniciar',
        borrador: 'Borrador',
        en_revision: 'En revisión',
        correccion_solicitada: 'Corrección solicitada',
        aprobado: 'Aprobado',
    })[state] ?? 'Estado no disponible';

const convocationStateLabel = (state: string): string =>
    ({
        preparacion: 'En preparación',
        abierta: 'Abierta',
        pausada: 'En pausa',
        cerrada: 'Cerrada',
    })[state] ?? 'Estado no disponible';

const formatDate = (value: string | null): string =>
    value
        ? new Intl.DateTimeFormat('es-EC', {
              dateStyle: 'long',
          }).format(new Date(value))
        : 'Sin fecha';

const formattedStart = formatDate(props.convocation.start_date);
const formattedDeadline = formatDate(props.convocation.draft_deadline);
const syllabusFilter = useClientFilter(
    () => props.convocation.syllabi,
    (item) => [item.subject, item.code, item.state],
    {
        // Un expediente no se archiva: recorre los estados de su ciclo.
        estado: {
            matches: (item, value) => item.state === value,
        },
    },
);

const {
    items: syllabusPage,
    meta: syllabusMeta,
    setPage: setSyllabusPage,
} = useClientPagination(() => syllabusFilter.items.value);
</script>

<template>
    <Head :title="convocation.name" />
    <PageFrame
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
                    convocation.state === 'abierta' ? 'secondary' : 'outline'
                "
            >
                {{ convocationStateLabel(convocation.state) }}
            </Badge>
            <Badge variant="outline">
                {{ convocation.process.name }}
            </Badge>
        </template>
        <Alert v-if="convocation.state === 'preparacion'">
            <AlertTitle>Revise antes de abrir</AlertTitle>
            <AlertDescription>
                La apertura fija la plantilla del proceso y estas fuentes,
                valida que cada paralelo tenga docente vigente y genera todos
                los expedientes en una sola transacción. Si algo falta, no se
                crea ninguno.
                {{
                    convocation.process.state !== 'abierto'
                        ? ' Solo podrá abrir cuando Administración abra el proceso institucional.'
                        : ''
                }}
            </AlertDescription>
        </Alert>
        <Alert v-else-if="convocation.state === 'pausada'">
            <AlertTitle>Convocatoria en pausa</AlertTitle>
            <AlertDescription>
                Los docentes de su carrera no editan ni envían hasta que la
                reanude. Mientras tanto puede corregir la malla y las fuentes.
            </AlertDescription>
        </Alert>
        <Alert v-else-if="convocation.process.state === 'pausado'">
            <AlertTitle>Proceso institucional en pausa</AlertTitle>
            <AlertDescription>
                Administración pausó «{{ convocation.process.name }}». Nadie
                envía hasta que lo reanude; su convocatoria seguirá abierta
                cuando eso ocurra.
            </AlertDescription>
        </Alert>
        <Alert v-else-if="convocation.process.state === 'cerrado'">
            <AlertTitle>Proceso institucional cerrado</AlertTitle>
            <AlertDescription>
                Administración cerró «{{ convocation.process.name }}». Los
                expedientes se conservan, pero ya no admiten envíos.
            </AlertDescription>
        </Alert>

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
                    <ClientFilterBar
                        :filter="syllabusFilter"
                        input-id="convocation-syllabi-search"
                        label="Buscar expediente"
                        placeholder="Buscar por asignatura o código"
                    >
                        <template #filters>
                            <Field>
                                <FieldLabel
                                    for="convocation-syllabi-search-state"
                                    class="sr-only"
                                    >Estado</FieldLabel
                                >
                                <Select
                                    v-model="syllabusFilter.values.estado.value"
                                >
                                    <SelectTrigger
                                        id="convocation-syllabi-search-state"
                                    >
                                        <SelectValue
                                            placeholder="Todos los estados"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all"
                                                >Todos los estados</SelectItem
                                            >
                                            <SelectItem value="sin_iniciar"
                                                >Sin iniciar</SelectItem
                                            >
                                            <SelectItem value="borrador"
                                                >Borrador</SelectItem
                                            >
                                            <SelectItem value="en_revision"
                                                >En revisión</SelectItem
                                            >
                                            <SelectItem value="aprobado"
                                                >Aprobado</SelectItem
                                            >
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </template>
                    </ClientFilterBar>
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
                                    <div>
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
                                    {{ stateLabel(syllabus.state) }}
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
                        <div class="font-medium">Proceso institucional</div>
                        <div class="text-muted-foreground">
                            {{ convocation.process.name }}
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
