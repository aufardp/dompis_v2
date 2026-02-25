export default function Header() {
   return (
      <header className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 p-4 flex justify-between items-center">
         <h2 className="font-bold text-lg md:text-xl text-primary">Dompis</h2>
         <div className="flex items-center gap-2 md:gap-3">
            <span className="font-bold text-sm md:text-base hidden sm:inline">
               Teknisi SerbaBisa
            </span>
            <span className="font-bold text-sm sm:hidden">Teknisi</span>
            <img
               src="/avatar.png"
               className="w-8 h-8 md:w-10 md:h-10 rounded-full"
               alt="profile"
            />
         </div>
      </header>
   );
}
