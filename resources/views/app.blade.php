<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" @class(['dark' => ($appearance ?? 'light') === 'dark'])>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">

        {{-- El tema sale de la cookie `appearance` (claro u oscuro). No se consulta la
             preferencia del sistema operativo: sin cookie, la página arranca en claro. --}}

        {{-- Pinta el fondo antes de que cargue la hoja de estilos. Estos valores deben
             coincidir con --background de resources/css/app.css: si se separan, la
             página destella al cambiar de color. `ThemeBackgroundSyncTest` lo verifica. --}}
        <style>
            html {
                background-color: hsl(0 0% 98%);
            }

            html.dark {
                background-color: hsl(0 0% 3.9%);
            }
        </style>

        <link rel="icon" href="/favicon.ico" sizes="any">
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">

        @fonts

        @vite(['resources/css/app.css', 'resources/js/app.ts', "resources/js/pages/{$page['component']}.vue"])
        <x-inertia::head>
            <title>{{ config('app.name', 'Laravel') }}</title>
        </x-inertia::head>
    </head>
    <body class="font-sans antialiased">
        <x-inertia::app />
    </body>
</html>
