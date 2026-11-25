import { DailySummaryMail } from "./DailySummaryMail"
import type { MailApp } from "./MailLayout"

export type CoordinatorSummaryData = { name: string; careers: Array<{ career: string; review: number }>; url: string }

export function coordinatorLines(careers: CoordinatorSummaryData["careers"]): string[] {
  return careers
    .filter((career) => career.review > 0)
    .map((career) => (career.review === 1 ? `${career.career}: 1 sílabo por revisar.` : `${career.career}: ${career.review} sílabos por revisar.`))
}

export function CoordinatorSummaryMail({ app, data }: { app: MailApp; data: CoordinatorSummaryData }) {
  return <DailySummaryMail app={app} data={{ name: data.name, lines: coordinatorLines(data.careers), buttonLabel: "Abrir revisión", url: data.url }} />
}
