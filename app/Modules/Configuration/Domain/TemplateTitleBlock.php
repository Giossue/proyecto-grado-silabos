<?php

namespace App\Modules\Configuration\Domain;

final class TemplateTitleBlock
{
    public const DEFAULT_TEXT = 'PROGRAMA DE ASIGNATURA (SÍLABO)';

    public const MAX_LENGTH = 180;

    /** @return array{text: string} */
    public static function defaults(): array
    {
        return ['text' => self::DEFAULT_TEXT];
    }

    /** @param array<string, mixed>|null $mapping
     * @return array{text: string}
     */
    public static function fromMapping(?array $mapping): array
    {
        $block = $mapping['title_block'] ?? null;
        $text = is_array($block) ? ($block['text'] ?? null) : null;

        if (! is_string($text)) {
            return self::defaults();
        }

        $text = trim($text);

        return $text !== '' && mb_strlen($text) <= self::MAX_LENGTH
            ? ['text' => $text]
            : self::defaults();
    }
}
