<?php

require __DIR__.'/../../../../../backend/vendor/autoload.php';

use Egulias\EmailValidator\EmailValidator;
use Egulias\EmailValidator\Validation\RFCValidation;

$samples = [
    'docente@silabos.test', 'nueva.docente@silabos.test', 'Ana.Perez@UEB.edu.ec', 'a@b.co', 'a_b-c+d%e@sub-domain.example.org',
    'x@localhost', 'x@123.com', 'x@a.123', 'x@1a.com', 'user@xn--bcher-kva.ch', '0@0.ec', 'a.b.c.d@e.f.g.h',
    str_repeat('a', 64).'@ueb.edu.ec', str_repeat('a', 65).'@ueb.edu.ec', 'a@'.str_repeat('b', 63).'.com', 'a@'.str_repeat('b', 64).'.com',
    'a@'.implode('.', array_fill(0, 60, 'abcd')).'.ec',
    'sin-arroba', 'sin arroba', '', '@ueb.edu.ec', 'docente@', 'doc@@ueb.edu.ec', 'a@b@c.com', '.docente@ueb.edu.ec', 'docente.@ueb.edu.ec',
    'doc..ente@ueb.edu.ec', 'docente@ueb..edu.ec', 'docente@.ueb.edu.ec', 'docente@ueb.edu.ec.', 'docente@-ueb.edu.ec', 'docente@ueb-.edu.ec',
    'doc ente@ueb.edu.ec', 'docente@ueb edu.ec', 'docente@ueb_edu.ec', 'doc,ente@ueb.edu.ec', 'doc;ente@ueb.edu.ec', 'doc:ente@ueb.edu.ec',
    'docente@[127.0.0.1]', '"doc ente"@ueb.edu.ec', 'doc(comentario)ente@ueb.edu.ec', "o'neil@ueb.edu.ec", 'doc!#$&*=?^`{|}~@ueb.edu.ec',
    'dócente@ueb.edu.ec', 'docente@uéb.edu.ec', 'docente@ueb.edu.ec ', ' docente@ueb.edu.ec', "docente@ueb.edu.ec\n", 'doc\\ente@ueb.edu.ec',
    'docente@ueb.e', 'docente@ueb.edu.c0m', 'DOCENTE@UEB.EDU.EC', 'a-@b.com', '-a@b.com', 'a@b-c.d-e.com', 'a@b.c-',
];

$validator = new EmailValidator;
$cases = array_map(fn (string $email): array => ['email' => $email, 'valid' => $validator->isValid($email, new RFCValidation)], $samples);

file_put_contents(__DIR__.'/email-golden.json', json_encode($cases, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n");
