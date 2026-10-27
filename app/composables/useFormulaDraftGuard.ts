/** 两类公式编辑共用确认规则；仅编辑器打开时保护，不持久化私有草稿。 */
export function useFormulaDraftGuard(
  open: Ref<boolean>,
  dirty: Ref<boolean>,
  saving: Ref<boolean>,
) {
  function canLeave() {
    if (!open.value) return true
    if (saving.value) return false
    return !dirty.value || window.confirm('公式修改尚未保存，确定放弃吗？')
  }
  onBeforeRouteLeave(canLeave)
  onBeforeRouteUpdate(canLeave)
  function beforeUnload(event: BeforeUnloadEvent) {
    if (!open.value || (!dirty.value && !saving.value)) return
    event.preventDefault()
    event.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onScopeDispose(() => {
    if (import.meta.client) window.removeEventListener('beforeunload', beforeUnload)
  })
  return { canLeave }
}
