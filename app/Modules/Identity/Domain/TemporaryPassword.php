<?php

namespace App\Modules\Identity\Domain;

/**
 * Contraseña temporal generada en el servidor, con la misma política que la del
 * navegador (`resources/js/lib/temporaryPassword.ts`): 16 caracteres con minúscula,
 * mayúscula, dígito y símbolo, sin caracteres que se confundan (l, I, 0, O, 1).
 */
final class TemporaryPassword
{
    private const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';

    private const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

    private const DIGITS = '23456789';

    private const SYMBOLS = '!@#$%&*?-_';

    public const LENGTH = 16;

    public static function generate(int $length = self::LENGTH): string
    {
        $alphabets = [self::LOWERCASE, self::UPPERCASE, self::DIGITS, self::SYMBOLS];
        $all = implode('', $alphabets);
        $characters = array_map(fn (string $alphabet): string => $alphabet[random_int(0, strlen($alphabet) - 1)], $alphabets);
        while (count($characters) < $length) {
            $characters[] = $all[random_int(0, strlen($all) - 1)];
        }
        // Barajar para que la posición no delate qué carácter cubrió cada requisito.
        for ($index = count($characters) - 1; $index > 0; $index--) {
            $target = random_int(0, $index);
            [$characters[$index], $characters[$target]] = [$characters[$target], $characters[$index]];
        }

        return implode('', $characters);
    }
}
