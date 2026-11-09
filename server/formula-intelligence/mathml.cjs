const { mathjax } = require('mathjax-full/js/mathjax.js')
const { TeX } = require('mathjax-full/js/input/tex.js')
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js')
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js')
const { STATE } = require('mathjax-full/js/core/MathItem.js')
require('mathjax-full/js/input/tex/AllPackages.js')
RegisterHTMLHandler(liteAdaptor())
const doc = mathjax.document('', {
  InputJax: new TeX({
    packages: ['base', 'ams', 'boldsymbol', 'newcommand', 'mathtools'],
    maxMacros: 1000,
    maxBuffer: 10000,
  }),
})
exports.inspectFormula = (latex, inspect) => {
  if (
    typeof latex !== 'string' ||
    latex.length > 5000 ||
    /\\(?:href|url|includegraphics|require|html\w*)\b/i.test(latex)
  )
    throw Error('Invalid formula')
  try {
    const root = doc.convert(latex, { display: true, end: STATE.COMPILED })
    root.walkTree((n) => {
      if (n.kind === 'merror') throw Error('Invalid formula')
    })
    return inspect(root)
  } finally {
    doc.clear()
    doc.inputJax[0].reset()
  }
}
