// Conservative template matching, NOT a theorem prover. Never reduce equations
// to true/zero: that would merge unrelated identities. Keep the exact key intact.
const { inspectFormula } = require('./mathml.cjs')
const cache = new Map()
const functions = new Set([
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'sinh',
  'cosh',
  'tanh',
  'arcsin',
  'arccos',
  'arctan',
  'ln',
  'log',
  'exp',
])
// Change/differential markers must never become arbitrary scalar placeholders.
const constants = new Set(['π', 'ⅈ', 'ⅇ', 'Δ', '∇'])
const node = (op, ...args) => ({ op, args })
const signature = (value) => JSON.stringify(value)
const unsupported = () => {
  throw new Error('Unsupported or ambiguous template')
}

// Scalar addition/multiplication are associative and commutative. Sort by a
// variable-independent shape so renaming x -> theta cannot change term order.
// Do not reorder subtraction, division, powers or function arguments.
function canonicalize(tree) {
  if (!tree.args) return tree
  let args = tree.args.map(canonicalize)
  if (['add', 'multiply'].includes(tree.op)) {
    args = args.flatMap((part) => (part.op === tree.op ? part.args : [part]))
    const shape = (part) =>
      part.op === 'variable'
        ? '?'
        : JSON.stringify([part.op, part.value, part.variant, ...(part.args || []).map(shape)])
    args.sort((a, b) => shape(a).localeCompare(shape(b)))
  }
  return { ...tree, args }
}

function expression(root) {
  let size = 0
  function convert(item, depth = 0) {
    if (++size > 500 || depth > 50) unsupported()
    const children = item.childNodes || [],
      text = item.isToken ? item.getText().normalize('NFC') : ''
    if (['math', 'mrow', 'inferredMrow', 'TeXAtom', 'mstyle'].includes(item.kind)) {
      const values = children.filter((child) => child.kind !== 'mspace')
      return values.length === 1 ? convert(values[0], depth + 1) : row(values, depth + 1)
    }
    if (item.kind === 'mi') {
      if (functions.has(text)) return { fn: text }
      // Do not erase vector/upright/chemical notation into scalar variables.
      const variant = item.attributes.get('mathvariant')
      if (variant && !['italic', 'normal'].includes(variant)) unsupported()
      if (!/^\p{L}$/u.test(text)) unsupported()
      return {
        op: constants.has(text) ? 'constant' : 'variable',
        value: text,
        variant: variant || 'normal',
      }
    }
    if (item.kind === 'mn' && /^\d+(?:\.\d+)?$/.test(text)) return { op: 'number', value: text }
    if (item.kind === 'mo') {
      if (text === '\u2061') return { apply: true }
      if ('()+−-=·×/'.includes(text))
        return { token: text === '−' ? '-' : ['·', '×'].includes(text) ? '*' : text }
      unsupported()
    }
    if (item.kind === 'msup') {
      const base = convert(children[0], depth + 1),
        power = convert(children[1], depth + 1)
      // Symbolic exponents/binders have additional constraints we do not infer.
      if (power.op !== 'number' || Number(power.value) > 100) unsupported()
      if (base.token === ')') return { token: ')', power }
      return base.fn ? { fn: base.fn, power } : node('power', base, power)
    }
    if (
      item.kind === 'mfrac' &&
      !/^0(?:px|em|pt)?$/.test(String(item.attributes.get('linethickness')))
    )
      return node('divide', ...children.map((child) => convert(child, depth + 1)))
    if (item.kind === 'msqrt') return node('sqrt', row(children, depth + 1))
    // Integrals, derivatives, sums, matrices, scripts, unknown functions and
    // inequalities deliberately fall back to exact matching only.
    unsupported()
  }
  function row(children, depth) {
    const tokens = children.map((child) => convert(child, depth)),
      length = tokens.length
    let i = 0
    const startsAtom = (token) => token && (token.op || token.fn || token.token === '(')
    function parse(min = 0) {
      let part = tokens[i++]
      if (!part) unsupported()
      let left
      if (part.token === '(') {
        left = parse()
        const closing = tokens[i++]
        if (closing?.token !== ')') unsupported()
        if (closing.power) left = node('power', left, closing.power)
      } else if (part.token === '+' || part.token === '-')
        left = node(part.token === '-' ? 'negative' : 'positive', parse(21))
      else if (part.fn) {
        if (tokens[i]?.apply) i++
        if (!startsAtom(tokens[i])) unsupported()
        const grouped = tokens[i]?.token === '('
        const argumentStart = i
        left = node(`function:${part.fn}`, parse(21))
        if (tokens.slice(argumentStart, i).some((token) => token.token === ')' && token.power))
          unsupported()
        if (!grouped && startsAtom(tokens[i]) && !tokens[i].fn) unsupported()
        if (part.power) left = node('power', left, part.power)
      } else if (part.op) left = part
      else unsupported()
      while (i < length) {
        const token = tokens[i],
          implicit = startsAtom(token)
        const op = implicit ? '*' : token.token
        const priority =
          op === '=' ? 1 : ['+', '-'].includes(op) ? 10 : ['*', '/'].includes(op) ? 20 : -1
        if (priority < min) break
        if (!implicit) i++
        // f(x) is not safely distinguishable from scalar multiplication here.
        if (implicit && left.op === 'variable' && token.token === '(') unsupported()
        left = node(
          { '=': 'equal', '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide' }[op],
          left,
          parse(priority + 1),
        )
      }
      return left
    }
    const result = parse()
    if (i !== length) unsupported()
    return result
  }
  return convert(root)
}

