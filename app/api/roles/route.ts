import { NextResponse } from "next/server";
import db from "@/app/libs/db";

export async function GET() {
   try {
      const [rows]: any = await db.query("SELECT * FROM roles");

      // Transform data for react-select
      const options = rows.map((role: any) => ({
         id: role.id_role,
         label: role.name,
         key: role.key,
         created_at: role.created_at,
         updated_at: role.updated_at,
      }));

      return NextResponse.json({
         success: true,
         data: options,
      });
   } catch (error: any) {
      console.error("Roles fetch error:", error);
      return NextResponse.json(
         { success: false, message: error.message },
         { status: 500 },
      );
   }
}
