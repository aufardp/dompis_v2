import { NextResponse } from "next/server";
import db from "@/app/libs/db";

export async function GET() {
   try {
      const [rows] = await db.query("SELECT 1 + 1 AS result");

      return NextResponse.json({
         success: true,
         data: rows,
      });
   } catch (error) {
      console.error(error);
      return NextResponse.json(
         { success: false, error: "Database connection failed" },
         { status: 500 },
      );
   }
}
