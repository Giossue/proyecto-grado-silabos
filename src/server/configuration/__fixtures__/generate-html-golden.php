<?php

$backend = $argv[1] ?? '';
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Modules\Configuration\Domain\DocumentHtml;

$cases = [];
$official = json_decode(file_get_contents($backend.'/resources/templates/silabo-oficial.json'), true);
foreach ($official['sections'] as $section) {
    foreach ($section['fields'] ?? [] as $field) {
        if (! is_array($field['content']) || array_is_list($field['content'])) {
            $cases[] = [$field['content'], false];
        }
    }
}
foreach ($official['blocks'] ?? [] as $block) {
    if (isset($block['layout'])) {
        $cases[] = [$block['layout'], true];
    }
}
foreach (json_decode(<<<'JSON'
[["<p title=\"abc", false], ["<p title=\"abc", true], ["<p title='x", false], ["<p title='x", true], ["<p a=b c=d>t</p>", false], ["<p a=b c=d>t</p>", true], ["<p a = \"1\" b= 2 c =3 >t</p>", false], ["<p a = \"1\" b= 2 c =3 >t</p>", true], ["<p =x>t</p>", false], ["<p =x>t</p>", true], ["<p/ class=x/>t</p>", false], ["<p/ class=x/>t</p>", true], ["<span data-slot='{\"value\":\"a\"}'/>x", false], ["<span data-slot='{\"value\":\"a\"}'/>x", true], ["<p>a</body>b", false], ["<p>a</body>b", true], ["<body>x</body>y", false], ["<body>x</body>y", true], ["<html><p>x</p></html>", false], ["<html><p>x</p></html>", true], ["<head><p>x</p>", false], ["<head><p>x</p>", true], ["<p>x<head>y</head></p>", false], ["<p>x<head>y</head></p>", true], ["</p><p>a</p></div>", false], ["</p><p>a</p></div>", true], ["<div><p>a</div>b</p>", false], ["<div><p>a</div>b</p>", true], ["<table><tr><td>a<td>b<tr><th>c</table>", false], ["<table><tr><td>a<td>b<tr><th>c</table>", true], ["<table>x<tr><td>a</td></tr>y</table>", false], ["<table>x<tr><td>a</td></tr>y</table>", true], ["<table><tbody><tr><td><p>a</p><p style=\"text-align:right\">b</p></td></tr></tbody></table>", false], ["<table><tbody><tr><td><p>a</p><p style=\"text-align:right\">b</p></td></tr></tbody></table>", true], ["<ul><li>a<li>b</ul>", false], ["<ul><li>a<li>b</ul>", true], ["<ol><li><ul><li>x</li></ul></li></ol>", false], ["<ol><li><ul><li>x</li></ul></li></ol>", true], ["<ul>\n<li>a</li>\n</ul>", false], ["<ul>\n<li>a</li>\n</ul>", true], ["<p>a\r\nb\rc</p>", false], ["<p>a\r\nb\rc</p>", true], ["<p>a\u0000b</p>", false], ["<p>a\u0000b</p>", true], ["<p title=\"a\u0000b\r\nc\">x</p>", false], ["<p title=\"a\u0000b\r\nc\">x</p>", true], ["<script>if (a<b) { x = \"</p>\" }</script><p>z</p>", false], ["<script>if (a<b) { x = \"</p>\" }</script><p>z</p>", true], ["<script><!--<script>x</script>--></script>y", false], ["<script><!--<script>x</script>--></script>y", true], ["<style>p{}</style>z", false], ["<style>p{}</style>z", true], ["<title>a &amp; b</title>", false], ["<title>a &amp; b</title>", true], ["<textarea>&lt;p&gt;</textarea>", false], ["<textarea>&lt;p&gt;</textarea>", true], ["<plaintext><p>x</p>", false], ["<plaintext><p>x</p>", true], ["<xmp><b>x</b></xmp>", false], ["<xmp><b>x</b></xmp>", true], ["<iframe><p>x</p></iframe>after", false], ["<iframe><p>x</p></iframe>after", true], ["<noscript><b>x</b></noscript>", false], ["<noscript><b>x</b></noscript>", true], ["<p>&#x110000; &#55296; &#128; &#159; &#9; &#13; &#x0D;</p>", false], ["<p>&#x110000; &#55296; &#128; &#159; &#9; &#13; &#x0D;</p>", true], ["<p>&AMP &lt &gt; &quot &Aacute; &aacuteb &;</p>", false], ["<p>&AMP &lt &gt; &quot &Aacute; &aacuteb &;</p>", true], ["<p data-x=\"&ampx=1 &amp=2 &copy;\">t</p>", false], ["<p data-x=\"&ampx=1 &amp=2 &copy;\">t</p>", true], ["<p><b><i>x</b>y</i>z</p>", false], ["<p><b><i>x</b>y</i>z</p>", true], ["<b><p>x</p></b>", false], ["<b><p>x</p></b>", true], ["<a href=x><table><tr><td>z</td></tr></table></a>", false], ["<a href=x><table><tr><td>z</td></tr></table></a>", true], ["<p><table><tr><td>t</td></tr></table></p>", false], ["<p><table><tr><td>t</td></tr></table></p>", true], ["<div data-block=\"\" data-props=\"null\"></div>", false], ["<div data-block=\"\" data-props=\"null\"></div>", true], ["<div data-block=\"k\" data-props=\"  \"></div>", false], ["<div data-block=\"k\" data-props=\"  \"></div>", true], ["<p data-repeat='[]' data-when='\"s\"' data-band=\"\">x</p>", false], ["<p data-repeat='[]' data-when='\"s\"' data-band=\"\">x</p>", true], ["<section data-repeat='{\"value\":\"a\"}'><p>x</p>texto</section>", false], ["<section data-repeat='{\"value\":\"a\"}'><p>x</p>texto</section>", true], ["<section><section><table><tr data-band=\"#AABBCC\"><td>a</td></tr></table></section></section>", false], ["<section><section><table><tr data-band=\"#AABBCC\"><td>a</td></tr></table></section></section>", true], ["<td>a</td>", false], ["<td>a</td>", true], ["<tr><td>a</td></tr>", false], ["<tr><td>a</td></tr>", true], ["<li>x</li>", false], ["<li>x</li>", true], ["\n\n<p>a</p>\n\n", false], ["\n\n<p>a</p>\n\n", true], ["\n \n", false], ["\n \n", true], ["", false], ["", true], [" ", false], [" ", true], ["texto\n", false], ["texto\n", true], ["a<br>\n", false], ["a<br>\n", true], ["<br>", false], ["<br>", true], ["\n<br>\n", false], ["\n<br>\n", true], ["<p><span style=\"color:#ff0000;font-family:Arial\">r</span><span style=\"color:\">n</span><span style=\";;:;color : #00ff00 ;\">g</span></p>", false], ["<p><span style=\"color:#ff0000;font-family:Arial\">r</span><span style=\"color:\">n</span><span style=\";;:;color : #00ff00 ;\">g</span></p>", true], ["<p style=\"text-align:\">x</p>", false], ["<p style=\"text-align:\">x</p>", true], ["<p style=\"TEXT-ALIGN:center;text-align:right\">x</p>", false], ["<p style=\"TEXT-ALIGN:center;text-align:right\">x</p>", true], ["<td colspan=\"99999999999999999999\">x</td>", false], ["<td colspan=\"99999999999999999999\">x</td>", true], ["<table><tr><td colspan=\"2\" rowspan=\"-1\" data-width=\",\" data-border=\"\">a</td></tr></table>", false], ["<table><tr><td colspan=\"2\" rowspan=\"-1\" data-width=\",\" data-border=\"\">a</td></tr></table>", true], ["<table><colgroup><col></colgroup><caption>c</caption><thead><tr><th>h</th></tr></thead><tfoot><tr><td>f</td></tr></tfoot></table>", false], ["<table><colgroup><col></colgroup><caption>c</caption><thead><tr><th>h</th></tr></thead><tfoot><tr><td>f</td></tr></tfoot></table>", true], ["<p>a<!--x-->b</p>", false], ["<p>a<!--x-->b</p>", true], ["<p>a<?x?>b</p>", false], ["<p>a<?x?>b</p>", true], ["<p>a<!x>b</p>", false], ["<p>a<!x>b</p>", true], ["<p>a</ b>c</p>", false], ["<p>a</ b>c</p>", true], ["<p>a</>b</p>", false], ["<p>a</>b</p>", true], ["<p>a<3 b</p>", false], ["<p>a<3 b</p>", true], ["<p>a</p\n>b", false], ["<p>a</p\n>b", true], ["<P CLASS=X>A</P>", false], ["<P CLASS=X>A</P>", true], ["<p>x</P >", false], ["<p>x</P >", true], ["<span data-variable=\"a\" data-list=\"number\"></span>", false], ["<span data-variable=\"a\" data-list=\"number\"></span>", true], ["<p><span data-response='{\"kind\":\"texto\",\"maxLength\":5}'></span></p>", false], ["<p><span data-response='{\"kind\":\"texto\",\"maxLength\":5}'></span></p>", true], ["<u><b>x</b></u><i>y</i>", false], ["<u><b>x</b></u><i>y</i>", true], ["<p><font color=red>x</font></p>", false], ["<p><font color=red>x</font></p>", true], ["<dl><dt>a<dd>b</dl>", false], ["<dl><dt>a<dd>b</dl>", true], ["<form><p>x</form>y", false], ["<form><p>x</form>y", true], ["<p>áááááááááááááááááááááááááááááááááááááááááááááááááá</p>", false], ["<p>áááááááááááááááááááááááááááááááááááááááááááááááááá</p>", true], ["<p>  </p>", false], ["<p>  </p>", true], ["<p>😀 &#x1F600;</p>", false], ["<p>😀 &#x1F600;</p>", true], ["<p>a </p>", false], ["<p>a </p>", true], ["<ul><li><p>a</p>\n</li></ul>", false], ["<ul><li><p>a</p>\n</li></ul>", true], ["<table>\n<tr>\n<td>\n<p>x</p>\n</td>\n</tr>\n</table>", false], ["<table>\n<tr>\n<td>\n<p>x</p>\n</td>\n</tr>\n</table>", true], [["<p>a</p>", "<p>b</p>"], false], [["<table>", "<tr><td>x</td></tr>", "</table>"], true], [[], false], [["", ""], true], [[1, 2.5, true, null], false]]
JSON, true) as $case) {
    $cases[] = $case;
}

