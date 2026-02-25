import { ReactNode } from "react";

export default function Card({ children }: { children: ReactNode }) {
   return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
         {children}
      </div>
   );
}
