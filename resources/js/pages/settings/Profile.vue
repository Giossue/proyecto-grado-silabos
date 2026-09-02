<script setup lang="ts">
import { Form, Head, usePage } from '@inertiajs/vue3';
import { Link } from '@inertiajs/vue3';
import { computed } from 'vue';
import ProfileController from '@/actions/App/Http/Controllers/Settings/ProfileController';
import Heading from '@/components/Heading.vue';
import InputError from '@/components/InputError.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { edit } from '@/routes/profile';
import { send } from '@/routes/verification';

defineOptions({
    layout: {
        breadcrumbs: [
            {
                title: 'Perfil',
                href: edit(),
            },
        ],
    },
});

const page = usePage();
const user = computed(() => page.props.auth.user);
const props = defineProps<{
    canEditIdentity: boolean;
}>();
</script>

<template>
    <Head title="Perfil" />

    <div class="flex flex-col space-y-6">
        <Heading
            variant="small"
            title="Perfil"
            :description="
                props.canEditIdentity
                    ? 'Actualice su nombre y correo electrónico'
                    : 'Consulte los datos de su cuenta'
            "
        />

        <Form
            v-if="props.canEditIdentity"
            v-bind="ProfileController.update.form()"
            class="space-y-6"
            v-slot="{ errors, processing }"
        >
            <div class="grid gap-2">
                <Label for="name" required>Nombre completo</Label>
                <Input
                    id="name"
                    class="mt-1 block w-full"
                    name="nombre"
                    :default-value="user.nombre"
                    required
                    autocomplete="name"
                    placeholder="Ej. María Pérez"
                />
                <InputError class="mt-2" :message="errors.nombre" />
            </div>

            <div class="grid gap-2">
                <Label for="email" required>Correo electrónico</Label>
                <Input
                    id="email"
                    type="email"
                    class="mt-1 block w-full"
                    name="correo_electronico"
                    :default-value="user.correo_electronico"
                    required
                    autocomplete="username"
                    placeholder="Ej. maria.perez@ueb.edu.ec"
                />
                <InputError class="mt-2" :message="errors.correo_electronico" />
            </div>

            <div
                v-if="page.props.mustVerifyEmail && !user.correo_verificado_en"
            >
                <p class="-mt-4 text-sm text-muted-foreground">
                    Su correo electrónico no está verificado.
                    <Link
                        :href="send()"
                        as="button"
                        class="text-foreground underline decoration-neutral-300 underline-offset-4 transition-colors duration-300 ease-out hover:decoration-current! dark:decoration-neutral-500"
                    >
                        Reenviar el correo de verificación.
                    </Link>
                </p>

                <div
                    v-if="page.props.status === 'verification-link-sent'"
                    class="mt-2 text-sm font-medium text-green-600"
                >
                    Se envió un nuevo enlace de verificación a su correo.
                </div>
            </div>

            <div class="flex items-center gap-4">
                <Button :disabled="processing" data-test="update-profile-button"
                    >Guardar</Button
                >
            </div>
        </Form>

        <div v-else class="space-y-6">
            <div class="grid gap-2">
                <Label for="readonly-name">Nombre completo</Label>
                <Input
                    id="readonly-name"
                    :model-value="user.nombre"
                    placeholder="Ej. María Pérez"
                    disabled
                    aria-describedby="identity-help"
                />
            </div>

            <div class="grid gap-2">
                <Label for="readonly-email">Correo electrónico</Label>
                <Input
                    id="readonly-email"
                    type="email"
                    :model-value="user.correo_electronico"
                    placeholder="Ej. maria.perez@ueb.edu.ec"
                    disabled
                    aria-describedby="identity-help"
                />
            </div>

            <p id="identity-help" class="text-sm text-muted-foreground">
                Si necesita corregir su nombre o correo, solicite el cambio a
                Administración.
            </p>
        </div>
    </div>
</template>
