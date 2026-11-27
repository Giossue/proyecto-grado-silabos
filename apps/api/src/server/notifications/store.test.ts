// @vitest-environment node
import { describe, expect, it } from "vitest"
import { notificationEmailConfig } from "./config"
import { notificationDate, scheduleWorkflowNotification, storeInternalNotifications } from "./store"
import { fakeNotificationTransaction, notificationWorld, recipient } from "./testing"

const TEACHER = "a0000000-0000-4000-8000-000000000001"
const OTHER = "a0000000-0000-4000-8000-000000000002"
const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const NOW = 1_800_000_000

const notice = {
  eventType: "silabo.correccion_solicitada",
  deduplicationKey: "silabo.correccion_solicitada:r-1",
  recipientIds: [TEACHER, TEACHER, OTHER],
  title: "Corrección solicitada",
  message: "Revise las observaciones.",
  resourceType: "silabo",
  resourceId: SYLLABUS,
}

describe("storeInternalNotifications", () => {
  it("stores one notice per active recipient and mails it after commit with the workflow mailable", async () => {
    const world = notificationWorld({ users: [recipient(TEACHER, { name: "Ana Pérez", email: "ana@ueb.edu.ec" })], periods: new Map([[`silabo:${SYLLABUS}`, "p-1"]]) })
    const stored = await fakeNotificationTransaction(world, NOW, async (scope) => {
      const count = await storeInternalNotifications(scope, notice)
      expect(world.mails).toEqual([])
      return count
    })
    expect(stored).toBe(1)
    expect(world.notifications).toEqual([
      {
        userId: TEACHER,
        key: "flujo:silabo.correccion_solicitada:r-1",
        type: "silabo.correccion_solicitada",
        title: "Corrección solicitada",
        message: "Revise las observaciones.",
        resourceType: "silabo",
        resourceId: SYLLABUS,
        periodId: "p-1",
        notifiedAt: NOW,
      },
    ])
    expect(world.mails).toEqual([
      { mailable: "workflow", to: "ana@ueb.edu.ec", data: { name: "Ana Pérez", title: "Corrección solicitada", body: "Revise las observaciones.", url: "http://localhost:3000/" } },
    ])
  })

  it("is idempotent by deduplication key and does not mail twice", async () => {
    const world = notificationWorld({ users: [recipient(TEACHER)] })
    await fakeNotificationTransaction(world, NOW, (scope) => storeInternalNotifications(scope, notice))
    await fakeNotificationTransaction(world, NOW, (scope) => storeInternalNotifications(scope, notice))
    expect(world.notifications).toHaveLength(1)
    expect(world.mails).toHaveLength(1)
  })

  it("skips the mail for unverified accounts, switched-off notices and events outside the list", async () => {
    const world = notificationWorld({
      users: [recipient(TEACHER, { verified: false }), recipient(OTHER, { preferences: { "silabo.correccion_solicitada": false } })],
    })
    await fakeNotificationTransaction(world, NOW, (scope) => storeInternalNotifications(scope, notice))
    await fakeNotificationTransaction(world, NOW, (scope) => storeInternalNotifications(scope, { ...notice, eventType: "silabo.regenerado", deduplicationKey: "x" }))
    expect(world.notifications).toHaveLength(4)
    expect(world.mails).toEqual([])
  })

  it.each(["silabo.correccion_solicitada", "silabo.devuelto_borrador", "silabo.regenerado", "silabo.eliminado", "proceso.plantilla_rehecho", "documento.exportacion_fallida"])("keeps %s inside the system", async (eventType) => {
    const world = notificationWorld({ users: [recipient(TEACHER)] })
    await fakeNotificationTransaction(world, NOW, (scope) => storeInternalNotifications(scope, { ...notice, eventType }))
    expect(world.notifications).toHaveLength(1)
  })

  it.each(["convocatoria.abierta", "convocatoria.reanudada", "silabo.asignado", "silabo.aprobado", "silabo.enviado", "silabo.reenviado_biblioteca", "biblioteca.verificado", "proceso.reanudado", "proceso.plazo_extendido", "proceso.eliminado"])(
    "no longer shows %s inside the system, but its optional email still goes out",
    async (eventType) => {
      const world = notificationWorld({ users: [recipient(TEACHER)], emailEvents: [eventType] })
      await fakeNotificationTransaction(world, NOW, (scope) => storeInternalNotifications(scope, { ...notice, eventType }))
      expect(world.notifications).toEqual([])
      expect(world.mails).toHaveLength(1)
    },
  )

  it("sends nothing when the transaction fails", async () => {
    const world = notificationWorld({ users: [recipient(TEACHER)] })
    await expect(
      fakeNotificationTransaction(world, NOW, async (scope) => {
        await storeInternalNotifications(scope, notice)
        throw new Error("rollback")
      }),
    ).rejects.toThrow("rollback")
    expect(world.notifications).toEqual([])
    expect(world.mails).toEqual([])
  })

  it("builds the workflow title and message from the live subject name", async () => {
    const world = notificationWorld({ users: [recipient(TEACHER)], subjects: new Map([[SYLLABUS, "Cálculo I"]]) })
    await fakeNotificationTransaction(world, NOW, (scope) =>
      scheduleWorkflowNotification(scope, {
        syllabusId: SYLLABUS,
        eventType: "silabo.eliminado",
        deduplicationKey: `silabo.eliminado:${SYLLABUS}`,
        recipientIds: [TEACHER],
        revisionNumber: null,
      }),
    )
    expect(world.notifications[0]).toMatchObject({
      title: "Su sílabo cambió",
      message: "Coordinación eliminó el sílabo aprobado de Cálculo I. Se borró lo que había escrito; complételo de nuevo.",
      resourceType: "silabo",
      resourceId: SYLLABUS,
    })
  })
})

describe("notification settings", () => {
  it("reads NOTIFICATION_EMAILS and NOTIFICATION_EMAIL_EVENTS like config/notifications.php", () => {
    expect(notificationEmailConfig({}).enabled).toBe(true)
    expect(notificationEmailConfig({ NOTIFICATION_EMAILS: "false" }).enabled).toBe(false)
    expect(notificationEmailConfig({ NOTIFICATION_EMAILS: "0" }).enabled).toBe(false)
    expect(notificationEmailConfig({ NOTIFICATION_EMAIL_EVENTS: " silabo.aprobado, TRUE, 1 " }).events).toEqual(["silabo.aprobado"])
    // By default no event has its own email: the daily summary replaces them.
    expect(notificationEmailConfig({}).events).toEqual([])
    expect(notificationEmailConfig({ NOTIFICATION_EMAIL_EVENTS: "TRUE" }).events).toEqual([])
  })

  it("formats dates like translatedFormat('j \\d\\e F \\d\\e Y, H:i') in the institution timezone", () => {
    expect(notificationDate(Date.UTC(2026, 11, 5, 4, 59, 0) / 1000, "America/Guayaquil")).toBe("4 de diciembre de 2026, 23:59")
  })
})
