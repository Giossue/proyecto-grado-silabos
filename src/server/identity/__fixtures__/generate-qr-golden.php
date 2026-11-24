<?php
require $argv[1].'/vendor/autoload.php';
use BaconQrCode\Renderer\Color\Rgb;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\Fill;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
$google = new PragmaRX\Google2FA\Google2FA();
$cases = [];
$emails = ['docente@silabos.test', 'paridad.t14a@silabos.test', 'a@b.co', 'coordinacion.software+pruebas@ueb.edu.ec', 'x'];
foreach ($emails as $i => $email) {
    foreach (['JBSWY3DPEHPK3PXP', $google->generateSecretKey(16), $google->generateSecretKey(16)] as $secret) {
        $url = $google->getQRCodeUrl('Sílabos UEB', $email, $secret);
        $svg = (new Writer(new ImageRenderer(new RendererStyle(192, 0, null, null, Fill::uniformColor(new Rgb(255, 255, 255), new Rgb(45, 55, 72))), new SvgImageBackEnd)))->writeString($url);
        $cases[] = ['company' => 'Sílabos UEB', 'email' => $email, 'secret' => $secret, 'url' => $url, 'svg' => trim(substr($svg, strpos($svg, "\n") + 1))];
    }
}
echo json_encode($cases, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
