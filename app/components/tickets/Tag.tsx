export default function Tag({ children }: { children: React.ReactNode }) {
   return (
      <span
         className="
            px-3 py-1
            text-[10px] sm:text-xs md:text-sm
            bg-slate-100 dark:bg-slate-800
            text-slate-600 dark:text-slate-300
            rounded-md
            whitespace-nowrap
            ">
         {children}
      </span>
   );
}
