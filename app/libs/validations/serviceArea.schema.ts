import { z } from "zod";

export const createServiceAreaSchema = z.object({
   nama_sa: z
      .string()
      .min(2, "Nama minimal 2 karakter")
      .max(50, "Nama maksimal 50 karakter"),

   area_id: z.number({
      message: "Area wajib diisi",
   }),
});
