import * as React from "react"
import { Clock } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

/**
 * Parses 'HH:mm' string into 12-hour components: { hour12: number, minute: number, period: 'AM'|'PM' }
 */
function parseTime24(timeStr = "10:00") {
  const [hStr, mStr] = String(timeStr || "10:00").split(":")
  let hours = parseInt(hStr, 10)
  const minutes = parseInt(mStr, 10)

  if (isNaN(hours) || hours < 0 || hours > 23) hours = 10
  const validMinutes = isNaN(minutes) || minutes < 0 || minutes > 59 ? 0 : minutes

  const period = hours >= 12 ? "PM" : "AM"
  const hour12 = hours % 12 === 0 ? 12 : hours % 12

  return { hour12, minute: validMinutes, period }
}

/**
 * Formats 12-hour components back into 'HH:mm' (24-hour) string
 */
function formatTime24(hour12, minute, period) {
  let hours24 = parseInt(hour12, 10) || 12
  if (period === "PM" && hours24 < 12) {
    hours24 += 12
  } else if (period === "AM" && hours24 === 12) {
    hours24 = 0
  }
  const mm = String(minute).padStart(2, "0")
  const hh = String(hours24).padStart(2, "0")
  return `${hh}:${mm}`
}

/**
 * Format 24h string to 12h human display (e.g. "10:00 AM" or "10:00 a.m.")
 */
