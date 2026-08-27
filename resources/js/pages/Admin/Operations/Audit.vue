<script setup lang="ts">
import { Head, router } from '@inertiajs/vue3';
import { ScrollText } from '@lucide/vue';
import { ref } from 'vue';
import AuditEventController from '@/actions/App/Modules/Operations/Presentation/Http/Controllers/AuditEventController';
import FilterToolbar from '@/components/domain/FilterToolbar.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { index as auditIndex } from '@/routes/admin/audit';
import type { Paginated } from '@/types/pagination';

type Detail = { label: string; value: string | number | boolean };
type Option = { value: string; label: string };

type AuditEvent = {
    id: string;
    action: string;
    resource: string;
    result: string;
    actor: string;
    role: string | null;
    career: string | null;
    details: Detail[];
    occurred_at: string;
};

const props = defineProps<{
    filters: {
        action: string;
        result: string;
        search: string;
        from: string;
        to: string;
    };
    action_options: Option[];
    events: Paginated<AuditEvent>;
}>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Auditoría', href: auditIndex() }] },
});

const action = ref(props.filters.action || 'all');
const result = ref(props.filters.result || 'all');
const search = ref(props.filters.search);
const from = ref(props.filters.from);
const to = ref(props.filters.to);

const applyFilters = (): void => {
    router.get(
        AuditEventController.index.url(),
        {
            action: action.value === 'all' ? undefined : action.value,
            result: result.value === 'all' ? undefined : result.value,
            search: search.value || undefined,
            from: from.value || undefined,
            to: to.value || undefined,
        },
        { preserveState: true, preserveScroll: true, replace: true },
    );
};

const formatDate = (value: string): string =>
    new Intl.DateTimeFormat('es-EC', {
        dateStyle: 'medium',
        timeStyle: 'medium',
    }).format(new Date(value));

const detailValue = (value: Detail['value']): string => {
    if (typeof value === 'boolean') {
        return value ? 'Sí' : 'No';
    }

    return String(value);
};
</script>

<template>
    <Head title="Auditoría" />
    <PageFrame
        :icon="ScrollText"
        title="Auditoría"
        description="Registro append-only de acciones críticas, sin contenido de sílabos, secretos ni identificadores internos visibles."
    >
        <Card>
            <CardContent class="flex flex-col gap-4">
                <form @submit.prevent="applyFilters">
                    <FilterToolbar>
                        <template #search>
                            <Field>
                                <FieldLabel for="audit-search" class="sr-only">
                                    Buscar actor o acción
                                </FieldLabel>
                                <Input
                                    id="audit-search"
                                    v-model="search"
                                    type="search"
                                    placeholder="Buscar actor o acción"
                                />
                            </Field>
                        </template>
                        <template #filters>
                            <Field>
                                <FieldLabel for="audit-action" class="sr-only">
                                    Acción
                                </FieldLabel>
                                <Select v-model="action">
                                    <SelectTrigger id="audit-action">
                                        <SelectValue
                                            placeholder="Todas las acciones"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all">
                                                Todas las acciones
                                            </SelectItem>
                                            <SelectItem
                                                v-for="option in action_options"
                                                :key="option.value"
                                                :value="option.value"
                                            >
                                                {{ option.label }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field>
                                <FieldLabel for="audit-result" class="sr-only">
                                    Resultado
                                </FieldLabel>
                                <Select v-model="result">
                                    <SelectTrigger id="audit-result">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all">
                                                Todos los resultados
                                            </SelectItem>
                                            <SelectItem value="success">
                                                Correcto
                                            </SelectItem>
                                            <SelectItem value="failed">
                                                Fallido
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <!--
                                Estos dos rótulos sí se ven. Los desplegables se explican
                                solos con su texto —«Todas las acciones»—, pero un campo de
                                fecha vacío solo muestra «dd/mm/aaaa»: dos iguales seguidos
                                no dicen cuál abre el intervalo y cuál lo cierra.
                            -->
                            <Field>
                                <FieldLabel
                                    for="audit-from"
                                    class="text-xs text-muted-foreground"
                                >
                                    Fecha inicial
                                </FieldLabel>
                                <Input
                                    id="audit-from"
                                    v-model="from"
                                    type="date"
                                />
                            </Field>
                            <Field>
                                <FieldLabel
                                    for="audit-to"
                                    class="text-xs text-muted-foreground"
                                >
                                    Fecha final
                                </FieldLabel>
                                <Input id="audit-to" v-model="to" type="date" />
                            </Field>
                        </template>
                    </FilterToolbar>
                </form>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Actor y rol</TableHead>
                            <TableHead>Acción</TableHead>
                            <TableHead>Recurso</TableHead>
                            <TableHead>Resultado</TableHead>
                            <TableHead>Detalles seguros</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow v-for="event in events.data" :key="event.id">
                            <TableCell class="text-xs whitespace-nowrap">
                                {{ formatDate(event.occurred_at) }}
                            </TableCell>
                            <TableCell>
                                <div class="font-medium">{{ event.actor }}</div>
                                <div class="text-xs text-muted-foreground">
                                    {{
                                        [event.role, event.career]
                                            .filter(Boolean)
                                            .join(' · ') ||
                                        'Proceso del sistema'
                                    }}
                                </div>
                            </TableCell>
                            <TableCell class="font-medium">{{
                                event.action
                            }}</TableCell>
                            <TableCell>{{ event.resource }}</TableCell>
                            <TableCell>
                                <Badge
                                    :variant="
                                        event.result === 'failed'
                                            ? 'destructive'
                                            : 'outline'
                                    "
                                >
                                    {{
                                        event.result === 'failed'
                                            ? 'Fallido'
                                            : 'Correcto'
                                    }}
                                </Badge>
                            </TableCell>
                            <TableCell class="max-w-md">
                                <dl
                                    v-if="event.details.length > 0"
                                    class="flex flex-col gap-1 text-xs"
                                >
                                    <div
                                        v-for="detail in event.details"
                                        :key="detail.label"
                                        class="flex gap-1"
                                    >
                                        <dt class="font-medium">
                                            {{ detail.label }}:
                                        </dt>
                                        <dd class="break-words">
                                            {{ detailValue(detail.value) }}
                                        </dd>
                                    </div>
                                </dl>
                                <span
                                    v-else
                                    class="text-xs text-muted-foreground"
                                    >Sin detalles adicionales</span
                                >
                            </TableCell>
                        </TableRow>
                        <TableRow v-if="events.data.length === 0">
                            <TableCell
                                colspan="6"
                                class="py-10 text-center text-muted-foreground"
                            >
                                No hay eventos para los filtros actuales.
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
                <TablePagination
                    :meta="events"
                    label="Paginación de eventos de auditoría"
                />
            </CardContent>
        </Card>
    </PageFrame>
</template>
