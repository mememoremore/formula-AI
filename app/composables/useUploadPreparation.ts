import { toRaw, type Ref } from 'vue'
import { preparationStorage, type RegionDraft } from '~/utils/preparation-storage'

interface Draft {
  file: File
  original: File
  mode: 'single' | 'multiple'
  regions: RegionDraft[]
}
export function useUploadPreparation(
  owner: Ref<string | undefined>,
  file: Ref<File | null>,
  original: Ref<File | null>,
  mode: Ref<'single' | 'multiple'>,
  regions: Ref<RegionDraft[]>,
) {
  const recoverable = ref<Draft | null>(null),
    status = ref(''),
    restoring = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined,
    loaded = false,
    stopped = false,
    disposed = false
  const key = (id: string) => 'upload:' + id

  async function save() {
    const id = owner.value

    if (!id || !loaded || stopped || disposed || restoring.value) return false
    try {
      if (!file.value || !original.value) {
        await preparationStorage(key(id), 'delete')
        return true
      }

      const data: Draft = {
        file: toRaw(file.value),
        original: toRaw(original.value),
        mode: mode.value,
        regions: regions.value.map((row) => ({
          ...row,
          bbox: [...row.bbox],
          file: toRaw(row.file),
        })),
      }

      if (
        data.file.size +
          data.original.size +
          data.regions.reduce((n, row) => n + row.file.size, 0) >
        200 * 1024 * 1024
      )
        throw new Error('large draft')
      await preparationStorage(key(id), 'write', data)
      if (owner.value === id) status.value = '已自动保存本机草稿'
      return true
    } catch {
      if (owner.value === id) status.value = '本机草稿未保存，请检查浏览器存储空间'
      return false
    }
  }

  async function load() {
    const id = owner.value

    loaded = false
    clearTimeout(timer)
    recoverable.value = null
    if (!id) return
    try {
      const row = await preparationStorage<Draft>(key(id), 'read')

      if (
        !disposed &&
        owner.value === id &&
        row?.file instanceof File &&
        row.original instanceof File &&
        ['single', 'multiple'].includes(row.mode) &&
        Array.isArray(row.regions)
      )
        recoverable.value = row
    } catch {
    } finally {
      if (owner.value === id) loaded = true
    }
  }

  watch(
    [file, original, mode, regions],
    () => {
      if (!loaded || stopped || restoring.value) return
      clearTimeout(timer)
      status.value = '正在保存本机草稿…'
      timer = setTimeout(() => void save(), 700)
    },
    { deep: true },
  )
  watch(owner, () => void load())
  onMounted(() => void load())

  async function restore() {
    const row = recoverable.value

    if (!row) return
    restoring.value = true
    mode.value = row.mode
    regions.value = row.regions
    original.value = row.original
    file.value = row.file
    await nextTick()
    restoring.value = false
    recoverable.value = null
    status.value = '已恢复本机草稿'
  }

  async function clear(id = owner.value) {
    stopped = true
    clearTimeout(timer)
    if (id) await preparationStorage(key(id), 'delete').catch(() => undefined)
    recoverable.value = null
  }

  async function discard() {
    if (owner.value) await preparationStorage(key(owner.value), 'delete').catch(() => undefined)
    recoverable.value = null
  }

  onBeforeRouteLeave(async () => {
    if (!file.value || stopped || !owner.value) return true
    clearTimeout(timer)
    return (await save()) || window.confirm('本机草稿未保存，离开后需要重新选图，是否继续？')
  })
  onScopeDispose(() => {
    disposed = true
    clearTimeout(timer)
  })
  return { recoverable, status, restoring, restore, clear, discard }
}
