<script setup lang="ts">
import { Form, Head, Link } from '@inertiajs/vue3';
import { UserCheck, UserX } from '@lucide/vue';
import ManagedUserController from '@/actions/App/Modules/Identity/Presentation/Http/Controllers/ManagedUserController';
import FilterToolbar from '@/components/domain/FilterToolbar.vue';
import ManagedUserSheet from '@/components/domain/identity/ManagedUserSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
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
import { index as usersIndex } from '@/routes/admin/users';
import type { Paginated } from '@/types/pagination';

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Usuarios y roles', href: usersIndex() }],
    },
});

type ListedUser = {
    id: string;
    name: string;
    email: string;
    active: boolean;
    /** Sigue con la contraseña temporal: la cuenta se creó y nadie la ha estrenado. */
    pending_first_login: boolean;
    roles: { name: string; career_name: string | null }[];
    /** Carreras en el mismo orden que los roles, para que ambas columnas casen fila a fila. */
    careers: (string | null)[];
};

type UserStatus = {
    label: string;
    variant: 'secondary' | 'outline' | 'default';
    hint: string;
};

const statusOf = (user: ListedUser): UserStatus => {
    if (!user.active) {
        return {
            label: 'Inactivo',
            variant: 'outline',
            hint: 'La cuenta está desactivada y no puede iniciar sesión.',
        };
    }

    if (user.pending_first_login) {
        return {
            label: 'Sin estrenar',
            variant: 'default',
            hint: 'La cuenta se creó y todavía nadie ha iniciado sesión con ella. Conserva su contraseña temporal.',
        };
    }

    return {
        label: 'Activo',
        variant: 'secondary',
        hint: 'La cuenta está en uso y su titular ya definió su contraseña.',
    };
};

defineProps<{
    users: Paginated<ListedUser>;
    filters: {
        q: string | null;
        status: string | null;
        role: string | null;
        career: string | null;
    };
    roles: { codigo: string; nombre: string }[];
    careers: { id: string; nombre: string }[];
}>();
</script>

