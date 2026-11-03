/** 临时读失败保留成功快照；权限失败清空。离开页面停止，恢复网络或切回前台时只读恢复。 */
export function useTaskPolling<T>(
  key: string,
  url: string,
  active: (value: T) => boolean,
  options: {
    paused?: Ref<boolean>
    read?: (signal: AbortSignal) => Promise<T>
    getCachedData?: () => T | undefined
    onResume?: () => void
  } = {},
) {
  const requestFetch = useAccountFetch()
  const lastSuccess = shallowRef<T>()
  let failures = 0
  const request = useAsyncData<T | undefined>(
    key,
    async (_app, { signal }): Promise<T> => {
      try {
        // 转发 Nuxt 的取消信号；超时或页面离开时不让 HTTP 请求继续悬挂。
        const value = options.read
          ? await options.read(signal)
          : ((await requestFetch(url, { signal, retry: 0 })) as T)
        signal.throwIfAborted()
        failures = 0
        lastSuccess.value = value
        return value
      } catch (error) {
        failures = Math.min(failures + 1, 5)
        const failure = error as { statusCode?: number }
        if ([401, 403, 404].includes(failure?.statusCode ?? 0)) lastSuccess.value = undefined
        throw error
      }
    },
    {
      timeout: 15_000,
      dedupe: 'defer',
      // Nuxt 默认在读失败时重置 data；这里仅回退到本页面上次成功的数据。
      default: () => lastSuccess.value,
      ...(options.getCachedData
        ? {
            getCachedData: (_key: string, _app: unknown, context: { cause: string }) =>
              context.cause === 'initial' ? options.getCachedData!() : undefined,
          }
        : {}),
    },
  )
  // SSR 水合时不会再次执行 handler，同样需要记住成功快照。
  watch(
    request.data,
    (value) => {
      if (value) lastSuccess.value = value
    },
    { immediate: true },
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  const forbidden = () => [401, 403, 404].includes(request.error.value?.statusCode ?? 0)
  const available = () => navigator.onLine && document.visibilityState !== 'hidden'
  let resuming = false
  let lastResume = 0
  async function resume() {
    if (
      disposed ||
      !available() ||
      forbidden() ||
      resuming ||
      request.status.value === 'pending' ||
      Date.now() - lastResume < 1000
    )
      return
    resuming = true
    lastResume = Date.now()
    clearTimeout(timer)
    try {
      await request.refresh()
      if (!disposed && !request.error.value) options.onResume?.()
    } finally {
      resuming = false
      schedule()
    }
  }
  function visibility() {
    if (available()) void resume()
    else clearTimeout(timer)
  }
  function schedule() {
    clearTimeout(timer)
    if (
      import.meta.server ||
      disposed ||
      !available() ||
      forbidden() ||
      resuming ||
      (options.paused?.value && !request.error.value) ||
      request.status.value === 'pending' ||
      (!request.data.value && !request.error.value) ||
      (request.data.value && !active(request.data.value) && !request.error.value)
    )
      return
    timer = setTimeout(
      () => {
        void request.refresh()
      },
      request.error.value ? Math.min(30000, 2000 * 2 ** Math.max(0, failures - 1)) : 1500,
    )
  }
  watch([request.data, request.error, request.status, () => options.paused?.value], schedule)
  onMounted(() => {
    window.addEventListener('online', visibility)
    window.addEventListener('offline', visibility)
    window.addEventListener('pageshow', visibility)
    document.addEventListener('visibilitychange', visibility)
    schedule()
  })
  onScopeDispose(() => {
    disposed = true
    clearTimeout(timer)
    if (import.meta.client) {
      window.removeEventListener('online', visibility)
      window.removeEventListener('offline', visibility)
      window.removeEventListener('pageshow', visibility)
      document.removeEventListener('visibilitychange', visibility)
    }
  })
  return request
}
