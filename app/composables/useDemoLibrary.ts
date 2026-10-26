import type { Formula, RecognitionResult } from '#shared/types/api'

export function useDemoLibrary() {
  const state = useDemoStore()
  const formulas = computed(() => state.value.formulas)
  const categories = computed(() => state.value.categories)

  function toggleFavorite(id: string) {
    const formula = formulas.value.find((item) => item.id === id)
    if (formula) formula.favorite = !formula.favorite
  }

  function updateFormula(id: string, latex: string, title: string, categoryId: string | null) {
    const formula = formulas.value.find((item) => item.id === id)
    if (!formula || !latex.trim() || latex.length > 5000 || !title.trim()) return false
    if (formula.latex !== latex.trim()) {
      formula.versionId = crypto.randomUUID()
      formula.latex = latex.trim()
      formula.versions.push({
        id: formula.versionId,
        latex: formula.latex,
        createdAt: new Date().toISOString(),
      })
    }
    formula.title = title.trim().slice(0, 100)
    formula.categoryId = categoryId
    formula.updatedAt = new Date().toISOString()
    return true
  }

  function addRecognition(result: RecognitionResult, imageName: string): Formula {
    const now = new Date().toISOString()
    const formula: Formula = {
      id: result.requestId,
      title: '公式识别示例',
      latex: result.latex,
      originalLatex: result.latex,
      versionId: crypto.randomUUID(),
      versions: [],
      categoryId: null,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      source: 'mock-recognition',
      imageName,
    }
    formula.versions = [{ id: formula.versionId, latex: formula.latex, createdAt: now }]
    state.value.formulas.unshift(formula)
    return formula
  }

  function addCategory(name: string) {
    const cleaned = name.trim().slice(0, 20)
    if (!cleaned || categories.value.some((item) => item.name === cleaned)) return false
    state.value.categories.push({ id: crypto.randomUUID(), name: cleaned })
    return true
  }

  return { formulas, categories, toggleFavorite, updateFormula, addRecognition, addCategory }
}
