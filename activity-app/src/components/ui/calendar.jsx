import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Calendar({
  selected,
  onSelect,
  mode: _mode = "single",
  className,
}) {
  const initialDate = selected ? new Date(selected + "T00:00:00") : new Date()
  const [currentMonth, setCurrentMonth] = useState(
    isNaN(initialDate.getTime()) ? new Date() : initialDate
  )

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  
  // Day of week for 1st day (Monday-first: 0 = Mon, 6 = Sun)
  const startDay = (firstDayOfMonth.getDay() + 6) % 7
  const totalDays = lastDayOfMonth.getDate()

  const prevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1))
  }

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ]

  const weekDays = ["L", "M", "M", "J", "V", "S", "D"]

  const days = []
  for (let i = 0; i < startDay; i++) {
    days.push(null)
  }
  for (let d = 1; d <= totalDays; d++) {
    days.push(d)
  }

  const formatIso = (day) => {
    const mm = String(month + 1).padStart(2, "0")
    const dd = String(day).padStart(2, "0")
    return `${year}-${mm}-${dd}`
  }

  const handleToday = () => {
    const today = new Date()
    const iso = today.toISOString().split("T")[0]
    setCurrentMonth(today)
    onSelect?.(iso)
  }

  const handleClear = () => {
    onSelect?.("")
  }

  return (
    <div className={cn("w-64 select-none p-3 text-popover-foreground", className)}>
      {/* Month / Year header with Canonical Shadcn Chevrons */}
      <div className="flex items-center justify-between pb-2 pt-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          onClick={prevMonth}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <span className="text-xs font-semibold text-foreground tracking-tight">
          {monthNames[month]} {year}
        </span>

        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          onClick={nextMonth}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Weekday headers */}
      <div className="my-1.5 grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
        {weekDays.map((wd, i) => (
          <div key={`${wd}-${i}`} className="flex h-8 items-center justify-center">
            {wd}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {days.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="size-8" />
          }
          const iso = formatIso(day)
          const isSelected = selected === iso
          const isToday =
            new Date().toISOString().split("T")[0] === iso

          return (
            <Button
              key={iso}
              type="button"
              size="icon-sm"
              variant={isSelected ? "default" : isToday ? "secondary" : "ghost"}
              onClick={() => onSelect?.(iso)}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${day} de ${monthNames[month]} de ${year}`}
              className="rounded-xl text-xs font-medium"
            >
              {day}
            </Button>
          )
        })}
      </div>

      {/* Footer: Borrar / Hoy */}
      <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-border/40 text-xs">
        <Button type="button" variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground">
          Borrar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleToday} className="text-primary">
          Hoy
        </Button>
      </div>
    </div>
  )
}
