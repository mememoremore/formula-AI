import type { AccountUser } from '#shared/types/account'
import { privateAccountKey } from '~/utils/account-state'
import { EXPORT_RECOVERY_KEY } from '~/utils/export-state'
/** 只观察已确认身份；网络失败不会被当作退出，也不会擅自清除演示数据。 */
export default defineNuxtPlugin((app) => {
  const session = useNuxtData<{ user: AccountUser | null }>('account-session')
  let previous: string | null | undefined
  function clearPrivate() {
    if (import.meta.client) {
      try {
        sessionStorage.removeItem(EXPORT_RECOVERY_KEY)
      } catch {
        /* 存储不可用时回执仍按账号隔离。 */
      }
    }
    const keys: string[] = []
    clearNuxtData((key) => {
      if (!privateAccountKey(key)) return false
      keys.push(key)
      return true
    })
    // 部分轮询使用上次快照作 default；身份边界必须清除这份回退展示。
    for (const key of keys) useNuxtData(key).data.value = undefined
  }
  function confirmedLogout() {
    session.data.value = { user: null }
    clearPrivate()
    useState<Record<string, string>>('page-origins', () => ({})).value = {}
    app.$uploadDraft.clearAccountState()
    app.$chatDraft.clear()
  }
  let stop: (() => void) | undefined
  if (import.meta.client)
    onNuxtReady(() => {
      stop = watch(
        session.data,
        (value) => {
          if (!value) return
          const owner = value.user?.id ?? null
          if (previous !== undefined && previous !== owner) {
            clearPrivate()
            useState<Record<string, string>>('page-origins', () => ({})).value = {}
          }
          if (previous !== owner) {
            app.$uploadDraft.confirmOwner(owner)
            app.$chatDraft.confirmOwner(owner)
          }
          previous = owner
        },
        { immediate: true, flush: 'sync' },
      )
    })
  onScopeDispose(() => stop?.())
  return { provide: { accountBoundary: { clearPrivate, confirmedLogout } } }
})
