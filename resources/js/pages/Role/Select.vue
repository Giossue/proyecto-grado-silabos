<script setup lang="ts">
import { Form, Head, usePage } from '@inertiajs/vue3';
import { Building2, CheckCircle2 } from '@lucide/vue';
import ActiveRoleController from '@/actions/App/Modules/Identity/Presentation/Http/Controllers/ActiveRoleController';
import PageFrame from '@/components/domain/PageFrame.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

const page = usePage();
</script>

<template>
    <Head title="Seleccionar rol" />

    <PageFrame
        title="Seleccione con qué rol va a trabajar"
        description=""
        size="narrow"
    >
        <Alert v-if="page.props.auth.roles.length === 0">
            <AlertTitle>No tiene asignaciones vigentes</AlertTitle>
            <AlertDescription>
                Solicite al administrador que revise su rol, alcance y fechas de
                vigencia.
            </AlertDescription>
        </Alert>

        <div v-else class="grid gap-4 md:grid-cols-2">
            <Card v-for="role in page.props.auth.roles" :key="role.id">
                <CardHeader>
                    <div class="flex items-start justify-between gap-3">
                        <div class="flex flex-col gap-1">
                            <CardTitle>{{ role.role_name }}</CardTitle>
                            <CardDescription>
                                {{
                                    role.career_name ?? 'Alcance institucional'
                                }}
                            </CardDescription>
                        </div>
                        <Badge
                            v-if="page.props.auth.active_role_id === role.id"
                            variant="secondary"
                        >
                            <CheckCircle2 aria-hidden="true" />
                            Activo
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <div
                        class="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                        <Building2 aria-hidden="true" />
                        <span>{{
                            role.career_name ??
                            'Administración general del sistema'
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
                            <Spinner v-if="processing" />
                            {{
                                page.props.auth.active_role_id === role.id
                                    ? 'Continuar con este rol'
                                    : 'Usar este rol'
                            }}
                        </Button>
                    </Form>
                </CardFooter>
            </Card>
        </div>
    </PageFrame>
</template>
