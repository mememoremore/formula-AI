import { demoCategories, demoFormulas } from '../../shared/demo/formulas'

export default defineEventHandler(() => ({
  items: demoFormulas,
  categories: demoCategories,
  isMock: true,
}))
