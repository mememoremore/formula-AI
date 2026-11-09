import { requireAccountReader } from '../../utils/auth'
import { getDatabase } from '../../utils/database'
import { workspaceRequest } from '../../utils/workspace-operation'
import { learningView } from '../../database/formula-learning'
import { explanationConditions } from '../../database/learning-context'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountReader(event),
      db = getDatabase()
    const all = getQuery(event).all === 'true'
    const rows = await db.formulaLearning.findMany({
      where: {
        ownerId: user.id,
        reviewEnabled: true,
        ...(all ? {} : { nextReviewAt: { lte: new Date() } }),
        formula: { ownerId: user.id, deletedAt: null, canonicalId: null },
      },
      orderBy: [{ nextReviewAt: 'asc' }, { formulaId: 'asc' }],
      take: 100,
      include: {
        formula: {
          include: {
            versions: { orderBy: { number: 'desc' }, take: 1 },
            category: true,
            recognitionTask: { select: { inputFile: { select: { id: true, status: true } } } },
          },
        },
      },
    })
    return {
      items: await Promise.all(
        rows.map(async (row) => ({
          id: row.formulaId,
          title: row.formula.title,
          category: row.formula.category?.name ?? '未分类',
          latex: row.formula.versions[0]?.latex ?? '',
          imageId:
            row.formula.recognitionTask?.inputFile.status === 'READY'
              ? row.formula.recognitionTask.inputFile.id
              : null,
          learning: {
            ...learningView(row),
            conditions: row.conditionsCustomized
              ? row.conditions
              : await explanationConditions(db, user.id, row.formulaId),
          },
        })),
      ),
    }
  }),
)
