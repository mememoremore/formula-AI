import { safeReturnPath } from '#shared/navigation'
/** 有可信站内历史则返回；直达时使用归属入口，避免返回外站或认证中转页。 */
export function usePageReturn(fallback: MaybeRefOrGetter<string>) {
  const route = useRoute()
  const router = useRouter()
  const origins = useState<Record<string, string>>('page-origins', () => ({}))
  const destination = computed(() =>
    safeReturnPath(origins.value[route.fullPath], toValue(fallback)),
  )
  async function goBack() {
    if (router.options.history.state.back === destination.value) router.back()
    else await router.replace(destination.value)
  }
  return { destination, goBack }
}