function variables(tree, counts = new Map()) {
  if (tree.op === 'variable') counts.set(tree.value, (counts.get(tree.value) || 0) + 1)
  for (const child of tree.args || []) variables(child, counts)
  return counts
}
function template(latex) {
  if (cache.has(latex)) return cache.get(latex)
  let result = null
  try {
    if (
      String(latex).length > 2000 ||
      /\\(?:frac\s*\{?d\b|partial|mathrm|mathbf|boldsymbol)/.test(latex)
    )
      unsupported()
    const rawTree = inspectFormula(latex, expression)
    const tree = canonicalize(rawTree),
      counts = variables(tree)
    // A one-off relation a=b/c does not identify a physical law. Only propose
    // non-exact substitutions when the actual expression has a repeated scalar
    // relationship that can verify the same replacement in multiple positions.
    const rigid = (tree.args || []).some(
      (part) => part.op !== 'variable' && part.op !== 'number' && part.op !== 'constant',
    )
    const eligible =
      tree.op === 'equal' && rigid && [...counts.values()].some((count) => count >= 2)
    result = { tree, rawTree, eligible, rigid }
  } catch {
    /* Unsupported mathematics must not block a legitimate save. */
  }
  if (cache.size >= 2000) cache.delete(cache.keys().next().value)
  cache.set(latex, result)
  return result
}
function instantiate(pattern, candidate, compound = true) {
  const bindings = new Map(),
    used = new Set()
  function match(a, b) {
    if (a.op === 'variable') {
      if (!compound && b.op !== 'variable') return false
      if (!variables(b).size || ['equal'].includes(b.op)) return false
      const value = signature(b)
      if (bindings.has(a.value)) return bindings.get(a.value) === value
      // Different substituted expressions may share symbols, e.g. x+1 and
      // x+2. Do not collapse distinct placeholders to the identical subtree.
      if (used.has(value)) return false
      used.add(value)
      bindings.set(a.value, value)
      return true
    }
    if (
      a.op !== b.op ||
      a.value !== b.value ||
      a.variant !== b.variant ||
      (a.args || []).length !== (b.args || []).length
    )
      return false
    return (a.args || []).every((child, index) => match(child, b.args[index]))
  }
  return match(pattern, candidate)
}
function sameTemplate(a, b) {
  if (a === b) return true
  const first = template(a),
    second = template(b)
  if (!first || !second) return false
  // Preserve grouped compound substitutions before associative flattening:
  // x²+x -> (t+1)²+(t+1) must keep each whole replacement intact.
  if (
    (first.eligible && instantiate(first.rawTree, second.rawTree, first.rigid)) ||
    (second.eligible && instantiate(second.rawTree, first.rawTree, second.rigid))
  )
    return true
  if (
    (first.eligible && instantiate(first.tree, second.tree, first.rigid)) ||
    (second.eligible && instantiate(second.tree, first.tree, second.rigid))
  )
    return true
  // Compare repeated arguments derived from these two real expressions only.
  // No built-in/library formula is used as a generic bridge or canned template.
  function abstractArguments(tree) {
    const counts = new Map()
    function count(item) {
      const key = signature(item)
      counts.set(key, (counts.get(key) || 0) + 1)
      ;(item.args || []).forEach(count)
    }
    count(tree)
    function visit(item) {
      return {
        ...item,
        ...(item.args
          ? {
              args: item.args.map((child, index) => {
                const anchored =
                  item.op.startsWith('function:') || (item.op === 'power' && index === 0)
                if (anchored && variables(child).size && counts.get(signature(child)) >= 2)
                  return { op: 'variable', value: 'argument:' + signature(child) }
                return visit(child)
              }),
            }
          : {}),
      }
    }
    return visit(tree)
  }
  return (
    first.eligible &&
    second.eligible &&
    instantiate(abstractArguments(first.tree), abstractArguments(second.tree), false)
  )
}
module.exports = { sameTemplate }
