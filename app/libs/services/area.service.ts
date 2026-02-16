import db from "@/app/libs/db";

export async function getAllArea() {
   const [rows]: any = await db.query(
      "SELECT * FROM area ORDER BY id_area ASC",
   );
   return rows;
}

export async function getAreaById(id: string) {
   if (!id) {
      throw new Error("ID area wajib diisi");
   }

   const [rows]: any = await db.query(
      `
      SELECT 
         id_area AS id,
         nama_area,
         created_at,
         updated_at
      FROM area
      WHERE id_area = ?
      `,
      [id],
   );

   return rows.length > 0 ? rows[0] : null;
}

export async function createArea(data: { nama_area: string }) {
   const [duplicate]: any = await db.query(
      "SELECT id_area FROM area WHERE nama_area = ?",
      [data.nama_area],
   );

   if (duplicate.length > 0) {
      throw new Error("Area sudah ada");
   }

   const [result]: any = await db.query(
      "INSERT INTO area (nama_area) VALUES (?)",
      [data.nama_area],
   );

   return result.insertId;
}

export async function updateArea(id: string, data: { nama_area?: string }) {
   const existing = await getAreaById(id);

   if (!existing) {
      throw new Error("Area tidak ditemukan");
   }

   if (data.nama_area) {
      const [duplicate]: any = await db.query(
         "SELECT id_area FROM area WHERE nama_area = ? AND id_area != ?",
         [data.nama_area, id],
      );

      if (duplicate.length > 0) {
         throw new Error("Nama area sudah ada");
      }
   }

   const fields: string[] = [];
   const values: any[] = [];

   if (data.nama_area !== undefined) {
      fields.push("nama_area = ?");
      values.push(data.nama_area);
   }

   if (fields.length === 0) {
      throw new Error("No data to update");
   }

   values.push(id);

   await db.query(
      `UPDATE area SET ${fields.join(", ")} WHERE id_area = ?`,
      values,
   );
}

export async function deleteArea(id: string) {
   const existing = await getAreaById(id);

   if (!existing) {
      throw new Error("Area tidak ditemukan");
   }

   await db.query("DELETE FROM area WHERE id_area = ?", [id]);
}
