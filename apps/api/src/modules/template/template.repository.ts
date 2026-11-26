import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import type { SyllabusTemplate } from "../../server/configuration/templatePresentation"
import { createTemplateStore, type LiveField, type StoredValue, type TemplateStore } from "../../server/shared/templateStore"

@Injectable()
export class TemplateRepository implements TemplateStore {
  private readonly store: TemplateStore

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.store = createTemplateStore(prisma)
  }

  template(): Promise<SyllabusTemplate | null> {
    return this.store.template()
  }

  subjectValues(subjectId: string): Promise<StoredValue[]> {
    return this.store.subjectValues(subjectId)
  }

  valuesForSubjects(subjectIds: string[], fieldIds: string[]): Promise<StoredValue[]> {
    return this.store.valuesForSubjects(subjectIds, fieldIds)
  }

  liveFields(ids: string[], careerOnly: boolean): Promise<LiveField[]> {
    return this.store.liveFields(ids, careerOnly)
  }
}
