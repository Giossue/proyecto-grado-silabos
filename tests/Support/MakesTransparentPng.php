<?php

namespace Tests\Support;

use Illuminate\Http\UploadedFile;

/** Logos de prueba: PNG con canal alfa y medida exacta, como exige la validación. */
trait MakesTransparentPng
{
    protected function transparentPng(int $width, int $height, string $name = 'logo.png'): UploadedFile
    {
        $image = imagecreatetruecolor($width, $height);
        imagesavealpha($image, true);
        $transparent = imagecolorallocatealpha($image, 0, 0, 0, 127);
        imagefill($image, 0, 0, $transparent);

        $path = tempnam(sys_get_temp_dir(), 'logo-');
        imagepng($image, $path);
        imagedestroy($image);

        return new UploadedFile($path, $name, 'image/png', null, true);
    }

    protected function opaquePng(int $width, int $height): UploadedFile
    {
        $image = imagecreatetruecolor($width, $height);
        $path = tempnam(sys_get_temp_dir(), 'logo-');
        imagepng($image, $path);
        imagedestroy($image);

        return new UploadedFile($path, 'opaque.png', 'image/png', null, true);
    }
}
