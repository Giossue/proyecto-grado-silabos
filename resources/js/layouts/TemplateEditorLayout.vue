<script setup lang="ts">
import PurgeConfirmationDialog from '@/components/domain/PurgeConfirmationDialog.vue';
import TemporaryPasswordDialog from '@/components/TemporaryPasswordDialog.vue';
import { Toaster } from '@/components/ui/sonner';
</script>

<template>
    <div class="min-h-dvh min-w-0 bg-muted/30 text-foreground">
        <slot />
    </div>
    <Toaster />
    <TemporaryPasswordDialog />
    <!-- La confirmación global también protege los cambios hechos desde el editor. -->
    <PurgeConfirmationDialog />
</template>
