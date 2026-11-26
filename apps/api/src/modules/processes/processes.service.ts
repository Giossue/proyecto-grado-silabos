import { Inject, Injectable } from "@nestjs/common"
import type { AppSession, BridgeDeps } from "../../server/auth/types"
import type { PhpArray } from "../../server/http/input"
import type { TemplateStore } from "../../server/shared/templateStore"
import { closeBoundProcess, type ClosingDeps } from "../../server/syllabus/processClosing"
import { createProcessFor, pauseBoundProcess, processImpactOf, processList, type ProcessCoreDeps, type ProcessRow } from "../../server/syllabus/processes"
import { deleteBoundProcess, extendBoundProcessDeadline, resumeBoundProcess, type ProcessWriteDeps } from "../../server/syllabus/processWrites"
import { AUTH_BRIDGE } from "../auth/auth.tokens"
import { ProcessesRepository } from "./processes.repository"
import { INSTITUTION_TODAY, PROCESS_CLOSING, PROCESS_WRITES, TEMPLATE_STORE } from "./processes.tokens"

export type ProcessWrites = Omit<ProcessWriteDeps, "bridge">
export type ProcessClosing = Pick<ClosingDeps, "transaction">

@Injectable()
export class ProcessesService {
  constructor(
    @Inject(ProcessesRepository) private readonly processes: ProcessesRepository,
    @Inject(TEMPLATE_STORE) private readonly templates: TemplateStore,
    @Inject(INSTITUTION_TODAY) private readonly today: () => string,
    @Inject(PROCESS_WRITES) private readonly writes: ProcessWrites,
    @Inject(PROCESS_CLOSING) private readonly closing: ProcessClosing,
    @Inject(AUTH_BRIDGE) private readonly bridge: BridgeDeps,
  ) {}

  list(): Promise<Response> {
    return processList(this.core())
  }

  create(session: AppSession, input: PhpArray): Promise<Response> {
    return createProcessFor(session, input, this.core())
  }

  impact(process: ProcessRow): Promise<Response> {
    return processImpactOf(process, this.core())
  }

  pause(session: AppSession, process: ProcessRow, input: PhpArray): Promise<Response> {
    return pauseBoundProcess(session, process, input, this.core())
  }

  resume(original: Request, session: AppSession, process: ProcessRow, input: PhpArray): Promise<Response> {
    return resumeBoundProcess(original, session, process, input, this.writeDeps())
  }

  close(session: AppSession, process: ProcessRow, input: PhpArray): Promise<Response> {
    return closeBoundProcess(session, process, input, this.closing)
  }

  remove(original: Request, session: AppSession, process: ProcessRow): Promise<Response> {
    return deleteBoundProcess(original, session, process, this.writeDeps())
  }

  extendDeadline(original: Request, session: AppSession, process: ProcessRow, input: PhpArray): Promise<Response> {
    return extendBoundProcessDeadline(original, session, process, input, this.writeDeps())
  }

  private core(): ProcessCoreDeps {
    return { processes: this.processes, templates: this.templates, today: this.today, now: this.bridge.now }
  }

  private writeDeps(): ProcessWriteDeps {
    return { bridge: this.bridge, ...this.writes }
  }
}
