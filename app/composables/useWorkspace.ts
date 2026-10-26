/** 会话故障不降级为游客数据；演示空间只能显式进入。 */
export function useWorkspace() {
  const route = useRoute()
  const session = useAccountSession()
  const demo = computed(
    () => route.query.space === 'demo' || (!session.data.value?.user && !session.error.value),
  )
  return { ...session, demo }
}
