import { Inject, Injectable } from "@nestjs/common"
import type { SessionPreloader } from "../../common/decorators/authenticated.options"
import type { SessionRequest } from "../../common/http/session-request"
import { isUuid } from "../../server/academic/structure"
import { MODELS } from "../../server/http/models"
import { modelNotFound } from "../../server/http/router"
import { ProcessesRepository } from "./processes.repository"

@Injectable()
export class ProcessPreloader implements SessionPreloader {
  constructor(@Inject(ProcessesRepository) private readonly processes: ProcessesRepository) {}

  async load(_request: Request, _user: unknown, http: SessionRequest): Promise<Response | null> {
    const id = String(http.params.process ?? "")
    const process = isUuid(id) ? await this.processes.find(id) : null
    if (process === null) return modelNotFound(MODELS.process, id)
    http.preloaded = process
    return null
  }
}
