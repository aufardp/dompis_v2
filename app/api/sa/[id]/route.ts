import { NextResponse } from "next/server";
import { getServiceAreaById } from "@/app/libs/services/serviceArea.service";

export async function GET(
   req: Request,
   { params }: { params: Promise<{ id: string }> },
) {
   try {
      const { id } = await params;

      if (!id) {
         return NextResponse.json(
            { success: false, message: "ID is required" },
            { status: 400 },
         );
      }

      const data = await getServiceAreaById(id);

      if (!data) {
         return NextResponse.json(
            { success: false, message: "Data not found" },
            { status: 404 },
         );
      }

      return NextResponse.json({
         success: true,
         data,
      });
   } catch (error: any) {
      console.error("GET BY ID ERROR:", error);
      return NextResponse.json(
         { success: false, message: "Internal Server Error" },
         { status: 500 },
      );
   }
}
