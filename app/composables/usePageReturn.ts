import { pageReturnDestination } from '#shared/navigation'
/** 有可信站内历史则返回；直达时使用归属入口，避免返回外站或认证中转页。 */
export function usePageReturn(fallback: MaybeRefOrGetter<string>) {
  const route = useRoute()
  const router = useRouter()
  const origins = useState<Record<string, string>>('page-origins', () => ({}))
  const historyBack = ref<unknown>()
  // 挂载后读取浏览器状态，避免 SSR 与 hydration 首帧的 href 不一致。
  function readHistory() {
    historyBack.value = router.options.history.state.back
  }
  onMounted(readHistory)
  watch(() => route.fullPath, readHistory)
  const destination = computed(() =>
    pageReturnDestination(
      route.path,
      origins.value[route.fullPath],
      historyBack.value,
      toValue(fallback),
    ),
  )
  async function goBack() {
    if (router.options.history.state.back === destination.value) router.back()
    else await router.replace(destination.value)
  }
  return { destination, goBack }
}
