import { requireAccountReader } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountReader(event),
      db = getDatabase(),
      ownerId = user.id
    const active = ['QUEUED', 'PROCESSING'] as const
    const counts = Promise.all([
      db.recognitionBatch.count({ where: { ownerId, status: { in: ['RUNNING', 'PAUSED'] } } }),
      db.recognitionTask.count({
        where: { ownerId, status: { in: [...active] }, batchParts: { none: {} } },
      }),
      db.chatTurn.count({ where: { ownerId, status: { in: [...active] } } }),
      db.exportTask.count({ where: { ownerId, status: { in: [...active] } } }),
    ])
    if (getQuery(event).summary === 'true')
      return { active: (await counts).reduce((sum, count) => sum + count, 0), items: [] }
    const [batches, recognitions, chats, exports, totals] = await Promise.all([
      db.recognitionBatch.findMany({
        where: { ownerId, historyDeletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
      }),
      db.recognitionTask.findMany({
        where: { ownerId, historyDeletedAt: null, batchParts: { none: {} } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
      }),
      db.chatTurn.findMany({
        where: { ownerId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
      }),
      db.exportTask.findMany({
        where: { ownerId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
      }),
      counts,
    ])
    const items = [
      ...batches.map((t) => ({
        id: t.id,
        kind: 'batch',
        title: '批量识别',
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        error: t.errorMessage,
        to: '/batches/' + t.id,
      })),
      ...recognitions.map((t) => ({
        id: t.id,
        kind: 'recognition',
        title: t.requestedTitle || '公式识别',
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        error: t.errorMessage,
        to: '/recognitions/' + t.id,
      })),
      ...chats.map((t) => ({
        id: t.id,
        kind: 'chat',
        title: 'AI回答',
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        error: t.errorMessage,
        to: '/ai/' + t.conversationId,
      })),
      ...exports.map((t) => ({
        id: t.id,
        kind: 'export',
        title: 'Word导出',
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        error: t.errorMessage,
        to: '/exports/' + t.id,
      })),
    ]
    return {
      active: totals.reduce((sum, count) => sum + count, 0),
      items: items
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(0, 20),
    }
  }),
)
