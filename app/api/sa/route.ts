import { NextResponse } from "next/server";
import {
   createServiceArea,
   getAllServiceArea,
   getServiceAreaById,
   getServiceAreaByArea,
   updateServiceArea,
   deleteServiceArea,
} from "@/app/libs/services/serviceArea.service";
import { createServiceAreaSchema } from "@/app/libs/validations/serviceArea.schema";

export async function GET(req: Request) {
   try {
      const { searchParams } = new URL(req.url);
      const id = searchParams.get("id");
      const id_area = searchParams.get("id_area");

      if (id) {
         const data = await getServiceAreaById(id);
         if (!data) {
            return NextResponse.json(
               { success: false, message: "Service Area not found" },
               { status: 404 },
            );
         }
         return NextResponse.json({ success: true, data });
      }

      if (id_area) {
         const data = await getServiceAreaByArea(id_area);
         return NextResponse.json({ success: true, data });
      }

      const data = await getAllServiceArea();
      return NextResponse.json({ success: true, data });
   } catch (error: any) {
      console.error("SA ERROR:", error);
      return NextResponse.json(
         { success: false, message: error.message },
         { status: 500 },
      );
   }
}

export async function POST(req: Request) {
   try {
      const body = await req.json();
      const validated = createServiceAreaSchema.parse({
         ...body,
         area_id: Number(body.area_id),
      });

      const insertId = await createServiceArea(validated);

      return NextResponse.json({
         success: true,
         message: "Service Area berhasil dibuat",
         data: { id_sa: insertId, nama_sa: validated.nama_sa },
      });
   } catch (error: any) {
      console.error("POST ERROR:", error);
      const status = error.name === "ZodError" ? 400 : 500;
      return NextResponse.json(
         { success: false, message: error.message },
         { status },
      );
   }
}

export async function PUT(req: Request) {
   try {
      const body = await req.json();
      const { id_sa, nama_sa, area_id } = body;

      if (!id_sa) {
         return NextResponse.json(
            { success: false, message: "id_sa is required" },
            { status: 400 },
         );
      }

      await updateServiceArea(String(id_sa), {
         nama_sa,
         area_id: area_id ? String(area_id) : undefined,
      });

      return NextResponse.json({
         success: true,
         message: "Service Area updated successfully",
      });
   } catch (error: any) {
      console.error("PUT ERROR:", error);
      return NextResponse.json(
         { success: false, message: error.message },
         { status: 500 },
      );
   }
}

export async function DELETE(req: Request) {
   try {
      const { searchParams } = new URL(req.url);
      const id = searchParams.get("id");

      if (!id) {
         return NextResponse.json(
            { success: false, message: "id is required" },
            { status: 400 },
         );
      }

      await deleteServiceArea(id);

      return NextResponse.json({
         success: true,
         message: "Service Area deleted successfully",
      });
   } catch (error: any) {
      console.error("DELETE ERROR:", error);
      return NextResponse.json(
         { success: false, message: error.message },
         { status: 500 },
      );
   }
}
