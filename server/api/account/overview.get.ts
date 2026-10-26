import { requireAccountUser } from '../../utils/auth'
import { getDatabase } from '../../utils/database'
import { readAccountOverview } from '../../database/private-resources'

export default defineEventHandler(async (event) => {
  const user = await requireAccountUser(event)
  return readAccountOverview(getDatabase(), user.id)
})
