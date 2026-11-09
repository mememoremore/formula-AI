import { z } from 'zod'

const nicknameError = '昵称需要包含 1～100 个字符。'
const avatarError = '头像格式无效，请重新选择 JPG/JPEG、PNG 图片。'
export const profileInputSchema = z
  .object(
    {
      name: z
        .string({ error: nicknameError })
        .refine((value) => !!value.trim() && value.trim().length <= 100, { error: nicknameError }),
      grade: z.string().trim().max(80, '年级最多80个字符。').nullable().optional(),
      learningPurpose: z.string().trim().max(300, '学习目的最多300个字符。').nullable().optional(),
      avatar: z
        .string({ error: avatarError })
        .refine(
          (value) =>
            value.length <= 1_500_000 &&
            /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value),
          { error: avatarError },
        )
        .nullable()
        .optional(),
    },
    { error: '资料格式无效。' },
  )
  .transform((value) => ({
    name: value.name.trim(),
    ...(value.grade === undefined ? {} : { grade: value.grade || null }),
    ...(value.learningPurpose === undefined
      ? {}
      : { learningPurpose: value.learningPurpose || null }),
    ...(value.avatar === undefined ? {} : { avatar: value.avatar }),
  }))
export type ProfileUpdate = z.output<typeof profileInputSchema>
