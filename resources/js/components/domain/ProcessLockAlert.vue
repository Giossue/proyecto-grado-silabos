<script setup lang="ts">
import { Link, usePage } from '@inertiajs/vue3';
import { Lock } from '@lucide/vue';
import { computed } from 'vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { index as processesIndex } from '@/routes/admin/processes';
import { index as convocationsIndex } from '@/routes/convocations';

/*
 * Aviso de bloqueo por proceso o convocatoria en curso. La palabra «Convocatorias» del
 * mensaje lleva a la pantalla donde se pausa: la del rol activo.
 */
const props = defineProps<{
    title: string;
    reason: string;
}>();

const page = usePage();
const href = computed(() =>
    page.props.auth.roles.find(
        (role) => role.id === page.props.auth.active_role_id,
    )?.role === 'administrador'
        ? processesIndex()
        : convocationsIndex(),
);

const LINK_WORD = 'Convocatorias';
const parts = computed(() => {
    const index = props.reason.indexOf(LINK_WORD);

    return index === -1
        ? { before: props.reason, link: '', after: '' }
        : {
              before: props.reason.slice(0, index),
              link: LINK_WORD,
              after: props.reason.slice(index + LINK_WORD.length),
          };
});
</script>

<template>
    <Alert>
        <Lock aria-hidden="true" />
        <AlertTitle>{{ title }}</AlertTitle>
        <AlertDescription>
            <span>
                {{ parts.before
                }}<Link
                    v-if="parts.link"
                    :href="href"
                    class="font-medium text-foreground underline underline-offset-4"
                    >{{ parts.link }}</Link
                >{{ parts.after }}
            </span>
        </AlertDescription>
    </Alert>
</template>
