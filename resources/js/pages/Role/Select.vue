<script setup lang="ts">
import { Form, Head, usePage } from '@inertiajs/vue3';
import { ArrowRight, Building2, CheckCircle2 } from '@lucide/vue';
import { computed } from 'vue';
import ActiveRoleController from '@/actions/App/Modules/Identity/Presentation/Http/Controllers/ActiveRoleController';
import PageFrame from '@/components/domain/PageFrame.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

const page = usePage();
const hasCoordinatorScope = computed(() =>
    page.props.auth.roles.some((role) => role.role === 'coordinador'),
);
const selectionDescription = computed(() =>
    hasCoordinatorScope.value
        ? 'Seleccione la carrera y el ámbito con el que trabajará en esta sesión.'
        : 'Seleccione el ámbito con el que trabajará en esta sesión.',
);

const actionLabel = (role: (typeof page.props.auth.roles)[number]): string => {
    if (page.props.auth.active_role_id === role.id) {
        return 'Continuar aquí';
    }

    return role.role === 'coordinador'
        ? 'Entrar a esta carrera'
        : `Entrar como ${role.role_name}`;
};
</script>

<template>
    <Head title="Seleccionar ámbito de trabajo" />

    <PageFrame
        :title="`Bienvenida, ${page.props.auth.user.nombre}`"
        :description="selectionDescription"
        size="wide"
    >
        <Alert v-if="page.props.auth.roles.length === 0">
            <AlertTitle>No tiene asignaciones vigentes</AlertTitle>
            <AlertDescription>
                Contáctese con el coordinador de la carrera.
            </AlertDescription>
        </Alert>

        <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card
                v-for="role in page.props.auth.roles"
                :key="role.id"
                class="transition-shadow hover:shadow-menu"
            >
                <CardHeader>
                    <CardTitle>
                        {{ role.career_name ?? role.role_name }}
                    </CardTitle>
                    <CardDescription>
                        {{
                            role.role === 'coordinador'
                                ? `Coordinación de ${role.career_name}`
                                : role.career_name
                                  ? `${role.role_name} · ${role.career_name}`
                                  : 'Administración general del sistema'
                        }}
                    </CardDescription>
                    <CardAction>
                        <Badge
                            v-if="page.props.auth.active_role_id === role.id"
                            variant="secondary"
                        >
                            <CheckCircle2 aria-hidden="true" />
                            Activo
                        </Badge>
                        <Badge v-else variant="outline">
                            {{ role.role_name }}
                        </Badge>
                    </CardAction>
                </CardHeader>
                <CardContent>
                    <div
                        class="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                        <Building2 aria-hidden="true" />
                        <span>{{
                            role.career_name ??
                            'Ámbito institucional sin carrera específica'
                        }}</span>
                    </div>
                </CardContent>
                <CardFooter>
                    <Form
                        v-bind="ActiveRoleController.store.form()"
                        v-slot="{ processing }"
                        class="w-full"
                    >
                        <input
                            type="hidden"
                            name="role_assignment_id"
                            :value="role.id"
                        />
                        <Button
                            class="w-full"
                            type="submit"
                            :disabled="processing"
                        >
                            <Spinner
                                v-if="processing"
                                data-icon="inline-start"
                            />
                            <ArrowRight
                                v-else
                                data-icon="inline-start"
                                aria-hidden="true"
                            />
                            {{ actionLabel(role) }}
                        </Button>
                    </Form>
                </CardFooter>
            </Card>
        </div>
    </PageFrame>
</template>
