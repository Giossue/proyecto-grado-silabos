"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState, type FormEvent } from "react"
import { type ManagedUser } from "@/api/admin-users"
import { FilterToolbar } from "@/components/domain/FilterToolbar"
import { ImportSpreadsheetDialog } from "@/components/domain/ImportSpreadsheetDialog"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { StatusBadge } from "@/components/domain/StatusBadge"
import { SortableHead, SortSelect, SortStatus } from "@/components/domain/TableSort"
import { TablePagination } from "@/components/domain/TablePagination"
import { ManagedUserAccessAction } from "@/components/domain/identity/ManagedUserAccessAction"
import { ManagedUserDetailDialog, type ManagedUserAction } from "@/components/domain/identity/ManagedUserDetailDialog"
import { ManagedUserDialog } from "@/components/domain/identity/ManagedUserDialog"
import { ManagedUserPendingActions } from "@/components/domain/identity/ManagedUserPendingActions"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { serverSortOf, useServerSort, type ServerSortColumns, type ServerSortState } from "@/composables/useServerSort"
import { managedUserStatus } from "@silabos/shared/lib/managedUserStatus"
import { queryErrorMessage, sameKey } from "@/lib/queryClient"
import { paths } from "@/lib/routes"
import { activateRow, rowButtonClass } from "@/lib/rowActivation"
import { toast } from "@/lib/toast"
import { queryOf, queryPage, queryText, syncFilters } from "@/lib/urlFilters"
import { cn } from "@/lib/utils"
import { adminUserKeys, managedUsersQuery, type ManagedUserFilters } from "@/queries/adminUsers"

type UserFilters = ManagedUserFilters
type RoleAssignment = ManagedUser["roles"][number]

const NO_FILTERS: UserFilters = { q: "", status: "all", role: "all", career: "all", sort: "", dir: "" }

const SORT_COLUMNS = { name: { label: "Usuario" }, status: { label: "Estado" } } satisfies ServerSortColumns

const IMPORT_COLUMNS = [
  { key: "nombre", label: "Nombre" },
  { key: "correo", label: "Correo" },
  { key: "rol", label: "Rol" },
  { key: "carrera", label: "Carrera" },
]

const ROLE_ORDER: Record<RoleAssignment["code"], number> = { administrador: 0, coordinador: 1, docente: 2, bibliotecario: 3 }

type RoleBlock = { roles: string[]; careers: string[]; scoped: boolean }

const careerOf = (role: RoleAssignment): string => (role.code === "administrador" ? "-" : (role.career_name ?? "Todas las carreras"))

/** One entry per role with all its careers; roles holding exactly the same careers share one block. */
function roleBlocks(assignments: RoleAssignment[]): RoleBlock[] {
  const blocks = new Map<string, RoleBlock>()
  const ordered = [...assignments].sort((a, b) => ROLE_ORDER[a.code] - ROLE_ORDER[b.code])

  for (const code of new Set(ordered.map((item) => item.code))) {
    const held = ordered.filter((item) => item.code === code)
    const careers = [...new Set(held.map(careerOf))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }))
    const key = JSON.stringify(careers)
    const block = blocks.get(key)
    if (block) block.roles.push(held[0]!.name)
    else blocks.set(key, { roles: [held[0]!.name], careers, scoped: held.some((item) => item.career_name !== null) })
  }

  return [...blocks.values()]
}

const blockLine = ({ roles, careers, scoped }: RoleBlock): string => (scoped ? `${roles.join(", ")} · ${careers.join(", ")}` : roles.join(", "))

