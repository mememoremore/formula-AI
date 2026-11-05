import type { z } from 'zod'
import type { manualFormulaInputSchema } from '../schemas/manual-formula-input'
export type ManualFormulaInput = z.output<typeof manualFormulaInputSchema>
