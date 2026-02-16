interface BadgeProps {
   label: string;
   color?: "red" | "amber" | "gray";
}

export default function Badge({ label, color = "gray" }: BadgeProps) {
   const colors = {
      red: "bg-red-100 text-red-600",
      amber: "bg-amber-100 text-amber-600",
      gray: "bg-slate-100 text-slate-500",
   };

   return (
      <span
         className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${colors[color]}`}>
         {label}
      </span>
   );
}
