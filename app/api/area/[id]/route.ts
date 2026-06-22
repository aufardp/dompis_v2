import { NextResponse } from "next/server";
import { getAreaById } from "@/app/libs/services/area.service";
import { getErrorMessage } from '@/app/libs/apiError';

export async function GET(
   req: Request,
   { params }: { params: Promise<{ id: string }> },
) {
   try {
      const { id } = await params;

      const data = await getAreaById(id);

      if (!data) {
         return NextResponse.json(
            { success: false, message: "Area not found" },
            { status: 404 },
         );
      }

      return NextResponse.json({
         success: true,
         data,
      });
   } catch (error: any) {
      return NextResponse.json(
         { success: false, message: getErrorMessage(error, 'Server Error') },
         { status: 500 },
      );
   }
}
