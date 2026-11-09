import { z } from 'zod'

export const conversationNameInputSchema = z.object({
  title: z
    .string()
    .transform((value) => value.trim().normalize('NFC'))
    .refine(
      (value) =>
        !!value &&
        value.length <= 40 &&
        [...value].every((char) => char.codePointAt(0)! >= 32 && char.codePointAt(0)! !== 127),
      { error: '对话名称需要包含1～40个字符，不能包含换行或控制字符。' },
    ),
})