<template>
    <Head title="Usuarios y roles" />

    <PageFrame
        title="Usuarios y roles"
        description="Cuentas de coordinación y docencia: crearlas, decir de qué carrera son y hasta cuándo. Al desactivar una, su sesión se cierra."
    >
        <template #actions>
            <ManagedUserSheet :roles="roles" :careers="careers" />
        </template>

        <Card>
            <CardContent class="flex flex-col gap-4">
                <Form
                    v-bind="ManagedUserController.index.form()"
                    :options="{
                        preserveState: true,
                        preserveScroll: true,
                        replace: true,
                    }"
                >
                    <FilterToolbar>
                        <template #search>
                            <Field>
                                <FieldLabel for="users-search" class="sr-only">
                                    Buscar por nombre o correo
                                </FieldLabel>
                                <Input
                                    id="users-search"
                                    name="q"
                                    type="search"
                                    :default-value="filters.q ?? ''"
                                    placeholder="Buscar por nombre o correo"
                                />
                            </Field>
                        </template>
                        <template #filters>
                            <Field>
                                <FieldLabel for="users-role" class="sr-only">
                                    Rol
                                </FieldLabel>
                                <Select
                                    name="role"
                                    :default-value="filters.role ?? 'all'"
                                >
                                    <SelectTrigger id="users-role">
                                        <SelectValue
                                            placeholder="Todos los roles"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all">
                                                Todos los roles
                                            </SelectItem>
                                            <SelectItem
                                                v-for="role in roles"
                                                :key="role.codigo"
                                                :value="role.codigo"
                                            >
                                                {{ role.nombre }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>

                            <Field>
                                <FieldLabel for="users-career" class="sr-only">
                                    Carrera
                                </FieldLabel>
                                <Select
                                    name="career"
                                    :default-value="filters.career ?? 'all'"
                                >
                                    <SelectTrigger id="users-career">
                                        <SelectValue
                                            placeholder="Todas las carreras"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all">
                                                Todas las carreras
                                            </SelectItem>
                                            <SelectItem
                                                v-for="career in careers"
                                                :key="career.id"
                                                :value="career.id"
                                            >
                                                {{ career.nombre }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>

                            <Field>
                                <FieldLabel for="users-status" class="sr-only">
                                    Estado
                                </FieldLabel>
                                <Select
                                    name="status"
                                    :default-value="filters.status ?? 'all'"
                                >
                                    <SelectTrigger id="users-status">
                                        <SelectValue
                                            placeholder="Todos los estados"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all">
                                                Todos los estados
                                            </SelectItem>
                                            <SelectItem value="active">
                                                Activos
                                            </SelectItem>
                                            <SelectItem value="pending">
                                                Sin estrenar
                                            </SelectItem>
                                            <SelectItem value="inactive">
                                                Inactivos
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </template>
                    </FilterToolbar>
                </Form>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Persona</TableHead>
                            <TableHead>Rol vigente</TableHead>
                            <TableHead>Carrera</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead class="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableEmpty v-if="users.data.length === 0" :colspan="5">
                            No se encontraron cuentas con estos filtros.
                        </TableEmpty>
                        <TableRow
                            v-for="user in users.data"
                            v-else
                            :key="user.id"
                        >
                            <TableCell>
                                <div class="flex flex-col">
                                    <Link
                                        :href="
                                            ManagedUserController.show(user.id)
                                        "
                                        class="font-medium underline-offset-4 hover:underline"
                                        >{{ user.name }}</Link
                                    >
                                    <span
                                        class="text-sm text-muted-foreground"
                                        >{{ user.email }}</span
                                    >
                                </div>
                            </TableCell>
                            <!--
                                Rol y carrera en columnas distintas, apiladas en el mismo
                                orden: quien tenga dos roles ve cada uno frente a su
                                carrera, y ambas columnas se pueden filtrar por separado.
                            -->
                            <TableCell>
                                <div class="flex flex-col items-start gap-1">
                                    <span
                                        v-for="(role, index) in user.roles"
                                        :key="`rol-${index}`"
                                        >{{ role.name }}</span
                                    >
                                    <span
                                        v-if="user.roles.length === 0"
                                        class="text-sm text-muted-foreground"
                                        >Sin rol vigente</span
                                    >
                                </div>
                            </TableCell>
                            <TableCell>
                                <div
                                    class="flex flex-col items-start gap-1 text-sm"
                                >
                                    <span
                                        v-for="(career, index) in user.careers"
                                        :key="`carrera-${index}`"
                                        :class="
                                            career
                                                ? ''
                                                : 'text-muted-foreground'
                                        "
                                    >
                                        <!-- La administración gobierna todo el sistema,
                                             así que su rol no cuelga de una carrera. -->
                                        {{ career ?? 'Todas las carreras' }}
                                    </span>
                                    <span
                                        v-if="user.careers.length === 0"
                                        class="text-muted-foreground"
                                        >—</span
                                    >
                                </div>
                            </TableCell>
                            <TableCell>
                                <!--
                                    Tres estados, no dos. Una cuenta recién creada está
                                    activa pero nadie ha entrado con ella todavía, y eso
                                    cambia a quién hay que recordarle que mire su correo.
                                -->
                                <span :title="statusOf(user).hint">{{
                                    statusOf(user).label
                                }}</span>
                            </TableCell>
                            <TableCell class="text-right">
                                <TableActionsMenu
                                    :label="`Acciones para ${user.name}`"
                                >
                                    <Form
                                        v-bind="
                                            ManagedUserController.setStatus.form(
                                                user.id,
                                            )
                                        "
                                        v-slot="{ processing, submit }"
                                    >
                                        <input
                                            type="hidden"
                                            name="active"
                                            :value="user.active ? '0' : '1'"
                                        />
                                        <DropdownMenuItem
                                            :disabled="processing"
                                            :variant="
                                                user.active
                                                    ? 'destructive'
                                                    : 'default'
                                            "
                                            @select="submit()"
                                        >
                                            <Spinner v-if="processing" />
                                            <UserX
                                                v-else-if="user.active"
                                                aria-hidden="true"
                                            />
                                            <UserCheck
                                                v-else
                                                aria-hidden="true"
                                            />
                                            {{
                                                user.active
                                                    ? 'Desactivar cuenta'
                                                    : 'Activar cuenta'
                                            }}
                                        </DropdownMenuItem>
                                    </Form>
                                </TableActionsMenu>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>

                <TablePagination :meta="users" label="Paginación de usuarios" />
            </CardContent>
        </Card>
    </PageFrame>
</template>
