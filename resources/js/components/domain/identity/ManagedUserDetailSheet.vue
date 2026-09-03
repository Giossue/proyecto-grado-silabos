<script setup lang="ts">
import { Eye } from '@lucide/vue';
import { computed } from 'vue';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';

export type ManagedUserRoleAssignment = {
    id: string;
    role_name: string;
    career_name: string | null;
    active: boolean;
};

export type ManagedUserRow = {
    id: string;
    nombre: string;
    correo_electronico: string;
    identity_document: string | null;
    active: boolean;
    /** Sigue con la contraseña temporal: la cuenta se creó y nadie la ha estrenado. */
    pending_first_login: boolean;
    created_at: string | null;
    deactivated_at: string | null;
    two_factor_enabled: boolean;
    valid_from: string | null;
    valid_until: string | null;
    roles: { name: string; career_name: string | null }[];
    /** Carreras en el mismo orden que los roles, para que ambas columnas casen fila a fila. */
    careers: (string | null)[];
    /** Vigentes y archivadas: el panel de lectura muestra el historial completo. */
    assignments: ManagedUserRoleAssignment[];
};

const props = defineProps<{
    user: ManagedUserRow;
}>();

const open = defineModel<boolean>('open', { default: false });

const formatDate = (value: string | null): string =>
    value === null
        ? '—'
        : new Intl.DateTimeFormat('es-EC', {
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(value));

const formatDay = (value: string | null, empty: string): string =>
    value === null
        ? empty
        : new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(
              new Date(`${value}T12:00:00`),
          );

const status = computed(() => {
    if (!props.user.active) {
        return {
            label: 'Inactivo',
            variant: 'outline' as const,
            hint: 'La cuenta está desactivada y no puede iniciar sesión.',
        };
    }

    if (props.user.pending_first_login) {
        return {
            label: 'Pendiente de activación',
            variant: 'default' as const,
            hint: 'La cuenta se creó y todavía nadie ha iniciado sesión con ella. Conserva su contraseña temporal.',
        };
    }

    return {
        label: 'Activo',
        variant: 'secondary' as const,
        hint: 'La cuenta está en uso y su titular ya definió su contraseña.',
    };
});

const scopeOf = (assignment: ManagedUserRoleAssignment): string =>
    // La administración gobierna todo el sistema, así que su rol no cuelga de una carrera.
    assignment.career_name ?? 'Todas las carreras';

const currentAssignments = computed(() =>
    props.user.assignments.filter((assignment) => assignment.active),
);
const archivedAssignments = computed(() =>
    props.user.assignments.filter((assignment) => !assignment.active),
);
</script>

<template>
    <Sheet v-model:open="open">
        <SheetContent side="right" class="w-full sm:max-w-lg">
            <SheetHeader>
                <SheetTitle>{{ props.user.nombre }}</SheetTitle>
                <SheetDescription>
                    Ficha de solo lectura de la cuenta. Para corregirla, use
                    «Editar» en el mismo menú.
                </SheetDescription>
            </SheetHeader>

            <!--
                El padding superior evita que el contenedor con scroll recorte el
                anillo (`ring-1`) de la primera tarjeta.
            -->
            <div class="flex flex-col gap-4 overflow-y-auto px-4 pt-1 pb-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Datos de la cuenta</CardTitle>
                        <CardDescription>{{ status.hint }}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <dl class="grid gap-3 text-sm">
                            <div class="flex flex-col gap-1">
                                <dt class="text-muted-foreground">Estado</dt>
                                <dd>
                                    <Badge :variant="status.variant">
                                        {{ status.label }}
                                    </Badge>
                                </dd>
                            </div>
                            <div class="flex flex-col gap-1">
                                <dt class="text-muted-foreground">
                                    Vigencia laboral
                                </dt>
                                <dd class="font-medium">
                                    {{
                                        formatDay(
                                            props.user.valid_from,
                                            'Sin fecha de inicio',
                                        )
                                    }}
                                    →
                                    {{
                                        formatDay(
                                            props.user.valid_until,
                                            'Sin fecha de fin',
                                        )
                                    }}
                                </dd>
                            </div>
                            <div class="flex flex-col gap-1">
                                <dt class="text-muted-foreground">
                                    Nombre completo
                                </dt>
                                <dd class="font-medium">
                                    {{ props.user.nombre }}
                                </dd>
                            </div>
                            <div class="flex flex-col gap-1">
                                <dt class="text-muted-foreground">
                                    Correo institucional
                                </dt>
                                <dd class="font-medium">
                                    {{ props.user.correo_electronico }}
                                </dd>
                            </div>
                            <div
                                v-if="props.user.identity_document"
                                class="flex flex-col gap-1"
                            >
                                <dt class="text-muted-foreground">Cédula</dt>
                                <dd class="font-medium">
                                    {{ props.user.identity_document }}
                                </dd>
                            </div>
                            <div class="flex flex-col gap-1">
                                <dt class="text-muted-foreground">
                                    Cuenta creada
                                </dt>
                                <dd class="font-medium">
                                    {{ formatDate(props.user.created_at) }}
                                </dd>
                            </div>
                            <div
                                v-if="props.user.deactivated_at"
                                class="flex flex-col gap-1"
                            >
                                <dt class="text-muted-foreground">
                                    Desactivada
                                </dt>
                                <dd class="font-medium">
                                    {{ formatDate(props.user.deactivated_at) }}
                                </dd>
                            </div>
                            <div class="flex flex-col gap-1">
                                <dt class="text-muted-foreground">
                                    Acceso en dos pasos
                                </dt>
                                <dd class="font-medium">
                                    {{
                                        props.user.two_factor_enabled
                                            ? 'Configurado por su titular'
                                            : 'Sin configurar'
                                    }}
                                </dd>
                            </div>
                        </dl>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Roles vigentes</CardTitle>
                        <CardDescription>
                            Cada rol dice qué puede hacer y sobre qué carrera.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p
                            v-if="currentAssignments.length === 0"
                            class="text-sm text-muted-foreground"
                        >
                            Sin rol vigente: la cuenta no accede a ningún
                            módulo.
                        </p>
                        <ul v-else class="flex flex-col gap-3 text-sm">
                            <li
                                v-for="assignment in currentAssignments"
                                :key="assignment.id"
                                class="flex flex-col gap-1"
                            >
                                <span class="font-medium">
                                    {{ assignment.role_name }}
                                </span>
                                <span class="text-muted-foreground">
                                    {{ scopeOf(assignment) }}
                                </span>
                            </li>
                        </ul>
                    </CardContent>
                </Card>

                <!-- Las asignaciones retiradas se conservan para trazabilidad. -->
                <Card v-if="archivedAssignments.length > 0">
                    <CardHeader>
                        <CardTitle>Roles archivados</CardTitle>
                        <CardDescription>
                            Asignaciones retiradas que se conservan como
                            historial.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul class="flex flex-col gap-3 text-sm">
                            <li
                                v-for="assignment in archivedAssignments"
                                :key="assignment.id"
                                class="flex flex-col gap-1"
                            >
                                <span class="font-medium">
                                    {{ assignment.role_name }}
                                </span>
                                <span class="text-muted-foreground">
                                    {{ scopeOf(assignment) }}
                                </span>
                            </li>
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </SheetContent>
    </Sheet>

    <!--
        La opción y el panel se declaran por separado: si el panel viviera dentro del
        elemento del menú, cerrar el menú lo desmontaría con la ficha abierta.
    -->
    <DropdownMenuItem
        @select="
            (event: Event) => {
                event.preventDefault();
                open = true;
            }
        "
    >
        <Eye aria-hidden="true" />
        Ver
    </DropdownMenuItem>
</template>
