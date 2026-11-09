import { z } from 'zod'

export const explanationDomainSchema = z
  .string({ error: '请输入1～60字的公式所属领域。' })
  .transform((value) => value.trim().normalize('NFC'))
  .refine(
    (value) =>
      !!value &&
      value.length <= 60 &&
      [...value].every((char) => char.codePointAt(0)! >= 32 && char.codePointAt(0)! !== 127),
    { error: '请输入1～60字的公式所属领域。' },
  )
