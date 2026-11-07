import { computed, onScopeDispose, watch, type MaybeRefOrGetter } from 'vue'
import { useMutation } from '@tanstack/vue-query'
import { useAccountQueryOwner } from './useAccountQueryOwner'

export interface AccountWriteContext {
  owner: string
  signal: AbortSignal
}
/** Mutation tracks status; the synchronous lock prevents double clicks before Vue's next tick. */
export function useAccountMutation<Input, Result>(
  operation: string,
  write: (input: Input, context: AccountWriteContext) => Promise<Result>,
  success: (result: Result, input: Input, owner: string) => void = () => {},
  expected?: MaybeRefOrGetter<string | undefined>,
) {
  const owner = useAccountQueryOwner(expected)
  let active: AbortController | undefined
  let disposed = false
  const mutation = useMutation(
    {
      mutationKey: computed(() => ['account-formula-write', owner.value ?? null, operation]),
      retry: false,
      networkMode: 'always',
      gcTime: 0,
      mutationFn: async (request: { input: Input; owner: string; controller: AbortController }) => {
        const { input, owner: expected, controller } = request

        function current() {
          controller.signal.throwIfAborted()
          if (disposed || owner.value !== expected)
            throw new DOMException('账号或页面已变化', 'AbortError')
        }

        current()

        const result = await write(input, { owner: expected, signal: controller.signal })

        current()
        return result
      },
      onSuccess: (result, { input, owner: expected, controller }) => {
        // The scope/identity can change between HTTP completion and this callback.
        if (!disposed && owner.value === expected && !controller.signal.aborted)
          success(result, input, expected)
      },
    },
    useNuxtApp().$queryClient,
  )

  watch(
    owner,
    () => {
      active?.abort()
      mutation.reset()
    },
    { flush: 'sync' },
  )
  onScopeDispose(() => {
    disposed = true
    active?.abort()
    mutation.reset()
  })

  async function execute(input: Input): Promise<Result> {
    if (disposed || !owner.value || active)
      throw new DOMException('当前不能重复提交，请确认账号', 'AbortError')

    const controller = new AbortController()

    active = controller
    try {
      const result = await mutation.mutateAsync({ input, owner: owner.value, controller })

      controller.signal.throwIfAborted()
      return result
    } catch (error) {
      controller.signal.throwIfAborted()
      throw error
    } finally {
      if (active === controller) active = undefined
    }
  }

  return { execute, busy: mutation.isPending, error: mutation.error }
}

export function isAccountWriteCancelled(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}
