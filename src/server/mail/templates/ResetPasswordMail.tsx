import { MailButton, MailHeading, MailLayout, MailText, type MailApp } from "./MailLayout"

export function ResetPasswordMail({ app, url, expireMinutes }: { app: MailApp; url: string; expireMinutes: number }) {
  return (
    <MailLayout app={app} subcopyUrl={url}>
      <MailHeading>Restablezca su contraseña</MailHeading>
      <MailText>Elija una contraseña nueva para su cuenta con el botón.</MailText>
      <MailButton href={url}>Restablecer contraseña</MailButton>
      <MailText>{`El enlace caduca en ${expireMinutes} minutos.`}</MailText>
      <MailText>Si no hizo esta solicitud, ignore este correo; su contraseña no cambiará.</MailText>
    </MailLayout>
  )
}
