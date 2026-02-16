import { NextResponse } from "next/server";
import { getRolesById } from "@/app/libs/services/roles.service";

export async function GET(
   req: Request,
   { params }: { params: Promise<{ id: string }> },
) {
   try {
      const { id } = await params;

      const data = await getRolesById(id);

      if (!data) {
         return NextResponse.json(
            { success: false, message: "Roles not found" },
            { status: 404 },
         );
      }

      return NextResponse.json({
         success: true,
         data,
      });
   } catch (error: any) {
      return NextResponse.json(
         { success: false, message: error.message },
         { status: 500 },
      );
   }
}
