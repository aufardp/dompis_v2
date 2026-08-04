import { z } from "zod";

export const createRegionSchema = z.object({
   nama_region: z
      .string()
      .min(2, "Nama region minimal 2 karakter")
      .max(100, "Nama region maksimal 100 karakter"),
   is_active: z.boolean().optional(),
});

export const updateRegionSchema = z.object({
   id_region: z.coerce.number({
      message: "ID region wajib diisi",
   }),
   nama_region: z
      .string()
      .min(2, "Nama region minimal 2 karakter")
      .max(100, "Nama region maksimal 100 karakter")
      .optional(),
   is_active: z.boolean().optional(),
});

export const deleteRegionSchema = z.object({
   id_region: z.coerce.number({
      message: "ID region wajib diisi",
   }),
});
