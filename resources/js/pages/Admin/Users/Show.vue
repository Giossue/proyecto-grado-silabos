<script setup lang="ts">
import { Form, Head, Link, usePage } from '@inertiajs/vue3';
import { UserRoundCog } from '@lucide/vue';
import ManagedUserController from '@/actions/App/Modules/Identity/Presentation/Http/Controllers/ManagedUserController';
import RoleAssignmentSheet from '@/components/domain/identity/RoleAssignmentSheet.vue';
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
import { index as usersIndex } from '@/routes/admin/users';

type Assignment = {
    id: string;
    role_name: string;
    career_name: string | null;
    valid_from: string;
    valid_until: string | null;
    active: boolean;
    effective: boolean;
};

const props = defineProps<{
    managedUser: {
        id: string;
        name: string;
        email: string;
        active: boolean;
        assignments: Assignment[];
    };
    roles: { codigo: string; nombre: string }[];
    careers: { id: string; nombre: string }[];
    today: string;
}>();
const {
    items: assignmentPage,
    meta: assignmentMeta,
    setPage: setAssignmentPage,
} = useClientPagination(() => props.managedUser.assignments);

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Usuarios', href: usersIndex() }],
    },
});

const page = usePage();
</script>

<template>
    <Head :title="managedUser.name" />

    <PageFrame
        :icon="UserRoundCog"
        :title="managedUser.name"
        :description="managedUser.email"
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
            <RoleAssignmentSheet
                :managed-user-id="managedUser.id"
                :roles="roles"
                :careers="careers"
                :today="today"
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
                ><CardTitle>Historial de roles y vigencias</CardTitle
                ><CardDescription
                    >Las asignaciones anteriores se conservan para
                    trazabilidad.</CardDescription
                ></CardHeader
            >
            <CardContent class="flex flex-col gap-4">
                <Table
                    ><TableHeader
                        ><TableRow
                            ><TableHead>Rol</TableHead
                            ><TableHead>Alcance</TableHead
                            ><TableHead>Vigencia</TableHead
                            ><TableHead>Estado efectivo</TableHead></TableRow
                        ></TableHeader
                    ><TableBody>
                        <TableEmpty
                            v-if="managedUser.assignments.length === 0"
                            :colspan="4"
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
                            ><TableCell
                                >{{ assignment.valid_from }} →
                                {{
                                    assignment.valid_until ?? 'Sin fecha de fin'
                                }}</TableCell
                            ><TableCell
                                ><Badge
                                    :variant="
                                        assignment.effective
                                            ? 'secondary'
                                            : 'outline'
                                    "
                                    >{{
                                        assignment.effective
                                            ? 'Vigente'
                                            : assignment.active
                                              ? 'Fuera de fecha'
                                              : 'Archivada'
                                    }}</Badge
                                ></TableCell
                            ></TableRow
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
