/** 临时读失败保留成功快照；权限失败清空。离开页面停止，恢复由用户显式重试。 */
export function useTaskPolling<T>(
  key: string,
  url: string,
  active: (value: T) => boolean,
  options: {
    paused?: Ref<boolean>
    read?: (signal: AbortSignal) => Promise<T>
    getCachedData?: () => T | undefined
  } = {},
) {
  const requestFetch = useRequestFetch()
  const lastSuccess = shallowRef<T>()
  const request = useAsyncData<T | undefined>(
    key,
    async (_app, { signal }): Promise<T> => {
      try {
        // 转发 Nuxt 的取消信号；超时或页面离开时不让 HTTP 请求继续悬挂。
        const value = options.read
          ? await options.read(signal)
          : ((await requestFetch(url, { signal, retry: 0 })) as T)
        signal.throwIfAborted()
        lastSuccess.value = value
        return value
      } catch (error) {
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
  function schedule() {
    clearTimeout(timer)
    if (
      import.meta.server ||
      disposed ||
      options.paused?.value ||
      request.status.value === 'pending' ||
      request.error.value ||
      !request.data.value ||
      !active(request.data.value)
    )
      return
    timer = setTimeout(() => {
      void request.refresh()
    }, 1500)
  }
  watch([request.data, request.error, request.status, () => options.paused?.value], schedule)
  onMounted(schedule)
  onScopeDispose(() => {
    disposed = true
    clearTimeout(timer)
  })
  return request
}