export default function AdminUsersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const [initial] = useState(() => {
    const query = queryOf(searchParams)

    return {
      page: queryPage(query.page),
      filters: {
        q: queryText(query.q),
        status: queryText(query.status) || "all",
        role: queryText(query.role) || "all",
        career: queryText(query.career) || "all",
        ...serverSortOf(SORT_COLUMNS, queryText(query.sort), queryText(query.dir)),
      },
    }
  })
  const [filters, setFilters] = useState<UserFilters>(initial.filters)
  const [applied, setApplied] = useState(initial)
  const query = useQuery({ ...managedUsersQuery(applied.page, applied.filters), placeholderData: keepPreviousData })
  const allowed = query.data?.allowed === true ? query.data : null
  const currentUserId = allowed?.session.user.id ?? null
  const result = allowed?.users ?? null
  const error = queryErrorMessage(query, "No se pudieron cargar los usuarios")
  const loading = query.isFetching
  const [viewing, setViewing] = useState<ManagedUser | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [dialog, setDialog] = useState<ManagedUserAction | null>(null)
  const filtersActive = filters.q !== "" || filters.status !== "all" || filters.role !== "all" || filters.career !== "all"

  useEffect(() => {
    if (query.isPlaceholderData || !query.data) return
    if (!query.data.allowed) {
      router.replace(paths.dashboard)
      return
    }
    syncFilters(router, applied.filters, applied.page)
  }, [applied, query.data, query.isPlaceholderData, router])

  const load = (page = 1, current: UserFilters = filters): Promise<void> => {
    const next = { page, filters: current }
    if (sameKey(next, applied)) return query.refetch().then(() => undefined)
    setApplied(next)
    return Promise.resolve()
  }

  const setFilter = (key: keyof UserFilters, value: string): void => setFilters((previous) => ({ ...previous, [key]: value }))

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void load()
  }

  const clearFilters = (): void => {
    const cleared = { ...NO_FILTERS, sort: filters.sort, dir: filters.dir }
    setFilters(cleared)
    void load(1, cleared)
  }

  const applySort = (next: ServerSortState): void => {
    const current = { ...filters, ...next }
    setFilters(current)
    void load(1, current)
  }

  const sort = useServerSort({
    columns: SORT_COLUMNS,
    value: filters,
    total: result?.users.total,
    onSort: applySort,
    onChoose: (next) => setFilters((previous) => ({ ...previous, ...next })),
  })

  const changed = async (notice: string): Promise<void> => {
    toast.success(notice)
    await queryClient.invalidateQueries({ queryKey: adminUserKeys.all, refetchType: "none" })
    await load()
  }

  const openUser = (user: ManagedUser): void => {
    setViewing(user)
    setViewOpen(true)
  }

  const closeDialog = (open: boolean): void => {
    if (!open) setDialog(null)
  }

  return (
    <PageFrame
      title="Usuarios y roles"
      description="Cuentas de coordinación, docencia y biblioteca"
      size="wide"
      loading={!result && !error}
      actionsSkeleton={loading && !result ? ["w-44", "w-32"] : []}
      actions={
        result ? (
          <>
            <ImportSpreadsheetDialog title="Importar cuentas" kind="users" templateName="plantilla-usuarios.xlsx" columns={IMPORT_COLUMNS} onImported={(notice) => void changed(notice)} />
            <ManagedUserDialog roles={result.roles} careers={result.careers} onSaved={(notice) => void changed(notice)} />
          </>
        ) : null
      }
    >
      {error ? <LoadErrorState message={error} onRetry={() => void load()} /> : null}
      {loading && !result ? <LoadingSkeleton variant="table" columns={4} filters={3} actions={false} cellLines={[2, 1, 1, 1]} badges={[4]} /> : null}

      {result ? (
        <div className="flex flex-col gap-4">
          <form onSubmit={submit}>
            <FilterToolbar
              active={filtersActive}
              onClear={clearFilters}
              search={
                <Field>
                  <FieldLabel htmlFor="users-search" className="sr-only">
                    Buscar por nombre o correo
                  </FieldLabel>
                  <Input
                    id="users-search"
                    value={filters.q}
                    onChange={(event) => setFilter("q", event.target.value)}
                    type="search"
                    maxLength={120}
                    placeholder="Buscar por nombre o correo"
                  />
                </Field>
              }
              filters={
                <>
                  <Field>
                    <FieldLabel htmlFor="users-role" className="sr-only">
                      Rol
                    </FieldLabel>
                    <Select value={filters.role} onValueChange={(value) => setFilter("role", value)} name="role">
                      <SelectTrigger id="users-role">
                        <SelectValue placeholder="Todos los roles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">Todos los roles</SelectItem>
                          {result.roles.map((item) => (
                            <SelectItem key={item.codigo} value={item.codigo}>
                              {item.nombre}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="users-career" className="sr-only">
                      Carrera
                    </FieldLabel>
                    <Select value={filters.career} onValueChange={(value) => setFilter("career", value)} name="career">
                      <SelectTrigger id="users-career">
                        <SelectValue placeholder="Todas las carreras" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">Todas las carreras</SelectItem>
                          {result.careers.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.nombre}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="users-status" className="sr-only">
                      Estado
                    </FieldLabel>
                    <Select value={filters.status} onValueChange={(value) => setFilter("status", value)} name="status">
                      <SelectTrigger id="users-status">
                        <SelectValue placeholder="Todos los estados" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">Todos los estados</SelectItem>
                          <SelectItem value="active">Activos</SelectItem>
                          <SelectItem value="pending">Pendiente</SelectItem>
                          <SelectItem value="inactive">Inactivos</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <SortSelect sort={sort} inputId="users-sort" />
                </>
              }
            />
          </form>

          <SortStatus sort={sort} />
          <Table label="Usuarios y roles">
            <TableHeader>
              <TableRow>
                <SortableHead sort={sort} column="name">
                  Usuario
                </SortableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Carrera</TableHead>
                <SortableHead sort={sort} column="status" className="text-center">
                  Estado
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.users.data.length === 0 ? (
                <TableEmpty colSpan={4}>No se encontraron cuentas con estos filtros</TableEmpty>
              ) : (
                result.users.data.map((user) => {
                  const status = managedUserStatus(user)
                  const blocks = roleBlocks(user.roles)

                  return (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer"
                      onClick={(event) => activateRow(event.nativeEvent, () => openUser(user))}
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <span>
                            <button type="button" className={rowButtonClass} onClick={() => openUser(user)}>{user.nombre}</button>
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm text-muted-foreground">{user.correo_electronico}</span>
                            <span className="sm:hidden">
                              <StatusBadge label={status.label} tone={status.tone} />
                            </span>
                          </span>
                          <div className="mt-3 flex flex-col gap-1 text-sm font-normal sm:hidden">
                            <span data-user-roles-label className="text-xs font-medium text-muted-foreground">
                              Roles
                            </span>
                            {blocks.length ? (
                              <ul className="flex flex-col gap-1">
                                {blocks.map((block) => (
                                  <li key={block.roles.join()} data-user-role-line>
                                    {blockLine(block)}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-muted-foreground">Sin rol vigente</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="h-px py-0" data-card-hide="true">
                        {blocks.length ? (
                          <ul className="-mx-2 grid h-full min-h-11 auto-rows-[minmax(2.25rem,1fr)]">
                            {blocks.map((block) => (
                              <li
                                key={block.roles.join()}
                                className="flex flex-col justify-center border-border px-2 not-first:border-t"
                                style={{ gridRow: `span ${block.careers.length}` }}
                              >
                                {block.roles.map((name) => (
                                  <span key={name}>{name}</span>
                                ))}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-sm text-muted-foreground">Sin rol vigente</span>
                        )}
                      </TableCell>
                      <TableCell className="h-px py-0" data-card-hide="true">
                        {blocks.length ? (
                          <ul className="-mx-2 grid h-full min-h-11 auto-rows-[minmax(2.25rem,1fr)] text-sm">
                            {blocks.flatMap((block) =>
                              block.careers.map((career) => (
                                <li
                                  key={`${block.roles.join()}-${career}`}
                                  className={cn("flex items-center border-border px-2 not-first:border-t", !block.scoped && "text-muted-foreground")}
                                >
                                  {career}
                                </li>
                              )),
                            )}
                          </ul>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center" data-card-hide="true">
                        <StatusBadge label={status.label} tone={status.tone} />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          {viewing ? (
            <ManagedUserDetailDialog
              key={viewing.id}
              open={viewOpen}
              onOpenChange={setViewOpen}
              user={viewing}
              roles={result.roles}
              careers={result.careers}
              canEdit={viewing.id !== currentUserId}
              onSaved={(notice) => void changed(notice)}
              onAction={setDialog}
            />
          ) : null}
          {viewing ? <ManagedUserAccessAction open={dialog === "access"} onOpenChange={closeDialog} user={viewing} onChanged={(notice) => void changed(notice)} /> : null}
          {viewing ? (
            <ManagedUserPendingActions
              resendOpen={dialog === "resend"}
              onResendOpenChange={closeDialog}
              deleteOpen={dialog === "delete"}
              onDeleteOpenChange={closeDialog}
              userId={viewing.id}
              userName={viewing.nombre}
              userEmail={viewing.correo_electronico}
              onChanged={(notice) => void changed(notice)}
            />
          ) : null}
          <TablePagination meta={result.users} label="Paginación de usuarios" onPageChange={(page) => void load(page)} />
        </div>
      ) : null}
    </PageFrame>
  )
}