export function formatTimeDisplay(timeStr = "10:00", lowercasePeriod = true) {
  const { hour12, minute, period } = parseTime24(timeStr)
  const p = lowercasePeriod ? (period === "AM" ? "a.m." : "p.m.") : period
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${p}`
}

export function TimePicker({
  value = "10:00",
  onChange,
  disabled = false,
  className,
  id,
  placeholder = "Seleccionar hora",
  lowercasePeriod = true,
  renderTrigger,
}) {
  const [open, setOpen] = React.useState(false)
  const { hour12: initHour, minute: initMin, period: initPeriod } = parseTime24(value)

  const [hour, setHour] = React.useState(String(initHour).padStart(2, "0"))
  const [minute, setMinute] = React.useState(String(initMin).padStart(2, "0"))
  const [period, setPeriod] = React.useState(initPeriod)

  // Sync internal state when external value changes or popover opens
  React.useEffect(() => {
    if (open) {
      const parsed = parseTime24(value)
      setHour(String(parsed.hour12).padStart(2, "0"))
      setMinute(String(parsed.minute).padStart(2, "0"))
      setPeriod(parsed.period)
    }
  }, [open, value])

  const hourInputRef = React.useRef(null)
  const minuteInputRef = React.useRef(null)

  const handleHourChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2)
    setHour(raw)
    if (raw.length === 2) {
      const num = parseInt(raw, 10)
      if (num >= 1 && num <= 12) {
        minuteInputRef.current?.focus()
        minuteInputRef.current?.select()
      }
    }
  }

  const handleHourBlur = () => {
    let num = parseInt(hour, 10)
    if (isNaN(num) || num < 1) num = 12
    if (num > 12) num = 12
    setHour(String(num).padStart(2, "0"))
  }

  const handleMinuteChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2)
    setMinute(raw)
  }

  const handleMinuteBlur = () => {
    let num = parseInt(minute, 10)
    if (isNaN(num) || num < 0) num = 0
    if (num > 59) num = 59
    setMinute(String(num).padStart(2, "0"))
  }

  const handleKeyDown = (unit, e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (unit === "hour") {
        let num = (parseInt(hour, 10) || 12) + 1
        if (num > 12) num = 1
        setHour(String(num).padStart(2, "0"))
      } else {
        let num = (parseInt(minute, 10) || 0) + 1
        if (num > 59) num = 0
        setMinute(String(num).padStart(2, "0"))
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      if (unit === "hour") {
        let num = (parseInt(hour, 10) || 12) - 1
        if (num < 1) num = 12
        setHour(String(num).padStart(2, "0"))
      } else {
        let num = (parseInt(minute, 10) || 0) - 1
        if (num < 0) num = 59
        setMinute(String(num).padStart(2, "0"))
      }
    } else if (e.key === "ArrowRight" && unit === "hour") {
      minuteInputRef.current?.focus()
      minuteInputRef.current?.select()
    } else if (e.key === "ArrowLeft" && unit === "minute") {
      hourInputRef.current?.focus()
      hourInputRef.current?.select()
    }
  }

  const handleConfirm = () => {
    let validHour = parseInt(hour, 10)
    if (isNaN(validHour) || validHour < 1) validHour = 12
    if (validHour > 12) validHour = 12

    let validMin = parseInt(minute, 10)
    if (isNaN(validMin) || validMin < 0) validMin = 0
    if (validMin > 59) validMin = 59

    const time24 = formatTime24(validHour, validMin, period)
    onChange?.(time24)
    setOpen(false)
  }

  const handleCancel = () => {
    setOpen(false)
  }

  const handleNow = () => {
    const now = new Date()
    const currentHours = now.getHours()
    const currentMins = now.getMinutes()
    const currentPeriod = currentHours >= 12 ? "PM" : "AM"
    const current12 = currentHours % 12 === 0 ? 12 : currentHours % 12

    setHour(String(current12).padStart(2, "0"))
    setMinute(String(currentMins).padStart(2, "0"))
    setPeriod(currentPeriod)
  }

  const displayText = value ? formatTimeDisplay(value, lowercasePeriod) : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          renderTrigger ? (
            renderTrigger({ value, displayText, open, disabled })
          ) : (
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              className={cn(
                "w-full justify-between font-normal h-9 rounded-full bg-muted/40 hover:bg-muted/60 border-border/50 px-3.5 text-xs text-foreground transition-colors",
                !value && "text-muted-foreground",
                className
              )}
            >
              <span>{displayText}</span>
              <Clock data-icon="inline-end" className="size-4 text-foreground/80" />
            </Button>
          )
        }
      />
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[300px] p-3.5 rounded-2xl shadow-lg border border-border bg-popover text-popover-foreground flex flex-col gap-3 select-none overflow-hidden"
      >
        {/* Matched row: 2 labeled input columns + 1 labeled AM/PM column */}
        <div className="grid grid-cols-[1fr_auto_1fr_auto] items-start gap-1.5 w-full">
              {/* Columna Hora */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <Input
                  ref={hourInputRef}
                  type="text"
                  inputMode="numeric"
                  value={hour}
                  onChange={handleHourChange}
                  onBlur={handleHourBlur}
                  onKeyDown={(e) => handleKeyDown("hour", e)}
                  aria-label="Hora"
                  className="h-9 w-full rounded-xl border border-input/60 bg-muted/30 text-center text-sm font-semibold tracking-tight px-0 hover:bg-muted/50 focus:bg-background"
                />
                <span className="text-[11px] leading-4 text-muted-foreground">Hora</span>
              </div>

              {/* Separador de dos puntos: centrado matemáticamente con los inputs (h-9) */}
              <div className="flex h-9 items-center justify-center px-0.5 shrink-0">
                <span className="text-sm font-bold text-muted-foreground leading-none">:</span>
              </div>

              {/* Columna Minuto */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <Input
                  ref={minuteInputRef}
                  type="text"
                  inputMode="numeric"
                  value={minute}
                  onChange={handleMinuteChange}
                  onBlur={handleMinuteBlur}
                  onKeyDown={(e) => handleKeyDown("minute", e)}
                  aria-label="Minutos"
                  className="h-9 w-full rounded-xl border border-input/60 bg-muted/30 text-center text-sm font-semibold tracking-tight px-0 hover:bg-muted/50 focus:bg-background"
                />
                <span className="text-[11px] leading-4 text-muted-foreground">Minuto</span>
              </div>

              {/* Columna AM / PM: contenedor h-9 y ToggleGroup horizontal contenido */}
              <div className="flex flex-col items-center gap-1 pl-1 shrink-0">
                <div className="h-9 flex items-center">
                  <ToggleGroup
                    type="single"
                    spacing={0}
                    value={[period]}
                    onValueChange={(val) => {
                      const selected = Array.isArray(val) ? val[0] : val
                      if (selected) setPeriod(selected)
                    }}
                    className="h-9 rounded-xl border border-input/60 bg-muted/30 p-0.5 box-border"
                  >
                    <ToggleGroupItem
                      value="AM"
                      aria-label="AM"
                      className={cn(
                        "h-full px-2 text-xs rounded-lg transition-all border-0 shadow-none font-medium",
                        period === "AM"
                          ? "bg-background text-foreground shadow-2xs font-bold"
                          : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                      )}
                    >
                      AM
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="PM"
                      aria-label="PM"
                      className={cn(
                        "h-full px-2 text-xs rounded-lg transition-all border-0 shadow-none font-medium",
                        period === "PM"
                          ? "bg-background text-foreground shadow-2xs font-bold"
                          : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                      )}
                    >
                      PM
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                {/* Spacer idéntico a las etiquetas para alineación matemática total */}
                <span className="text-[11px] leading-4 invisible select-none">Periodo</span>
              </div>
            </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2.5 mt-0.5 border-t border-border/40 gap-2 w-full">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleNow}
            className="h-8 px-2 text-xs font-medium text-muted-foreground hover:text-foreground gap-1.5 shrink-0"
          >
            <Clock data-icon="inline-start" className="size-3.5" />
            <span>Ahora</span>
          </Button>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="h-8 px-3 text-xs font-medium"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleConfirm}
              className="h-8 px-3.5 text-xs font-semibold"
            >
              Aceptar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
