import { requireSession } from "../auth/requireSession"
import type { AppSession } from "../auth/types"
import { requestInput } from "../http/input"
import { forbidden, apiJson, unauthenticated, validationError } from "../http/responses"
import type { Throttle } from "../http/throttle"
import { profileSchema } from "@silabos/shared/schemas/account"
import { validateSchema } from "../http/schemaValidation"
import { issueInvitation, updateManagedUserProfile, type Account } from "./accounts"
import {
  isAdministrator,
  passwordRecoveryThrottle,
  perform,
  stringOf,
  uniqueEmail,
  type IdentityWriteDeps,
} from "./accountWrites"
import { sessionPayload } from "./session"

async function answerSession(deps: IdentityWriteDeps, session: AppSession): Promise<Response> {
  const profile = await deps.session.profiles.find(session.user.id)
  if (profile === null) return unauthenticated()
  return apiJson(sessionPayload(session, profile, deps.session))
}

export async function updateProfile(request: Request, deps: IdentityWriteDeps): Promise<Response> {
  const original = request.clone()
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!isAdministrator(session)) return forbidden()
  const input = await requestInput(request)
  const { errors } = await validateSchema(profileSchema(uniqueEmail(deps, session.user.id)), input)
  if (errors !== null) return validationError(errors)
  const outcome = await perform(deps, original, session, (ctx) =>
    updateManagedUserProfile(ctx, session.user, { name: stringOf(input.nombre), email: stringOf(input.correo_electronico) }),
  )
  if (outcome instanceof Response) return outcome
  return answerSession(deps, session)
}

const RESEND_MESSAGE = "Si su cuenta aún no estaba activada, se envió un enlace de activación."

export async function resendOwnActivation(request: Request, deps: IdentityWriteDeps): Promise<Response> {
  const original = request.clone()
  let gate: Throttle | null = null
  const session = await requireSession(
    request,
    {
      activeRole: "optional",
      afterAuthentication: async () => {
        gate = passwordRecoveryThrottle(deps, request, await requestInput(request.clone()))
        return gate.hit()
      },
    },
    deps.bridge,
  )
  const finish = (response: Response) => (gate as Throttle | null)?.decorate(response) ?? response
  if (session instanceof Response) return finish(session)
  if (session.user.emailVerifiedAt === null) {
    const issuer = await deps.accounts.direct((tx) => tx.latestInvitationIssuer(session.user.id))
    const target = { id: session.user.id } as Account
    const outcome = await perform(deps, original, session, (ctx) => issueInvitation(ctx, target), issuer?.id ?? session.user.id)
    if (outcome instanceof Response) return finish(outcome)
  }
  return finish(apiJson({ message: RESEND_MESSAGE }, 202))
}
