import type { PrismaClient } from '../server/generated/prisma/client'

export const seedIds = {
  userA: '11111111-1111-4111-8111-111111111111',
  userB: '22222222-2222-4222-8222-222222222222',
  categoryA: 'c1111111-1111-4111-8111-111111111111',
  categoryB: 'c2222222-2222-4222-8222-222222222222',
  fileA: 'f1111111-1111-4111-8111-111111111111',
  fileB: 'f2222222-2222-4222-8222-222222222222',
  taskA: 'a1111111-1111-4111-8111-111111111111',
  taskB: 'a2222222-2222-4222-8222-222222222222',
  formulaA: '31111111-1111-4111-8111-111111111111',
  formulaB: '32222222-2222-4222-8222-222222222222',
  originalA: '41111111-1111-4111-8111-111111111111',
  revisionA: '41111111-1111-4111-8111-111111111112',
  originalB: '42222222-2222-4222-8222-222222222222',
  conversationA: '51111111-1111-4111-8111-111111111111',
  conversationB: '52222222-2222-4222-8222-222222222222',
}

/** 固定 ID + ON CONFLICT DO NOTHING：重复执行不增加记录，也不覆盖已有修改。 */
export async function seedDatabase(db: PrismaClient) {
  const createdAt = new Date('2026-10-20T00:00:00.000Z')
  const startedAt = new Date('2026-10-20T00:00:01.000Z')
  const finishedAt = new Date('2026-10-20T00:00:02.000Z')

  await db.$transaction(
    async (tx) => {
      await tx.user.createMany({
        skipDuplicates: true,
        data: [
          { id: seedIds.userA, email: 'seed-a@formula.test', displayName: '开发样例用户 A' },
          { id: seedIds.userB, email: 'seed-b@formula.test', displayName: '开发样例用户 B' },
        ],
      })
      await tx.category.createMany({
        skipDuplicates: true,
        data: [
          { id: seedIds.categoryA, ownerId: seedIds.userA, name: '大学物理' },
          { id: seedIds.categoryB, ownerId: seedIds.userB, name: '大学物理' },
        ],
      })
      await tx.storedFile.createMany({
        skipDuplicates: true,
        data: [
          {
            id: seedIds.fileA,
            ownerId: seedIds.userA,
            kind: 'IMAGE',
            bucket: 'development-fixtures',
            objectKey: 'seed/user-a/formula.png',
            name: 'formula-a.png',
            mimeType: 'image/png',
            sizeBytes: 1024,
          },
          {
            id: seedIds.fileB,
            ownerId: seedIds.userB,
            kind: 'IMAGE',
            bucket: 'development-fixtures',
            objectKey: 'seed/user-b/formula.png',
            name: 'formula-b.png',
            mimeType: 'image/png',
            sizeBytes: 1024,
          },
        ],
      })
      await tx.recognitionTask.createMany({
        skipDuplicates: true,
        data: [
          {
            id: seedIds.taskA,
            ownerId: seedIds.userA,
            inputFileId: seedIds.fileA,
            requestKey: 'seed-recognition-a',
            mode: 'HANDWRITTEN',
            status: 'COMPLETED',
            attemptCount: 1,
            createdAt,
            startedAt,
            finishedAt,
          },
          {
            id: seedIds.taskB,
            ownerId: seedIds.userB,
            inputFileId: seedIds.fileB,
            requestKey: 'seed-recognition-b',
            mode: 'PRINTED',
            status: 'COMPLETED',
            attemptCount: 1,
            createdAt,
            startedAt,
            finishedAt,
          },
        ],
      })
      await tx.formula.createMany({
        skipDuplicates: true,
        data: [
          {
            id: seedIds.formulaA,
            ownerId: seedIds.userA,
            title: '质能方程',
            categoryId: seedIds.categoryA,
            recognitionTaskId: seedIds.taskA,
          },
          {
            id: seedIds.formulaB,
            ownerId: seedIds.userB,
            title: '一元二次方程求根公式',
            categoryId: seedIds.categoryB,
            recognitionTaskId: seedIds.taskB,
          },
        ],
      })
      await tx.formulaVersion.createMany({
        skipDuplicates: true,
        data: [
          {
            id: seedIds.originalA,
            ownerId: seedIds.userA,
            formulaId: seedIds.formulaA,
            number: 1,
            latex: 'E = mc^2',
            origin: 'RECOGNITION',
            modelVersion: 'mock-v1',
            isMock: true,
          },
          {
            id: seedIds.revisionA,
            ownerId: seedIds.userA,
            formulaId: seedIds.formulaA,
            number: 2,
            latex: 'm = \\frac{E}{c^2}',
            origin: 'MANUAL',
            isMock: true,
          },
          {
            id: seedIds.originalB,
            ownerId: seedIds.userB,
            formulaId: seedIds.formulaB,
            number: 1,
            latex: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
            origin: 'RECOGNITION',
            modelVersion: 'mock-v1',
            isMock: true,
          },
        ],
      })
      await tx.favorite.createMany({
        skipDuplicates: true,
        data: [
          { ownerId: seedIds.userA, formulaId: seedIds.formulaA },
          { ownerId: seedIds.userB, formulaId: seedIds.formulaB },
        ],
      })
      await tx.conversation.createMany({
        skipDuplicates: true,
        data: [
          {
            id: seedIds.conversationA,
            ownerId: seedIds.userA,
            formulaVersionId: seedIds.originalA,
            title: '质能方程解析示例',
          },
          { id: seedIds.conversationB, ownerId: seedIds.userB, title: '普通对话示例' },
        ],
      })
      await tx.chatMessage.createMany({
        skipDuplicates: true,
        data: [
          {
            conversationId: seedIds.conversationA,
            ownerId: seedIds.userA,
            position: 1,
            role: 'USER',
            content: '请解释这个公式。',
            isMock: true,
          },
          {
            conversationId: seedIds.conversationA,
            ownerId: seedIds.userA,
            position: 2,
            role: 'ASSISTANT',
            content:
              '这是固定的数据库样例消息，不是真实 AI 回答。此会话绑定原始版本，后续修改不改变其上下文。',
            modelVersion: 'mock-v1',
            isMock: true,
          },
          {
            conversationId: seedIds.conversationB,
            ownerId: seedIds.userB,
            position: 1,
            role: 'USER',
            content: '这里可以保存不绑定公式的普通对话。',
            isMock: true,
          },
        ],
      })
    },
    { timeout: 15_000 },
  )
}
