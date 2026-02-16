"use client";

import { useForm, Controller } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import Select from "react-select";

export default function AreaServiceForm() {
   const { control, watch } = useForm();
   const selectedArea = watch("area");

   const { data: roles = [], isLoading: loadingRole } = useQuery({
      queryKey: ["roles"],
      queryFn: async () => {
         const res = await fetch("/api/roles");
         const json = await res.json();
         return json.data || [];
      },
      staleTime: 1000 * 60 * 5,
   });

   const { data: areas = [], isLoading: loadingArea } = useQuery({
      queryKey: ["areas"],
      queryFn: async () => {
         const res = await fetch("/api/area");
         const json = await res.json();
         return json.data || [];
      },
      staleTime: 1000 * 60 * 5,
   });

   const { data: serviceAreas = [], isLoading: loadingSA } = useQuery({
      queryKey: ["serviceAreas", selectedArea?.value],
      queryFn: async () => {
         if (!selectedArea) return [];
         const res = await fetch(`/api/sa?id_area=${selectedArea.value}`);
         const json = await res.json();
         return json.data || [];
      },
      staleTime: 1000 * 60 * 5,
      enabled: !!selectedArea,
   });

   return (
      <div className="space-y-6 max-w-md">
         {/* ROLES */}
         <div>
            <label className="block mb-2 font-medium">Role</label>
            <Controller
               name="role"
               control={control}
               render={({ field }) => (
                  <Select
                     {...field}
                     options={roles}
                     isLoading={loadingRole}
                     placeholder="Pilih Role..."
                  />
               )}
            />
         </div>

         {/* AREA */}
         <div>
            <label className="block mb-2 font-medium">Area</label>
            <Controller
               name="area"
               control={control}
               render={({ field }) => (
                  <Select
                     {...field}
                     options={areas}
                     isLoading={loadingArea}
                     placeholder="Pilih Area..."
                  />
               )}
            />
         </div>

         {/* SERVICE AREA */}
         <div>
            <label className="block mb-2 font-medium">Service Area</label>
            <Controller
               name="serviceArea"
               control={control}
               render={({ field }) => (
                  <Select
                     {...field}
                     options={serviceAreas}
                     isLoading={loadingSA}
                     placeholder={
                        selectedArea
                           ? "Pilih Service Area..."
                           : "Pilih Area dulu"
                     }
                     isDisabled={!selectedArea}
                  />
               )}
            />
         </div>
      </div>
   );
}
