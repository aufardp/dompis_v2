import { z } from "zod";

export const createAreaSchema = z.object({
   nama_area: z
      .string()
      .min(2, "Nama minimal 2 karakter")
      .max(100, "Nama maksimal 100 karakter"),
});

export const updateAreaSchema = z.object({
   id_area: z.number({
      message: "ID area wajib diisi",
   }),
   nama_area: z
      .string()
      .min(2, "Nama minimal 2 karakter")
      .max(100, "Nama maksimal 100 karakter"),
});
