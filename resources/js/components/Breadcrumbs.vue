<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/types';

type Props = {
    breadcrumbs: BreadcrumbItemType[];
};

defineProps<Props>();
</script>

<template>
    <Breadcrumb>
        <BreadcrumbList>
            <template v-for="(item, index) in breadcrumbs" :key="index">
                <BreadcrumbItem>
                    <!--
                        La última miga es el nombre de la pantalla, así que es su
                        encabezado. Se dibuja como tal en vez de repetirlo escondido más
                        abajo: el texto que se ve y el que anuncia un lector de pantalla
                        son el mismo.
                    -->
                    <template
                        v-if="
                            index === breadcrumbs.length - 1 ||
                            item.href === undefined
                        "
                    >
                        <h1
                            data-slot="breadcrumb-page"
                            aria-current="page"
                            class="font-normal text-foreground"
                        >
                            {{ item.title }}
                        </h1>
                    </template>
                    <template v-else>
                        <BreadcrumbLink as-child>
                            <Link :href="item.href">{{ item.title }}</Link>
                        </BreadcrumbLink>
                    </template>
                </BreadcrumbItem>
                <BreadcrumbSeparator v-if="index !== breadcrumbs.length - 1" />
            </template>
        </BreadcrumbList>
    </Breadcrumb>
</template>
