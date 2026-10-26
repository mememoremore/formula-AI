export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  const privatePages = [
    '/',
    '/ai',
    '/upload',
    '/formulas',
    '/recognitions',
    '/exports',
    '/result',
    '/account',
    '/login',
    '/profile',
    '/settings',
    '/library',
    '/favorites',
    '/history',
  ]
  if (
    path.startsWith('/api/account/') ||
    path.startsWith('/api/auth/') ||
    privatePages.some((page) => path === page || path.startsWith(`${page}/`))
  ) {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    setResponseHeader(event, 'Vary', 'Cookie')
  }
})
