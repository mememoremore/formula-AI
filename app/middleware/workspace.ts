export default defineNuxtRouteMiddleware(async (to, from) => {
  if (to.query.space === 'account' || (to.path === '/ai/new' && to.query.space !== 'demo')) {
    const auth = await import('./auth')
    return auth.default(to, from)
  }
})
