import { cn } from '@/lib/utils';

export function TimePicker({
  startTime = '10:00',
  endTime = '11:00',
  onStartTimeChange,
  onEndTimeChange,
  className,
}) {
  return (
    <div className={cn('p-3 bg-popover text-popover-foreground border border-border rounded-xl shadow-lg flex items-center gap-2.5 select-none', className)}>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Inicio
        </label>
        <input
          type="time"
          value={startTime}
          onChange={(e) => onStartTimeChange?.(e.target.value)}
          className="h-8.5 px-2.5 rounded-lg border border-border bg-background text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all text-center cursor-pointer"
        />
      </div>

      <span className="text-muted-foreground text-xs font-semibold mt-4">–</span>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Término
        </label>
        <input
          type="time"
          value={endTime}
          onChange={(e) => onEndTimeChange?.(e.target.value)}
          className="h-8.5 px-2.5 rounded-lg border border-border bg-background text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all text-center cursor-pointer"
        />
      </div>
    </div>
  );
}
