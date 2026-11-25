import { MailButton, MailHeading, MailLayout, MailText, type MailApp } from "./MailLayout"

export type ManagedUserActivationData = { name: string; roleName: string; activationUrl: string; careerName: string | null }

const truthy = (value: string | null): value is string => value !== null && value !== "" && value !== "0"

export function ManagedUserActivationMail({ app, data }: { app: MailApp; data: ManagedUserActivationData }) {
  const career = truthy(data.careerName) ? data.careerName : null
  return (
    <MailLayout app={app}>
      <MailHeading>Le damos la bienvenida</MailHeading>
      <MailText>{`Hola ${data.name}:`}</MailText>
      {career === null ? (
        <MailText>
          Tiene una cuenta como <strong>{data.roleName}</strong>. Para ingresar, elija su contraseña.
        </MailText>
      ) : (
        <MailText>
          Tiene una cuenta como <strong>{data.roleName}</strong> de la carrera <strong>{career}</strong>. Para ingresar, elija su contraseña.
        </MailText>
      )}
      <MailButton href={data.activationUrl}>Activar mi cuenta</MailButton>
      <MailText>
        {`El enlace es personal, de un solo uso y caduca en 7 días. Si no esperaba este correo, avise a ${career === null ? "la administración del sistema" : "la coordinación de su carrera"}.`}
      </MailText>
    </MailLayout>
  )
}
