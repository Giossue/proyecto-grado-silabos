import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { openNotification, type Notification } from '@/api/notifications';
import { toast } from '@/lib/toast';
import { sessionState } from '@/state/session';

export function useOpenNotification() {
    const router = useRouter();
    const opening = useRef<string | null>(null);
    const [openingId, setOpeningId] = useState<string | null>(null);

    const open = useCallback(async (notification: Notification): Promise<boolean> => {
        if (opening.current !== null) return false;
        opening.current = notification.id;
        setOpeningId(notification.id);
        try {
            const result = await openNotification(notification.id);
            notification.leido_en ??= new Date().toISOString();
            if (result.role_changed) await sessionState.load(true);
            if (!result.path) {
                toast.info(result.message ?? 'Este aviso no tiene una pantalla asociada');
                return false;
            }
            router.push(result.path);
            return true;
        } catch {
            toast.error('No se pudo abrir la notificación');
            return false;
        } finally {
            opening.current = null;
            setOpeningId(null);
        }
    }, [router]);

    return { open, openingId };
}
