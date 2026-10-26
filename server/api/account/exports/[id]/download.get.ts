import { requireAccountUser } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { getObjectStore } from '../../../../utils/storage'
import { workspaceOperation } from '../../../../utils/workspace-operation'
import { readExportTask } from '../../../../database/task-queries'
import { docxMimeType } from '../../../../documents/formula-document'
export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountUser(event)
    const id = getRouterParam(event, 'id') ?? ''
    const task = await readExportTask(getDatabase(), user.id, id)
    if (!task.downloadUrl)
      throw createError({ statusCode: 409, message: '文档还未生成成功，请稍后再试。' })
    const stored = await getDatabase().exportTask.findFirstOrThrow({
      where: { id, ownerId: user.id },
      include: { file: true },
    })
    const store = getObjectStore()
    if (!stored.file || stored.file.status !== 'READY' || stored.file.bucket !== store.bucket)
      throw createError({ statusCode: 503, message: '下载文件暂时不可用。' })
    const filename = stored.file.name.replace(/[\u0000-\u001f\u007f]/g, '')
    setResponseHeader(event, 'Content-Type', docxMimeType)
    setResponseHeader(
      event,
      'Content-Disposition',
      `attachment; filename="formula-v${task.versionNumber}.docx"; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, '%27')}`,
    )
    setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
    return store.get(stored.file.objectKey)
  }),
)
