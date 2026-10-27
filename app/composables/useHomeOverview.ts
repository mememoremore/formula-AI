import { emptyHomeRecent, loadHomeRecent, homeDemoConversation } from '~/utils/home-overview'

/** 只编排首页，不承担全站缓存失效、认证或任务状态机。 */
export function useHomeOverview(session: ReturnType<typeof useWorkspace>) {
  const route = useRoute()
  const store = useDemoStore()
  const { preview } = useUploadPreview()
  const requestFetch = useRequestFetch()
  const ownerId = computed(() =>
    !session.error.value && !session.demo.value ? (session.data.value?.user?.id ?? null) : null,
  )
  const request = useAsyncData(
    'home-recent',
    (_app, { signal }) =>
      ownerId.value
        ? loadHomeRecent(ownerId.value, requestFetch, signal)
        : Promise.resolve(emptyHomeRecent()),
    { watch: [ownerId], lazy: true },
  )
  const recent = computed(() =>
    ownerId.value && request.data.value?.ownerId === ownerId.value
      ? request.data.value
      : emptyHomeRecent(),
  )
  const demoFormula = computed(() => store.value.formulas[0])
  const demoConversation = computed(() => homeDemoConversation(store.value))
  const loading = computed(
    () =>
      session.status.value === 'pending' || (!!ownerId.value && request.status.value === 'pending'),
  )
  const uploadTo = computed(() => (route.query.space === 'demo' ? '/upload?space=demo' : '/upload'))
  const cameraTo = computed(
    () => uploadTo.value + (uploadTo.value.includes('?') ? '&' : '?') + 'source=camera',
  )
  const libraryTo = computed(() => (session.demo.value ? '/library?space=demo' : '/library'))
  return {
    session,
    request,
    recent,
    demo: session.demo,
    demoFormula,
    demoConversation,
    preview,
    loading,
    uploadTo,
    cameraTo,
    libraryTo,
    retrySession: () => session.refresh(),
    retryRecent: () => request.refresh(),
  }
}
