import { getAccountSession } from '../../utils/auth'
import { accountAvatarUrl } from '../../services/profile-input'
import { getDatabase } from '../../utils/database'

export default defineEventHandler(async (event) => {
  const session = await getAccountSession(event)
  const user = session?.user
  const profile = user
    ? await getDatabase().user.findUnique({
        where: { id: user.id },
        select: { grade: true, learningPurpose: true },
      })
    : null
  return {
    user: user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: accountAvatarUrl(user.image, user.id),
          grade: profile?.grade ?? null,
          learningPurpose: profile?.learningPurpose ?? null,
        }
      : null,
  }
})