mt_srand(7);
$tags = ['p', 'b', 'strong', 'i', 'em', 'u', 'span', 'br', 'div', 'ul', 'ol', 'li', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'section', 'h1', 'a', 'pre', 'title', 'script', 'style', 'body', 'head', 'img', 'caption', 'dl', 'dd', 'form', 'xmp'];
$attributes = ['style="text-align:center"', 'style="TEXT-ALIGN: Right;color:#ff0000"', 'style="font-family: Arial; color: 0"', 'style="background:#c3d4ea;font-weight:bold;font-style:italic"', 'colspan="2"', 'rowspan=" 3x"', 'data-width="100,200"', 'data-border="thick"', "data-repeat='{\"value\":\"filas\"}'", 'data-when="raw"', 'data-band="#aabbcc"', "data-slot='{\"value\":\"x\"}'", "data-response='{\"kind\":\"una\"}'", 'data-variable="nombre"', 'data-list="bullet"', 'data-block="tabla"', "data-props='{\"a\":\"b\"}'", 'data-props="0"', 'a="1" a="2"', '/'];
$texts = ['hola', '  ', "\n", "\n\n", "x\ny", '&amp;', '&lt;b&gt;', '&nbsp;', '&copy', '&ampx', '&notit;', '&#65;', '&#x80;', 'á é', "\r\n", "\t", '<', '</>', '<!-- c -->', '<?pi?>', '<!DOCTYPE html>', '&', '0', ' 0 ', 'Sílabo'];
$pick = fn (array $items) => $items[mt_rand(0, count($items) - 1)];
$generate = function (int $depth) use (&$generate, $tags, $attributes, $texts, $pick): string {
    $html = '';
    for ($count = mt_rand(0, 4); $count > 0; $count--) {
        if (mt_rand(0, 99) < 35 || $depth > 4) {
            $html .= $pick($texts);

            continue;
        }
        $tag = $pick($tags);
        $attrs = mt_rand(0, 2) === 0 ? '' : ' '.$pick($attributes);
        $html .= '<'.(mt_rand(0, 9) === 0 ? strtoupper($tag) : $tag).$attrs.'>'.$generate($depth + 1).(mt_rand(0, 6) === 0 ? '' : '</'.$tag.'>');
    }

    return $html;
};
for ($index = 0; $index < 400; $index++) {
    $html = $generate(0);
    $cases[] = [mt_rand(0, 4) === 0 ? explode("\n", $html) : $html, mt_rand(0, 1) === 1];
}

$golden = array_map(fn (array $case): array => [
    'html' => $case[0],
    'layout' => $case[1],
    'document' => json_encode(DocumentHtml::fromHtml($case[0], $case[1])),
], $cases);

file_put_contents(__DIR__.'/html-golden.json', json_encode($golden, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)."\n");
