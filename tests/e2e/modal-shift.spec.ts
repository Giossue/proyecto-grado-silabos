import type { Locator, Page } from "@playwright/test"
import { storageStateOf } from "./support/accounts"
import { expect, test } from "./support/fixtures"

type ModalCase = {
  name: string
  path: string
  open: (page: Page) => Promise<Locator>
  close: (page: Page, modal: Locator) => Promise<void>
  widths?: number[]
  ready?: (page: Page) => Promise<void>
}

const isNarrow = (page: Page): boolean => (page.viewportSize()?.width ?? 1440) < 640

const escape = async (page: Page, modal: Locator) => {
  for (let attempt = 0; attempt < 3 && (await modal.isVisible()); attempt += 1) {
    await page.keyboard.press("Escape")
    await page.waitForTimeout(300)
  }
  await expect(modal).toBeHidden()
}

async function anchorX(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    ["main h1", "main [data-slot=table], main table", "header, [data-slot=sidebar-inset] > header"].map((selector) => {
      const element = document.querySelector(selector)
      return element ? Math.round(element.getBoundingClientRect().left * 10) / 10 : Number.NaN
    }),
  )
}

const cases: ModalCase[] = [
  {
    name: "accessibility dialog",
    path: "/admin/usuarios",
    open: async (page) => {
      if (isNarrow(page)) {
        await page.getByRole("button", { name: "Menú de usuario" }).click()
        await page.getByRole("menuitem", { name: "Accesibilidad" }).click()
      } else await page.getByRole("button", { name: "Accesibilidad" }).click()
      return page.getByRole("dialog", { name: "Accesibilidad" })
    },
    close: escape,
  },
  {
    name: "form dialog",
    path: "/admin/usuarios",
    open: async (page) => {
      if (isNarrow(page)) {
        await page.getByRole("button", { name: /^Ver \d+ acciones de la pantalla$/ }).click()
        await page.getByRole("menuitem", { name: "Crear cuenta" }).or(page.getByRole("button", { name: "Crear cuenta" })).first().click()
      } else await page.getByRole("button", { name: "Crear cuenta" }).click()
      return page.getByRole("dialog", { name: "Crear cuenta institucional" })
    },
    close: escape,
  },
  {
    name: "multi-step form dialog",
    path: "/admin/estructura-academica",
    open: async (page) => {
      await page.getByRole("button", { name: "Crear facultad" }).click()
      return page.getByRole("dialog", { name: "Nueva facultad" })
    },
    close: escape,
  },
  {
    name: "options dialog",
    path: "/admin/convocatorias",
    open: async (page) => {
      await page.getByRole("row", { name: /^Opciones de / }).first().click()
      return page.getByRole("dialog", { name: /^Convocatoria / })
    },
    close: escape,
  },
  {
    name: "notifications sheet",
    path: "/admin/usuarios",
    widths: [1440],
    open: async (page) => {
      await page.getByRole("button", { name: /^Notificaciones/ }).first().click()
      return page.getByRole("dialog").filter({ hasText: "Notificaciones" }).first()
    },
    close: escape,
  },
  {
    name: "user menu",
    path: "/admin/usuarios",
    open: async (page) => {
      await page.getByRole("button", { name: "Menú de usuario" }).click()
      return page.getByRole("menu")
    },
    close: escape,
  },
  {
    name: "logout confirmation",
    path: "/admin/usuarios",
    open: async (page) => {
      await page.getByRole("button", { name: "Menú de usuario" }).click()
      await page.getByRole("menuitem", { name: "Cerrar sesión" }).click()
      return page.getByRole("dialog", { name: "¿Cerrar sesión?" })
    },
    close: async (page, modal) => {
      await modal.getByRole("button", { name: "Cancelar" }).click()
      await expect(modal).toBeHidden()
    },
  },
  {
    name: "select popover",
    path: "/admin/usuarios",
    widths: [1440],
    open: async (page) => {
      await page.getByRole("combobox", { name: "Rol" }).click()
      return page.getByRole("listbox")
    },
    close: escape,
  },
  {
    name: "mobile filter sheet",
    path: "/admin/usuarios",
    widths: [600],
    ready: async (page) => {
      await expect(page.locator("main table").first()).toBeVisible()
    },
    open: async (page) => {
      await page.getByRole("button", { name: "Filtros", exact: true }).click()
      return page.getByRole("group", { name: "Filtros de la tabla" })
    },
    close: async (page, modal) => {
      await page.getByRole("button", { name: "Cerrar filtros" }).click()
      await expect(modal).toBeHidden()
    },
  },
]

test.use({ storageState: storageStateOf("admin") })

for (const width of [1440, 600]) {
  test.describe(`no content shift when a modal opens at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    for (const modalCase of cases.filter((item) => (item.widths ?? [1440, 600]).includes(width))) {
      test(modalCase.name, async ({ page, issues }) => {
        await page.goto(modalCase.path)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        await page.waitForLoadState("networkidle")
        await modalCase.ready?.(page)
        const before = await anchorX(page)
        const modal = await modalCase.open(page)
        await expect(modal).toBeVisible()
        await page.waitForTimeout(400)
        const during = await anchorX(page)
        await modalCase.close(page, modal)
        await page.waitForTimeout(400)
        const after = await anchorX(page)
        expect(during, `content moved when "${modalCase.name}" opened`).toEqual(before)
        expect(after, `content moved when "${modalCase.name}" closed`).toEqual(before)
        issues.expectClean()
      })
    }
  })
}
