import type { QueuedMail } from "../mail/mailables"
import { DEFAULT_EMAIL_EVENTS } from "./config"
import type { NotificationRecipient, NotificationRow, NotificationScope, NotificationTx } from "./store"

export type NotificationWorld = {
  users: NotificationRecipient[]
  periods: Map<string, string | null>
  subjects: Map<string, string>
  notifications: NotificationRow[]
  mails: QueuedMail[]
}

export function notificationWorld(overrides: Partial<NotificationWorld> = {}): NotificationWorld {
  return { users: [], periods: new Map(), subjects: new Map(), notifications: [], mails: [], ...overrides }
}

export function recipient(id: string, overrides: Partial<NotificationRecipient> = {}): NotificationRecipient {
  return { id, name: `Persona ${id.slice(0, 4)}`, email: `${id.slice(0, 4)}@ueb.edu.ec`, verified: true, preferences: null, ...overrides }
}

export function fakeNotificationTx(world: NotificationWorld, staged: NotificationRow[]): NotificationTx {
  return {
    recipients: async (ids) => world.users.filter((user) => ids.includes(user.id)),
    periodOf: async (type, id) => world.periods.get(`${type}:${id}`) ?? null,
    async create(row) {
      if ([...world.notifications, ...staged].some((item) => item.userId === row.userId && item.key === row.key)) return false
      staged.push(row)
      return true
    },
    subjectOf: async (id) => world.subjects.get(id) ?? null,
  }
}

export async function fakeNotificationTransaction<T>(world: NotificationWorld, now: number, work: (scope: NotificationScope) => Promise<T>): Promise<T> {
  const staged: NotificationRow[] = []
  const callbacks: Array<() => unknown> = []
  const scope: NotificationScope = {
    tx: fakeNotificationTx(world, staged),
    afterCommit: (callback) => void callbacks.push(callback),
    mail: async (mail) => void world.mails.push(mail),
    now,
    email: { enabled: true, events: DEFAULT_EMAIL_EVENTS },
    frontendUrl: "http://localhost:3000/",
  }
  const result = await work(scope)
  world.notifications.push(...staged)
  for (const callback of callbacks) await callback()
  return result
}
