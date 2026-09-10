<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { ChevronDown, UserPlus } from '@lucide/vue';
import { ref } from 'vue';
import TeacherAssignmentSheet from '@/components/domain/academic/TeacherAssignmentSheet.vue';
import TeacherAssignmentsPanel from '@/components/domain/academic/TeacherAssignmentsPanel.vue';
import ManagedUserSheet from '@/components/domain/identity/ManagedUserSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import ProcessLockAlert from '@/components/domain/ProcessLockAlert.vue';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { index as teacherAssignmentsIndex } from '@/routes/coordination/academic/teacher-assignments';
import type { AcademicStructureProps } from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [
            {
                title: 'Asignación docente',
                href: teacherAssignmentsIndex(),
            },
        ],
    },
});

defineProps<
    Pick<
        AcademicStructureProps,
        'career' | 'teacherAssignments' | 'options'
    > & { canCreateTeacher: boolean }
>();

const createTeacherOpen = ref(false);
const assignTeacherOpen = ref(false);
</script>

<template>
    <Head title="Asignación docente" />

    <PageFrame
        title="Asignación docente"
        :description="`Quién dicta cada paralelo en ${career.name}.`"
    >
        <template #actions>
            <DropdownMenu v-if="canCreateTeacher || !career.lock_reason">
                <DropdownMenuTrigger as-child>
                    <Button>
                        <UserPlus data-icon="inline-start" aria-hidden="true" />
                        Gestionar docente
                        <ChevronDown
                            data-icon="inline-end"
                            aria-hidden="true"
                        />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                        <DropdownMenuItem
                            v-if="canCreateTeacher"
                            @select="createTeacherOpen = true"
                        >
                            Crear docente
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            v-if="!career.lock_reason"
                            @select="assignTeacherOpen = true"
                        >
                            Asignar docente
                        </DropdownMenuItem>
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>

            <ManagedUserSheet
                v-if="canCreateTeacher"
                :key="career.id"
                v-model:open="createTeacherOpen"
                :teacher-career="career"
                :show-trigger="false"
            />
            <TeacherAssignmentSheet
                v-if="!career.lock_reason"
                v-model:open="assignTeacherOpen"
                :options="options"
                :show-trigger="false"
            />
        </template>

        <ProcessLockAlert
            v-if="career.lock_reason"
            title="Asignaciones docentes bloqueadas"
            :reason="career.lock_reason"
        />

        <TeacherAssignmentsPanel
            :teacher-assignments="teacherAssignments"
            :options="options"
            :lock-reason="career.lock_reason"
        />
    </PageFrame>
</template>
