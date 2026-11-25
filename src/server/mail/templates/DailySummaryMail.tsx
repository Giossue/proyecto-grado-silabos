import { MailButton, MailHeading, MailLayout, MailList, MailText, type MailApp } from "./MailLayout"

export type DailySummaryData = { name: string; lines: string[]; buttonLabel: string; url: string }

export function DailySummaryMail({ app, data }: { app: MailApp; data: DailySummaryData }) {
  return (
    <MailLayout app={app}>
      <MailHeading>Pendientes de hoy</MailHeading>
      <MailText>{`Hola ${data.name}:`}</MailText>
      <MailList items={data.lines} />
      <MailButton href={data.url}>{data.buttonLabel.trim()}</MailButton>
    </MailLayout>
  )
}
