<?php

/**
 * Un par de tokens que se usan juntos —fondo y su texto— debe distinguirse en ambos
 * temas. En oscuro llegó a haber blanco sobre blanco: el logo del menú lateral quedaba
 * invisible y nada lo delataba, porque compila igual.
 */
function luminanciaDe(string $hsl): float
{
    $partes = preg_split('/[\s,]+/', trim(str_replace('%', '', $hsl)));
    [$h, $s, $l] = [(float) $partes[0], ((float) $partes[1]) / 100, ((float) $partes[2]) / 100];
    $c = (1 - abs(2 * $l - 1)) * $s;
    $x = $c * (1 - abs(fmod($h / 60, 2) - 1));
    $m = $l - $c / 2;
    $rgb = [[$c, $x, 0], [$x, $c, 0], [0, $c, $x], [0, $x, $c], [$x, 0, $c], [$c, 0, $x]][((int) floor($h / 60)) % 6];

    $canales = array_map(function (float $v) use ($m): float {
        $v += $m;

        return $v <= 0.03928 ? $v / 12.92 : (($v + 0.055) / 1.055) ** 2.4;
    }, $rgb);

    return 0.2126 * $canales[0] + 0.7152 * $canales[1] + 0.0722 * $canales[2];
}

function contrasteEntre(string $unTono, string $otroTono): float
{
    $a = luminanciaDe($unTono);
    $b = luminanciaDe($otroTono);

    return (max($a, $b) + 0.05) / (min($a, $b) + 0.05);
}

it('mantiene legible cada par de fondo y texto', function (string $tema): void {
    $css = (string) file_get_contents(dirname(__DIR__, 2).'/resources/css/app.css');
    preg_match('/'.preg_quote($tema, '/').' \{(.*?)\n\}/s', $css, $bloque);
    preg_match_all('/--([\w-]+):\s*hsl\(([^)]+)\)/', $bloque[1] ?? '', $pares, PREG_SET_ORDER);

    $tokens = [];
    foreach ($pares as [, $nombre, $valor]) {
        $tokens[$nombre] = $valor;
    }

    // Cada token que tiene su propio `-foreground` se dibuja con él encima.
    foreach ($tokens as $nombre => $valor) {
        if (! str_ends_with($nombre, '-foreground')) {
            continue;
        }
        $fondo = substr($nombre, 0, -strlen('-foreground'));
        if (! isset($tokens[$fondo])) {
            continue;
        }

        expect(contrasteEntre($tokens[$nombre], $tokens[$fondo]))->toBeGreaterThanOrEqual(
            4.5,
            "En {$tema} el par {$nombre} sobre {$fondo} no alcanza el contraste AA.",
        );
    }
})->with([':root', '.dark']);
