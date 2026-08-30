<script setup lang="ts">
import { Form, Head, Link } from '@inertiajs/vue3';
import { Check, CheckCheck, ExternalLink } from '@lucide/vue';
import NotificationController from '@/actions/App/Modules/Operations/Presentation/Http/Controllers/NotificationController';
import PageFrame from '@/components/domain/PageFrame.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { index as notificationsIndex } from '@/routes/notifications';

type Notification = {
    id: string;
    type: string;
    title: string;
    message: string;
    read_at: string | null;
    created_at: string;
    resource_url: string | null;
};

type Pagination = {
    data: Notification[];
    links: { url: string | null; label: string; active: boolean }[];
    from: number | null;
    to: number | null;
    total: number;
};

defineProps<{
    filters: { status: 'all' | 'unread' };
    notifications: Pagination;
}>();

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Notificaciones', href: notificationsIndex() }],
    },
});

const formatDate = (value: string): string =>
    new Intl.DateTimeFormat('es-EC', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));

const paginationLabel = (value: string): string =>
    value
        .replace('&laquo; Previous', 'Anterior')
        .replace('Next &raquo;', 'Siguiente');
</script>

<template>
    <Head title="Notificaciones" />
    <PageFrame
        title="Notificaciones"
        description="Avisos de lo que va pasando con sus sílabos y sus documentos."
    >
        <template #actions>
            <Form
                v-if="notifications.data.some((item) => item.read_at === null)"
                v-bind="NotificationController.markAllRead.form()"
                v-slot="{ processing }"
            >
                <Button type="submit" variant="outline" :disabled="processing">
                    <Spinner v-if="processing" />
                    <CheckCheck v-else aria-hidden="true" />
                    Marcar todas como leídas
                </Button>
            </Form>
        </template>

        <nav class="flex gap-2" aria-label="Filtrar notificaciones">
            <Button
                as-child
                :variant="filters.status === 'all' ? 'default' : 'outline'"
            >
                <Link :href="notificationsIndex({ query: { status: 'all' } })">
                    Todas
                </Link>
            </Button>
            <Button
                as-child
                :variant="filters.status === 'unread' ? 'default' : 'outline'"
            >
                <Link
                    :href="notificationsIndex({ query: { status: 'unread' } })"
                >
                    No leídas
                </Link>
            </Button>
        </nav>

        <Card>
            <CardContent class="space-y-3" aria-live="polite">
                <article
                    v-for="notification in notifications.data"
                    :key="notification.id"
                    class="rounded-lg border p-4"
                    :class="notification.read_at === null ? 'bg-muted/40' : ''"
                >
                    <div
                        class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                                <h2 class="font-medium">
                                    {{ notification.title }}
                                </h2>
                                <Badge
                                    v-if="notification.read_at === null"
                                    variant="secondary"
                                >
                                    Nueva
                                </Badge>
                            </div>
                            <p class="mt-1 text-sm">
                                {{ notification.message }}
                            </p>
                            <p class="mt-2 text-xs text-muted-foreground">
                                {{ formatDate(notification.created_at) }}
                            </p>
                        </div>
                        <div class="flex shrink-0 flex-wrap gap-2">
                            <Form
                                v-if="notification.read_at === null"
                                v-bind="
                                    NotificationController.markRead.form(
                                        notification.id,
                                    )
                                "
                                v-slot="{ processing }"
                            >
                                <Button
                                    type="submit"
                                    size="sm"
                                    variant="outline"
                                    :disabled="processing"
                                >
                                    <Spinner v-if="processing" />
                                    <Check v-else aria-hidden="true" />
                                    Marcar leída
                                </Button>
                            </Form>
                            <Button
                                v-if="notification.resource_url"
                                as-child
                                size="sm"
                            >
                                <Link :href="notification.resource_url">
                                    <ExternalLink aria-hidden="true" />
                                    Abrir expediente
                                </Link>
                            </Button>
                        </div>
                    </div>
                </article>
                <div
                    v-if="notifications.data.length === 0"
                    class="py-12 text-center text-sm text-muted-foreground"
                >
                    No existen notificaciones.
                </div>
            </CardContent>
        </Card>

        <footer
            v-if="notifications.links.length > 3"
            class="flex flex-wrap gap-2"
        >
            <Button
                v-for="link in notifications.links"
                :key="link.label"
                as-child
                size="sm"
                :variant="link.active ? 'default' : 'outline'"
                :disabled="link.url === null"
            >
                <Link v-if="link.url" :href="link.url" preserve-scroll>
                    {{ paginationLabel(link.label) }}
                </Link>
                <span v-else>{{ paginationLabel(link.label) }}</span>
            </Button>
        </footer>
    </PageFrame>
</template>
