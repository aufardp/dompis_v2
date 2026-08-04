import { z } from "zod";

export const createBranchSchema = z.object({
   nama_branch: z
      .string()
      .min(2, "Nama branch minimal 2 karakter")
      .max(100, "Nama branch maksimal 100 karakter"),
   kode_branch: z
      .string()
      .min(1, "Kode branch wajib diisi")
      .max(10, "Kode branch maksimal 10 karakter"),
   region_id: z.coerce.number({
      message: "Region wajib dipilih",
   }),
});

export const updateBranchSchema = z.object({
   id_branch: z.coerce.number({
      message: "ID branch wajib diisi",
   }),
   nama_branch: z
      .string()
      .min(2, "Nama branch minimal 2 karakter")
      .max(100, "Nama branch maksimal 100 karakter")
      .optional(),
   kode_branch: z
      .string()
      .min(1, "Kode branch wajib diisi")
      .max(10, "Kode branch maksimal 10 karakter")
      .optional(),
   region_id: z.coerce.number({
      message: "Region wajib dipilih",
   }).optional(),
});

export const deleteBranchSchema = z.object({
   id_branch: z.coerce.number({
      message: "ID branch wajib diisi",
   }),
});
