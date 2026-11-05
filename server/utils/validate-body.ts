/** Legacy demo endpoints keep their original HTTP error envelope. */
export function invalidInput(message: string): never {
  throw createError({ statusCode: 400, statusMessage: 'Invalid request', message })
}
