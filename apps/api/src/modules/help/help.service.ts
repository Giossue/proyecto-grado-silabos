import { Injectable } from "@nestjs/common"
import type { AppSession } from "../../server/auth/types"
import type { PhpArray } from "../../server/http/input"
import { availableScreenHelpFor, screenHelpFor } from "../../server/operations/screenHelp"

@Injectable()
export class HelpService {
  screen(input: PhpArray): Promise<Response> {
    return screenHelpFor(input)
  }

  available(session: AppSession): Response {
    return availableScreenHelpFor(session)
  }
}
