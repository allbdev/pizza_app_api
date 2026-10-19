import z from 'zod'

export const createUserSchema = z.object({
    body: z.object({
        name: z.string().min(3, { message: 'Name must have at least 3 characters' }),
        email: z.email({ message: 'Email is invalid' }),
        password: z.string().min(6, { message: 'Password must have at least 6 characters' })
    })
})

export type CreateUserSchema = z.infer<typeof createUserSchema>