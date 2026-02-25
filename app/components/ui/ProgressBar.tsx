interface Props {
   progress: number;
   color?: string;
}

export default function ProgressBar({
   progress,
   color = "bg-blue-500",
}: Props) {
   return (
      <div className="w-24">
         <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
               className={`h-full ${color}`}
               style={{ width: `${progress}%` }}
            />
         </div>
      </div>
   );
}
