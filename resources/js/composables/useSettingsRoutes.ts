import { usePage } from '@inertiajs/vue3';
import { computed } from 'vue';
import { edit as adminAppearance } from '@/routes/admin/appearance';
import { edit as adminProfile } from '@/routes/admin/profile';
import { edit as adminSecurity } from '@/routes/admin/security';
import { edit as appearance } from '@/routes/appearance';
import { edit as coordinationAppearance } from '@/routes/coordination/appearance';
import { edit as coordinationProfile } from '@/routes/coordination/profile';
import { edit as coordinationSecurity } from '@/routes/coordination/security';
import { edit as profile } from '@/routes/profile';
import { edit as security } from '@/routes/security';
import { edit as teacherAppearance } from '@/routes/teacher/appearance';
import { edit as teacherProfile } from '@/routes/teacher/profile';
import { edit as teacherSecurity } from '@/routes/teacher/security';

/*
 * Configuración se abre en la copia del área del rol activo, para que la dirección diga
 * desde qué rol se está mirando. Sin rol elegido se usan las direcciones cortas.
 */
export function useSettingsRoutes() {
    const page = usePage();
    const role = computed(
        () =>
            page.props.auth.roles.find(
                (item) => item.id === page.props.auth.active_role_id,
            )?.role,
    );

    return {
        profile: computed(() => {
            switch (role.value) {
                case 'administrador':
                    return adminProfile();
                case 'coordinador':
                    return coordinationProfile();
                case 'docente':
                    return teacherProfile();
                default:
                    return profile();
            }
        }),
        security: computed(() => {
            switch (role.value) {
                case 'administrador':
                    return adminSecurity();
                case 'coordinador':
                    return coordinationSecurity();
                case 'docente':
                    return teacherSecurity();
                default:
                    return security();
            }
        }),
        appearance: computed(() => {
            switch (role.value) {
                case 'administrador':
                    return adminAppearance();
                case 'coordinador':
                    return coordinationAppearance();
                case 'docente':
                    return teacherAppearance();
                default:
                    return appearance();
            }
        }),
    };
}
