<?php

namespace App\Modules\Identity\Infrastructure\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Entrega las credenciales de una cuenta recién creada.
 *
 * Va en cola: crear la cuenta no puede quedarse esperando a un servidor de correo, ni
 * fallar porque ese servidor esté caído. Si el envío falla, la cuenta existe igual y el
 * administrador puede dictar los datos.
 *
 * La contraseña viaja en el mensaje por decisión explícita del producto. Queda en el
 * buzón de quien lo reciba, y por eso el sistema obliga a cambiarla en el primer inicio:
 * cuando alguien más pudiera leerla, ya no sirve.
 */
class ManagedUserCredentialsMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $name,
        public readonly string $email,
        public readonly string $temporaryPassword,
        public readonly string $roleName,
        public readonly string $loginUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Su cuenta en '.config('app.name'));
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.managed-user-credentials');
    }
}
