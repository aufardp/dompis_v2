import { NextResponse } from "next/server";
import { getServiceAreaById } from "@/app/libs/services/serviceArea.service";
import { logger } from '@/lib/observability/logger';
import { protectApi } from '@/app/libs/protectApi';

export async function GET(
   req: Request,
   { params }: { params: Promise<{ id: string }> },
) {
   try {
      await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin', 'teknisi']);

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
      logger.error("GET BY ID ERROR:", error);
      return NextResponse.json(
         { success: false, message: "Internal Server Error" },
         { status: 500 },
      );
   }
}
