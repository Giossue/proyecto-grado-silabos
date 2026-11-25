import { MailButton, MailLayout, MailText, type MailApp } from "./MailLayout"

export type WorkflowNotificationData = { name: string; title: string; body: string; url: string }

export function WorkflowNotificationMail({ app, data }: { app: MailApp; data: WorkflowNotificationData }) {
  return (
    <MailLayout app={app}>
      <MailText>{`Hola ${data.name}:`}</MailText>
      <MailText>{data.body}</MailText>
      <MailButton href={data.url}>Abrir el sistema</MailButton>
    </MailLayout>
  )
}
