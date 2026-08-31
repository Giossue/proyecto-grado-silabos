<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { BookOpenCheck, FileCheck2, ShieldCheck } from '@lucide/vue';
import AppearanceToggle from '@/components/AppearanceToggle.vue';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { dashboard, login } from '@/routes';
</script>

<template>
    <Head title="Gestión de sílabos" />

    <main class="min-h-screen bg-background px-6 py-10 text-foreground">
        <div
            class="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col gap-10"
        >
            <header class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <div
                        class="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"
                    >
                        <BookOpenCheck aria-hidden="true" />
                    </div>
                    <div>
                        <p class="font-semibold">Sílabos UEB</p>
                        <p class="text-sm text-muted-foreground">
                            Carrera de Software
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <AppearanceToggle />
                    <Button as-child>
                        <Link
                            :href="
                                $page.props.auth.user ? dashboard() : login()
                            "
                        >
                            {{
                                $page.props.auth.user
                                    ? 'Ir al panel'
                                    : 'Iniciar sesión'
                            }}
                        </Link>
                    </Button>
                </div>
            </header>

            <section
                class="grid flex-1 items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]"
            >
                <div class="flex flex-col gap-6">
                    <div class="flex flex-col gap-3">
                        <p class="text-sm font-medium text-muted-foreground">
                            Gestión académica trazable
                        </p>
                        <h1
                            class="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl"
                        >
                            Un solo lugar para elaborar, revisar y aprobar
                            sílabos.
                        </h1>
                        <p
                            class="max-w-2xl text-lg leading-8 text-muted-foreground"
                        >
                            El sistema conserva cada revisión, centraliza las
                            observaciones y genera documentos desde el contenido
                            aprobado.
                        </p>
                    </div>

                    <div class="grid gap-3 sm:grid-cols-2">
                        <div
                            class="flex items-start gap-3 rounded-lg border p-4"
                        >
                            <FileCheck2 aria-hidden="true" />
                            <div>
                                <p class="font-medium">Historial verificable</p>
                                <p class="text-sm text-muted-foreground">
                                    Las revisiones enviadas y aprobadas se
                                    conservan en el historial.
                                </p>
                            </div>
                        </div>
                        <div
                            class="flex items-start gap-3 rounded-lg border p-4"
                        >
                            <ShieldCheck aria-hidden="true" />
                            <div>
                                <p class="font-medium">Acceso por alcance</p>
                                <p class="text-sm text-muted-foreground">
                                    Cada acción se autoriza según rol, alcance y
                                    asignación.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Acceso institucional</CardTitle>
                        <CardDescription>
                            Las cuentas son administradas por la institución. El
                            autorregistro está deshabilitado.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button class="w-full" as-child>
                            <Link
                                :href="
                                    $page.props.auth.user
                                        ? dashboard()
                                        : login()
                                "
                            >
                                {{
                                    $page.props.auth.user
                                        ? 'Continuar al panel'
                                        : 'Ingresar con mi cuenta'
                                }}
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </section>

            <footer class="border-t pt-6 text-sm text-muted-foreground">
                Universidad Estatal de Bolívar · Carrera de Software
            </footer>
        </div>
    </main>
</template>
