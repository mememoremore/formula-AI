import test from 'node:test'
import assert from 'node:assert/strict'
import {
  safeReturnPath,
  legacyDestination,
  navigationSection,
  libraryView,
} from '../shared/navigation'
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
