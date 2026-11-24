import "server-only"
import { dispatch } from "../queue/dispatch"
import { defineJob } from "../queue/job"
import type { QueuedMail } from "./mailables"
import { sharedMailer, type Mailer } from "./mailer"

export function createSendMailJob(mailer: () => Mailer) {
  return defineJob<QueuedMail>({
    name: "SendQueuedMailable",
    queue: "general",
    async handle(mail) {
      await mailer().send(mail)
    },
  })
}

export const sendMailJob = createSendMailJob(sharedMailer)

export function queueMail(mail: QueuedMail): Promise<string> {
  return dispatch(sendMailJob, mail)
}
