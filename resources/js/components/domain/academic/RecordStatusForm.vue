<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Archive, ArchiveRestore } from '@lucide/vue';
import { computed } from 'vue';
import AcademicGovernanceController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/AcademicGovernanceController';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';

const props = withDefaults(
    defineProps<{
        scope: 'governance' | 'career';
        entity: string;
        recordId: string;
        active: boolean;
        display?: 'button' | 'menu';
    }>(),
    {
        display: 'button',
    },
);

const actionLabel = computed(() => {
    if (props.entity === 'curriculum') {
        return props.active ? 'Deshabilitar' : 'Reactivar';
    }

    return props.active ? 'Archivar' : 'Reactivar';
});
</script>

<template>
    <Form
        v-bind="
            scope === 'governance'
                ? AcademicGovernanceController.setStatus.form({
                      entity,
                      record: recordId,
                  })
                : CareerAcademicStructureController.setStatus.form({
                      entity,
                      record: recordId,
                  })
        "
        v-slot="{ errors, processing, submit }"
    >
        <input type="hidden" name="active" :value="active ? '0' : '1'" />
        <DropdownMenuItem
            v-if="display === 'menu'"
            :disabled="processing"
            :variant="active ? 'destructive' : 'default'"
            @select="submit()"
        >
            <Spinner v-if="processing" />
            <Archive v-else-if="active" aria-hidden="true" />
            <ArchiveRestore v-else aria-hidden="true" />
            {{ actionLabel }}
        </DropdownMenuItem>
        <Button
            v-else
            type="submit"
            size="sm"
            variant="outline"
            :disabled="processing"
        >
            <Spinner v-if="processing" data-icon="inline-start" />
            {{ actionLabel }}
        </Button>
        <DropdownMenuItem
            v-if="display === 'menu' && errors.record"
            disabled
            variant="destructive"
        >
            {{ errors.record }}
        </DropdownMenuItem>
        <p
            v-else-if="errors.record"
            class="mt-2 max-w-64 text-sm text-destructive"
        >
            {{ errors.record }}
        </p>
    </Form>
</template>
