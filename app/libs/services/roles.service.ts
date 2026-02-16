import db from "@/app/libs/db";

export async function getAllRoles() {
   const [rows]: any = await db.query(
      "SELECT id_role, name, `key`, created_at, updated_at FROM roles ORDER BY id_role ASC",
   );
   return rows;
}

export async function getRolesById(id: string) {
   if (!id) {
      throw new Error("ID roles wajib diisi");
   }

   const [rows]: any = await db.query(
      `
      SELECT 
         id_role AS id,
         name,
         \`key\` AS role_key,
         created_at,
         updated_at
      FROM roles
      WHERE id_role = ?
      `,
      [id],
   );

   return rows.length > 0 ? rows[0] : null;
}
