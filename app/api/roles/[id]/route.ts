import { NextResponse } from "next/server";
import { getRolesById } from "@/app/libs/services/roles.service";
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage } from '@/app/libs/apiError';

export async function GET(
   req: Request,
   { params }: { params: Promise<{ id: string }> },
) {
   try {
      await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin']);

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
         { success: false, message: getErrorMessage(error, 'Server Error') },
         { status: 500 },
      );
   }
}
