<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { BookOpenCheck, ChevronRight } from '@lucide/vue';
import SyllabusController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/SyllabusController';
import PageFrame from '@/components/domain/PageFrame.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableEmpty,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { index as syllabiIndex } from '@/routes/syllabi';
import type { Paginated } from '@/types/pagination';

type SyllabusRow = {
    id: string;
    subject: string;
    code: string;
    convocation: string;
    period: string;
    state: string;
    completion: number;
    parallels: string[];
    saved_at: string | null;
};

defineProps<{
    syllabi: Paginated<SyllabusRow>;
}>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Mis sílabos', href: syllabiIndex() }] },
});

const stateLabel = (state: string): string =>
    ({
        not_started: 'Sin iniciar',
        draft: 'Borrador',
        in_review: 'En revisión',
        correction_requested: 'Corrección solicitada',
        approved: 'Aprobado',
    })[state] ?? state;

const formatSavedAt = (value: string | null): string =>
    value
        ? new Intl.DateTimeFormat('es-EC', {
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(value))
        : 'Sin guardados';
</script>

<template>
    <Head title="Mis sílabos" />
    <PageFrame
        :icon="BookOpenCheck"
        title="Mis sílabos"
        description="Expedientes donde su asignación docente continúa vigente."
    >
        <Card>
            <CardContent class="flex flex-col gap-4">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Asignatura</TableHead>
                            <TableHead>Convocatoria</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Último guardado</TableHead>
                            <TableHead class="text-right">Avance</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableEmpty
                            v-if="syllabi.data.length === 0"
                            :colspan="5"
                        >
                            No tiene sílabos asignados con este rol.
                        </TableEmpty>
                        <TableRow
                            v-for="syllabus in syllabi.data"
                            v-else
                            :key="syllabus.id"
                        >
                            <TableCell>
                                <Button
                                    as-child
                                    variant="link"
                                    class="h-auto px-0"
                                >
                                    <Link
                                        :href="
                                            SyllabusController.show(syllabus.id)
                                        "
                                    >
                                        {{ syllabus.subject }}
                                        <ChevronRight aria-hidden="true" />
                                    </Link>
                                </Button>
                                <div class="text-sm text-muted-foreground">
                                    {{ syllabus.code }} · Paralelo(s)
                                    {{ syllabus.parallels.join(', ') }}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div>{{ syllabus.convocation }}</div>
                                <div class="text-sm text-muted-foreground">
                                    {{ syllabus.period }}
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge
                                    :variant="
                                        syllabus.state === 'draft'
                                            ? 'secondary'
                                            : 'outline'
                                    "
                                >
                                    {{ stateLabel(syllabus.state) }}
                                </Badge>
                            </TableCell>
                            <TableCell>{{
                                formatSavedAt(syllabus.saved_at)
                            }}</TableCell>
                            <TableCell class="text-right font-medium">
                                {{ syllabus.completion.toFixed(0) }} %
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>

                <TablePagination
                    :meta="syllabi"
                    label="Paginación de sílabos asignados"
                />
            </CardContent>
        </Card>
    </PageFrame>
</template>
