import { getAccountSession } from '../../utils/auth'
import { accountAvatarUrl } from '../../services/profile-input'

export default defineEventHandler(async (event) => {
  const session = await getAccountSession(event)
  const user = session?.user
  return {
    user: user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: accountAvatarUrl(user.image, user.id),
        }
      : null,
  }
})
