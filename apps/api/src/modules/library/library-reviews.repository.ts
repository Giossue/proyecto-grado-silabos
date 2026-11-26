import { Inject, Injectable } from "@nestjs/common"
import type { LibrarySort, ListSort } from "@silabos/shared/schemas/listSort"
import { PrismaService } from "../../prisma/prisma.service"
import { createLibraryReviewRepository } from "../../server/library/reviewQueries"
import type { FilterTable, LibraryReviewRepository, ReviewFilters, ReviewRow, SyllabusSummary } from "../../server/library/reviews"

@Injectable()
export class LibraryReviewsRepository implements LibraryReviewRepository {
  private readonly reviews: LibraryReviewRepository

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.reviews = createLibraryReviewRepository(prisma)
  }

  page(filters: ReviewFilters, page: number, perPage: number, sort: ListSort<LibrarySort> = null): Promise<{ total: number; items: ReviewRow[] }> {
    return this.reviews.page(filters, page, perPage, sort)
  }

  summaries(ids: string[]): Promise<Map<string, SyllabusSummary>> {
    return this.reviews.summaries(ids)
  }

  userNames(ids: string[]): Promise<Map<string, string>> {
    return this.reviews.userNames(ids)
  }

  faculties(): Promise<{ id: string; name: string }[]> {
    return this.reviews.faculties()
  }

  pastPeriods(): Promise<{ id: string; code: string }[]> {
    return this.reviews.pastPeriods()
  }

  existing(table: FilterTable, ids: string[]): Promise<number> {
    return this.reviews.existing(table, ids)
  }
}
