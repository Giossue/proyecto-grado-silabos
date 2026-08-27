<x-mail::message>
# Su cuenta está lista

Hola {{ $name }}:

Se creó una cuenta a su nombre en **{{ config('app.name') }}** con el rol de
**{{ $roleName }}**.

Estos son sus datos de acceso. Puede copiarlos y pegarlos:

<x-mail::panel>
**Correo:** {{ $email }}

**Contraseña temporal:** {{ $temporaryPassword }}
</x-mail::panel>

<x-mail::button :url="$loginUrl">
Entrar al sistema
</x-mail::button>

La contraseña es de un solo uso: al entrar por primera vez el sistema le pedirá
sustituirla y no podrá hacer nada más hasta que lo haga. Elija una que solo usted
conozca.

Si no esperaba este mensaje, avise a la coordinación de su carrera y no lo reenvíe.

Gracias,<br>
{{ config('app.name') }}
</x-mail::message>
