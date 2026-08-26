<?php

/**
 * La plantilla pinta el fondo con un estilo en línea, antes de que llegue la hoja de
 * estilos, para que la página no destelle. Si ese valor deja de coincidir con
 * `--background`, el destello vuelve: el navegador pinta un color y lo cambia al cargar
 * el CSS. Ya ocurrió una vez, al reajustar los tokens de superficie.
 */
function fondoDelTema(string $selector): string
{
    $css = (string) file_get_contents(dirname(__DIR__, 2).'/resources/css/app.css');
    preg_match('/'.preg_quote($selector, '/').' \{(.*?)\n\}/s', $css, $bloque);
    preg_match('/--background:\s*([^;]+);/', $bloque[1] ?? '', $valor);

    return trim($valor[1] ?? '');
}

function fondoDeLaPlantilla(string $selector): string
{
    $blade = (string) file_get_contents(dirname(__DIR__, 2).'/resources/views/app.blade.php');
    preg_match(
        '/'.preg_quote($selector, '/').' \{\s*background-color:\s*([^;]+);/s',
        $blade,
        $valor,
    );

    return trim($valor[1] ?? '');
}

it('pinta el fondo inicial con el mismo color que el tema', function (string $selectorCss, string $selectorHtml): void {
    $tema = fondoDelTema($selectorCss);
    $plantilla = fondoDeLaPlantilla($selectorHtml);

    expect($tema)->not->toBe('', "No se encontró --background en {$selectorCss}.");
    expect($plantilla)->toBe(
        $tema,
        "El fondo de {$selectorHtml} en app.blade.php no coincide con --background de {$selectorCss}; la página destellará al cargar.",
    );
})->with([
    [':root', 'html'],
    ['.dark', 'html.dark'],
]);
