import { z } from "zod";

export const userSchema = z.object({
   id_user: z.number().int().positive().optional(),

   nik: z
      .string()
      .min(4, "NIK minimal 8 karakter")
      .max(20, "NIK maksimal 20 karakter"),

   nama: z
      .string()
      .min(3, "Nama minimal 3 karakter")
      .max(100, "Nama maksimal 100 karakter"),

   jabatan: z
      .string()
      .min(3, "Jabatan minimal 3 karakter")
      .max(100, "Jabatan maksimal 100 karakter"),

   username: z
      .string()
      .min(4, "Username minimal 4 karakter")
      .max(50, "Username maksimal 50 karakter")
      .regex(/^[a-zA-Z0-9_.]+$/, "Username hanya boleh huruf, angka, _ dan ."),

   password: z
      .string()
      .min(6, "Password minimal 6 karakter")
      .max(100, "Password maksimal 100 karakter"),

   role_id: z.coerce.number().refine((val) => val > 0, {
      message: "Role wajib dipilih",
   }),

   area_id: z.coerce.number().refine((val) => val > 0, {
      message: "Area wajib dipilih",
   }),

   sa_id: z.coerce.number().refine((val) => val > 0, {
      message: "SA wajib dipilih",
   }),
   created_at: z.date().optional(),
   updated_at: z.date().optional(),
});

export const createUserSchema = userSchema;

export const updateUserSchema = userSchema.extend({
   nik: z.string().optional(),
   nama: z.string().optional(),
   jabatan: z.string().optional(),
   username: z.string().optional(),
   password: z.string().min(6).optional(),
   role_id: z.number().optional(),
   area_id: z.number().optional(),
   sa_id: z.number().optional(),
   // created_at: z.date().optional(),
   // updated_at: z.date().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
