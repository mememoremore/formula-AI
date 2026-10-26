import test from 'node:test'
import assert from 'node:assert/strict'
import {
  safeReturnPath,
  legacyDestination,
  navigationSection,
  libraryView,
  mainTabDestination,
  recordPageOrigin,
  pageReturnDestination,
} from '../shared/navigation'
import { contentWidth } from '../app/utils/layout'
import { createScrollMemory } from '../app/utils/scroll-memory'
test('回跳保留上下文，拒绝外站与认证自循环', () => {
  assert.equal(safeReturnPath('/library?view=favorites&q=x'), '/library?view=favorites&q=x')
  assert.equal(safeReturnPath('/ai/new?versionId=abc'), '/ai/new?versionId=abc')
  for (const value of [
    '//evil.test',
    '/login?redirect=/login',
    'https://evil.test',
    '/%2f%2fevil.test',
    '/unknown',
  ])
    assert.equal(safeReturnPath(value), '/profile')
  assert.equal(safeReturnPath('/' + String.fromCharCode(92) + 'evil.test'), '/profile')
  assert.equal(safeReturnPath('/ai/new' + String.fromCharCode(10)), '/profile')
})
test('旧地址一次映射并保留账号语境', () => {
  assert.deepEqual(legacyDestination('/account/favorites'), {
    path: '/library',
    query: { view: 'favorites', space: 'account' },
  })
  assert.equal(legacyDestination('/account/tasks/abc')?.path, '/recognitions/abc')
  assert.equal(legacyDestination('/account/conversations/abc')?.path, '/ai/abc')
  assert.equal(legacyDestination('/library'), undefined)
})
test('公式相关页面归库，非法筛选回到全部', () => {
  assert.equal(navigationSection('/formulas/abc'), '/library')
  assert.equal(navigationSection('/ai/new'), '/ai')
  assert.equal(libraryView('recent'), 'recent')
  assert.equal(libraryView(['favorites']), 'all')
})

test('同入口保留筛选和锚点，跨入口只传递明确的空间', () => {
  const route = {
    path: '/library',
    fullPath: '/library?view=favorites&q=x&space=demo#items',
    query: { space: 'demo', q: 'x' },
  }
  assert.equal(mainTabDestination('/library', route), route.fullPath)
  assert.equal(mainTabDestination('/ai', route), '/ai?space=demo')
  assert.equal(
    mainTabDestination('/profile', { ...route, query: { space: 'account' } }),
    '/profile?space=account',
  )
  assert.equal(mainTabDestination('/', { ...route, query: { space: ['demo'] } }), '/')
})

test('同页参数变化继承父页面，保留列表完整筛选且返回不造成双向循环', () => {
  const origins: Record<string, string> = {}
  const list = { path: '/library', fullPath: '/library?space=demo&q=x' }
  const detail = { path: '/result/abc', fullPath: '/result/abc' }
  const version = { ...detail, fullPath: '/result/abc?version=2' }
  recordPageOrigin(origins, detail, list)
  recordPageOrigin(origins, version, detail)
  assert.equal(origins[version.fullPath], list.fullPath)
  recordPageOrigin(origins, list, version)
  assert.equal(origins[list.fullPath], undefined)
})

test('登录和任务中转继承来源；来源有界且拒绝外站', () => {
  const origins: Record<string, string> = { '/login': '/library?view=recent' }
  recordPageOrigin(
    origins,
    { path: '/formulas/a', fullPath: '/formulas/a' },
    { path: '/login', fullPath: '/login' },
  )
  assert.equal(origins['/formulas/a'], '/library?view=recent')
  recordPageOrigin(
    origins,
    { path: '/help', fullPath: '/help' },
    { path: 'https://evil.test', fullPath: 'https://evil.test' },
  )
  assert.equal(origins['/help'], undefined)
  for (let i = 0; i < 110; i++)
    recordPageOrigin(
      origins,
      { path: '/result/' + i, fullPath: '/result/' + i },
      { path: '/library', fullPath: '/library' },
    )
  assert.equal(Object.keys(origins).length, 100)
})

test('布局默认为兼容宽度，只有显式的阅读和工作区模式可启用', () => {
  assert.equal(contentWidth(undefined), 'compact')
  assert.equal(contentWidth('unknown'), 'compact')
  assert.equal(contentWidth('reading'), 'reading')
  assert.equal(contentWidth('workspace'), 'workspace')
})

test('刷新后可信历史保留筛选；外站、中转页和同页不能作为返回目标', () => {
  assert.equal(
    pageReturnDestination('/result/a', undefined, '/library?space=demo&view=favorites', '/library'),
    '/library?space=demo&view=favorites',
  )
  assert.equal(
    pageReturnDestination('/result/a', '/library?q=x', '/profile', '/library'),
    '/library?q=x',
  )
  for (const previous of [
    'https://evil.test',
    '/login?redirect=/result/a',
    '/ai/new?space=demo',
    '/recognitions/abc',
    '/result/a?version=2',
  ])
    assert.equal(pageReturnDestination('/result/a', undefined, previous, '/library'), '/library')
})

test('滚动快照有界、按完整地址隔离、再次访问刷新保留次序', () => {
  const memory = createScrollMemory(2)
  const position = { left: 0, top: 320 }
  memory.remember('/library?q=x', position)
  position.top = 999
  assert.equal(memory.get('/library?q=x')?.top, 320)
  memory.remember('/help', { left: 0, top: 80 })
  memory.remember('/library?q=x', { left: 0, top: 400 })
  memory.remember('/profile', { left: 0, top: 0 })
  assert.equal(memory.get('/help'), undefined)
  assert.equal(memory.get('/library?q=y'), undefined)
  assert.deepEqual(memory.get('/library?q=x'), { left: 0, top: 400 })
})
