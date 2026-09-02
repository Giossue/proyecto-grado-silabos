<script setup lang="ts">
import { Form, Head, Link, usePage } from '@inertiajs/vue3';
import ManagedUserController from '@/actions/App/Modules/Identity/Presentation/Http/Controllers/ManagedUserController';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import RoleAssignmentSheet from '@/components/domain/identity/RoleAssignmentSheet.vue';
import UserProfileSheet from '@/components/domain/identity/UserProfileSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
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
import { useClientFilter } from '@/composables/useClientFilter';
import { useClientPagination } from '@/composables/useClientPagination';
import { index as usersIndex } from '@/routes/admin/users';

type Assignment = {
    id: string;
    role_name: string;
    career_name: string | null;
    active: boolean;
    effective: boolean;
};

const props = defineProps<{
    managedUser: {
        id: string;
        nombre: string;
        correo_electronico: string;
        active: boolean;
        assignments: Assignment[];
    };
    roles: { codigo: string; nombre: string }[];
    careers: { id: string; nombre: string }[];
}>();
const assignmentFilter = useClientFilter(
    () => props.managedUser.assignments,
    (item) => [item.role_name, item.career_name],
    {
        estado: {
            matches: (item, value) => item.effective === (value === 'active'),
        },
    },
);

const {
    items: assignmentPage,
    meta: assignmentMeta,
    setPage: setAssignmentPage,
} = useClientPagination(() => assignmentFilter.items.value);

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Usuarios', href: usersIndex() }],
    },
});

const page = usePage();
</script>

<template>
    <Head :title="managedUser.nombre" />

    <PageFrame
        :title="managedUser.nombre"
        :description="managedUser.correo_electronico"
    >
        <template #eyebrow>
            <Button as-child variant="link" class="h-auto px-0">
                <Link :href="usersIndex()">← Volver a usuarios</Link>
            </Button>
        </template>
        <template #meta>
            <Badge :variant="managedUser.active ? 'secondary' : 'outline'">
                {{ managedUser.active ? 'Cuenta activa' : 'Cuenta inactiva' }}
            </Badge>
        </template>
        <template #actions>
            <UserProfileSheet
                :user-id="managedUser.id"
                :nombre="managedUser.nombre"
                :correo_electronico="managedUser.correo_electronico"
            />
            <RoleAssignmentSheet
                :managed-user-id="managedUser.id"
                :roles="roles"
                :careers="careers"
            />
            <Form
                v-if="page.props.auth.user.id !== managedUser.id"
                v-bind="ManagedUserController.setStatus.form(managedUser.id)"
                v-slot="{ processing }"
            >
                <input
                    type="hidden"
                    name="active"
                    :value="managedUser.active ? '0' : '1'"
                />
                <Button type="submit" variant="outline" :disabled="processing"
                    ><Spinner v-if="processing" />{{
                        managedUser.active
                            ? 'Desactivar y revocar sesiones'
                            : 'Activar cuenta'
                    }}</Button
                >
            </Form>
        </template>

        <Card>
            <CardHeader
                ><CardTitle>Historial de roles</CardTitle
                ><CardDescription
                    >Las asignaciones anteriores se conservan para
                    trazabilidad.</CardDescription
                ></CardHeader
            >
            <CardContent class="flex flex-col gap-4">
                <ClientFilterBar
                    :filter="assignmentFilter"
                    input-id="user-assignments-search"
                    label="Buscar asignación de rol"
                    placeholder="Buscar por rol o carrera"
                >
                    <template #filters>
                        <Field>
                            <FieldLabel
                                for="user-assignments-search-state"
                                class="sr-only"
                                >Estado</FieldLabel
                            >
                            <Select
                                v-model="assignmentFilter.values.estado.value"
                            >
                                <SelectTrigger
                                    id="user-assignments-search-state"
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
                                        <SelectItem value="active"
                                            >Activos</SelectItem
                                        >
                                        <SelectItem value="inactive"
                                            >Archivados</SelectItem
                                        >
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </Field>
                    </template>
                </ClientFilterBar>
                <Table
                    ><TableHeader
                        ><TableRow
                            ><TableHead>Rol</TableHead
                            ><TableHead>Alcance</TableHead
                            ><TableHead>Estado efectivo</TableHead></TableRow
                        ></TableHeader
                    ><TableBody>
                        <TableEmpty
                            v-if="managedUser.assignments.length === 0"
                            :colspan="3"
                            >No existen asignaciones.</TableEmpty
                        >
                        <TableRow
                            v-for="assignment in assignmentPage"
                            v-else
                            :key="assignment.id"
                            ><TableCell class="font-medium">{{
                                assignment.role_name
                            }}</TableCell
                            ><TableCell>{{
                                assignment.career_name ?? 'Institucional'
                            }}</TableCell
                            ><TableCell>{{
                                assignment.active ? 'Activo' : 'Archivada'
                            }}</TableCell></TableRow
                        >
                    </TableBody></Table
                >
                <TablePagination
                    :meta="assignmentMeta"
                    mode="client"
                    label="Paginación del historial de roles"
                    @update:page="setAssignmentPage"
                />
            </CardContent>
        </Card>
    </PageFrame>
</template>
