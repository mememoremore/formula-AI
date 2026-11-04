import { useAccountFetch } from './useAccountFetch'
import { ref, shallowRef, onMounted, type Ref } from 'vue'
import type { SavedFormula } from '#shared/types/workspace'
import {
  MANUAL_CREATION_RECOVERY_KEY,
  parseManualCreationReceipt,
  type ManualCreationReceipt,
} from '~/utils/manual-creation'
import { useAccountMutation } from './useAccountMutation'
import { useFormulaViewsInvalidation } from './useFormulaViewsInvalidation'
/** A session-only, owner-bound receipt keeps the exact body/key for uncertain requests. */
export function useManualFormulaCreation(ownerId: Ref<string>) {
  const accountFetch = useAccountFetch()
  const invalidateFormulaViews = useFormulaViewsInvalidation()
  const receipt = shallowRef<ManualCreationReceipt | null>(null),
    ready = ref(false),
    recoveryError = ref('')
  onMounted(() => {
    try {
      const raw = sessionStorage.getItem(MANUAL_CREATION_RECOVERY_KEY)
      receipt.value = parseManualCreationReceipt(raw, ownerId.value)
      if (raw && !receipt.value) sessionStorage.removeItem(MANUAL_CREATION_RECOVERY_KEY)
      ready.value = true
    } catch {
      recoveryError.value = '上次保存回执无法安全读取，请先核对公式库；不会自动创建新请求。'
    }
  })
  function discard() {
    if (busy.value) return false
    try {
      sessionStorage.removeItem(MANUAL_CREATION_RECOVERY_KEY)
      receipt.value = null
      recoveryError.value = ''
      ready.value = true
      return true
    } catch {
      recoveryError.value = '浏览器无法清理保存回执，请检查会话存储权限。'
      return false
    }
  }
  const mutation = useAccountMutation(
    'create',
    async (input: { title: string; latex: string }, { owner, signal }): Promise<SavedFormula> => {
      if (!ready.value || ownerId.value !== owner)
        throw new Error('当前不能保存，请先确认账号与保存回执。')
      try {
        const intent = receipt.value ?? {
          ownerId: owner,
          input: {
            title: input.title.trim(),
            latex: input.latex.trim(),
            requestKey: crypto.randomUUID(),
          },
        }
        if (intent.ownerId !== owner) throw new Error('账号已变化，请重新读取页面。')
        // Persist before the first HTTP write; storage failure must not send an unrepeatable request.
        sessionStorage.setItem(MANUAL_CREATION_RECOVERY_KEY, JSON.stringify(intent))
        receipt.value = intent
        const result = await accountFetch<SavedFormula>('/api/account/formulas', {
          method: 'POST',
          body: intent.input,
          headers: { 'x-account-id': owner },
          signal,
          retry: 0,
          timeout: 20_000,
        })
        signal.throwIfAborted()
        if (ownerId.value !== owner) throw new DOMException('账号或页面已变化', 'AbortError')
        try {
          sessionStorage.removeItem(MANUAL_CREATION_RECOVERY_KEY)
        } catch {
          /* A retained receipt can only replay the same create. */
        }
        receipt.value = null
        return result
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (
          !signal.aborted &&
          [400, 401, 403, 404, 409, 413, 415, 422, 429].includes(status ?? 0)
        ) {
          try {
            sessionStorage.removeItem(MANUAL_CREATION_RECOVERY_KEY)
            receipt.value = null
          } catch {
            recoveryError.value = '请先检查会话存储权限，保存回执仍保留。'
          }
        }
        throw error
      }
    },
    (_result, _input, owner) => {
      void invalidateFormulaViews(owner)
    },
    ownerId,
  )
  const busy = mutation.busy
  function save(title: string, latex: string) {
    return mutation.execute({ title, latex })
  }
  return { receipt, busy, ready, recoveryError, save, discard }
}
