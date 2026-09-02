<?php

use App\Modules\Identity\Domain\PersonName;

it('guarda los nombres en mayúsculas, con tildes y sin espacios sobrantes', function (): void {
    expect(PersonName::normalize("  maría   josé\tpérez lópez "))->toBe('MARÍA JOSÉ PÉREZ LÓPEZ');
    expect(PersonName::normalize('Ñandú Güemes'))->toBe('ÑANDÚ GÜEMES');
    expect(PersonName::normalize('YA EN MAYÚSCULAS'))->toBe('YA EN MAYÚSCULAS');
});
