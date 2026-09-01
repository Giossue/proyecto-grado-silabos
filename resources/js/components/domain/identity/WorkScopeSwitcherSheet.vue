<script setup lang="ts">
import { Form, usePage } from '@inertiajs/vue3';
import { ArrowRight, Building2, CheckCircle2 } from '@lucide/vue';
import { computed } from 'vue';
import ActiveRoleController from '@/actions/App/Modules/Identity/Presentation/Http/Controllers/ActiveRoleController';
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
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import type { ActiveRole } from '@/types';

const open = defineModel<boolean>('open', { default: false });
const page = usePage();
const activeRole = computed(() =>
    page.props.auth.roles.find(
        (role) => role.id === page.props.auth.active_role_id,
    ),
);
const coordinatorCareerCount = computed(
    () =>
        page.props.auth.roles.filter((role) => role.role === 'coordinador')
            .length,
);
const title = computed(() =>
    coordinatorCareerCount.value > 1
        ? 'Cambiar carrera'
        : 'Cambiar ámbito de trabajo',
);

const scopeName = (role: ActiveRole): string =>
    role.career_name ?? role.role_name;

const scopeDescription = (role: ActiveRole): string => {
    if (role.role === 'coordinador') {
        return `Coordinación de ${role.career_name}`;
    }

    return role.career_name
        ? `${role.role_name} · ${role.career_name}`
        : 'Administración general del sistema';
};
</script>

<template>
    <Sheet v-model:open="open">
        <SheetContent class="flex w-full flex-col sm:max-w-lg">
            <SheetHeader>
                <SheetTitle>{{ title }}</SheetTitle>
                <SheetDescription>
                    Elija una carrera o rol vigente. Todo el sistema cambiará al
                    nuevo alcance.
                </SheetDescription>
            </SheetHeader>

            <div class="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6">
                <Card v-for="role in page.props.auth.roles" :key="role.id">
                    <CardHeader>
                        <CardTitle>{{ scopeName(role) }}</CardTitle>
                        <CardDescription>
                            {{ scopeDescription(role) }}
                        </CardDescription>
                        <CardAction>
                            <Badge
                                v-if="activeRole?.id === role.id"
                                variant="secondary"
                            >
                                <CheckCircle2 aria-hidden="true" />
                                Actual
                            </Badge>
                            <Badge v-else variant="outline">
                                {{ role.role_name }}
                            </Badge>
                        </CardAction>
                    </CardHeader>
                    <CardContent>
                        <p
                            class="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                            <Building2 aria-hidden="true" />
                            {{
                                role.career_name ??
                                'Ámbito institucional sin carrera específica'
                            }}
                        </p>
                    </CardContent>
                    <CardFooter>
                        <Button
                            v-if="activeRole?.id === role.id"
                            type="button"
                            variant="secondary"
                            class="w-full"
                            disabled
                        >
                            Carrera o rol actual
                        </Button>
                        <Form
                            v-else
                            v-bind="ActiveRoleController.store.form()"
                            v-slot="{ processing }"
                            class="w-full"
                            @success="open = false"
                        >
                            <input
                                type="hidden"
                                name="role_assignment_id"
                                :value="role.id"
                            />
                            <Button
                                type="submit"
                                class="w-full"
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
                                Cambiar a {{ scopeName(role) }}
                            </Button>
                        </Form>
                    </CardFooter>
                </Card>
            </div>
        </SheetContent>
    </Sheet>
</template>
