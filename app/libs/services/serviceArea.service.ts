import db from "@/app/libs/db";

// 🔹 Get All
export async function getAllServiceArea() {
   const [rows]: any = await db.query(`
      SELECT 
         sa.id_sa AS id,
         sa.nama_sa AS serviceArea,
         a.nama_area AS area
      FROM service_area sa
      JOIN area a ON sa.area_id = a.id_area
      ORDER BY sa.id_sa ASC
   `);

   return rows;
}

// 🔹 Get SA by id
export async function getServiceAreaById(id: string) {
   if (!id) {
      throw new Error("ID wajib diisi");
   }

   const [rows]: any = await db.query(
      `
      SELECT 
         id_sa AS id,
         nama_sa,
         area_id,
         created_at,
         updated_at
      FROM service_area
      WHERE id_sa = ?
      `,
      [id],
   );

   return rows.length > 0 ? rows[0] : null;
}

// 🔹 Get SA By Area ID
export async function getServiceAreaByArea(area_id: string) {
   const [rows]: any = await db.query(
      `
      SELECT 
         id_sa AS value, 
         nama_sa AS label
      FROM service_area
      WHERE area_id = ?
      ORDER BY id_sa ASC
      `,
      [area_id],
   );

   return rows;
}

// 🔹 Create Service Area
export async function createServiceArea(data: {
   nama_sa: string;
   area_id: number;
}) {
   // 🔥 Cek apakah area ada
   const [area]: any = await db.query(
      `SELECT id_area FROM area WHERE id_area = ?`,
      [data.area_id],
   );

   if (area.length === 0) {
      throw new Error("Area tidak ditemukan");
   }

   // 🔥 Cek duplikasi nama dalam area yang sama
   const [duplicate]: any = await db.query(
      `
      SELECT id_sa 
      FROM service_area 
      WHERE nama_sa = ? AND area_id = ?
      `,
      [data.nama_sa, data.area_id],
   );

   if (duplicate.length > 0) {
      throw new Error("Service Area sudah ada di area tersebut");
   }

   // 🔥 Insert
   const [result]: any = await db.query(
      `
      INSERT INTO service_area (nama_sa, area_id, created_at, updated_at)
      VALUES (?, ?, NOW(), NOW())
      `,
      [data.nama_sa, data.area_id],
   );

   return result.insertId;
}

// 🔹 Update
export async function updateServiceArea(
   id: string,
   data: { nama_sa?: string; area_id?: string },
) {
   const fields: string[] = [];
   const values: any[] = [];

   if (data.nama_sa !== undefined) {
      fields.push("nama_sa = ?");
      values.push(data.nama_sa);
   }

   if (data.area_id !== undefined) {
      fields.push("area_id = ?");
      values.push(data.area_id);
   }

   if (fields.length === 0) {
      throw new Error("No data to update");
   }

   values.push(id);

   await db.query(
      `
      UPDATE service_area
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id_sa = ?
      `,
      values,
   );
}

// 🔹 Delete (dengan pengecekan)
export async function deleteServiceArea(id: string) {
   const existing = await getServiceAreaById(id);

   if (!existing) {
      throw new Error("Data tidak ditemukan");
   }

   await db.query(
      `
      DELETE FROM service_area
      WHERE id_sa = ?
      `,
      [id],
   );
}
