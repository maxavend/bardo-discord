/**
 * Pure helpers for TimePicker (testable from Node).
 */

/** Parses 'HH:mm' into 12-hour parts: { hour12, minute, period }. */
export function parseTime24(timeStr = "10:00") {
  const [hStr, mStr] = String(timeStr || "10:00").split(":")
  let hours = parseInt(hStr, 10)
  const minutes = parseInt(mStr, 10)

  if (isNaN(hours) || hours < 0 || hours > 23) hours = 10
  const validMinutes = isNaN(minutes) || minutes < 0 || minutes > 59 ? 0 : minutes

  const period = hours >= 12 ? "PM" : "AM"
  const hour12 = hours % 12 === 0 ? 12 : hours % 12

  return { hour12, minute: validMinutes, period }
}

/** Formats 12-hour parts back into 'HH:mm' (24-hour). */
export function formatTime24(hour12, minute, period) {
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
 * Value to commit when the picker closes or is confirmed, or null when
 * nothing should be written. Only an actual user change (`dirty`) commits:
 * opening and closing the picker must never write back the value loaded at
 * open time over a newer one saved by a colleague meanwhile.
 */
export function resolveTimeCommit({ dirty, hour, minute, period, value }) {
  if (!dirty) return null
  let validHour = parseInt(hour, 10)
  if (isNaN(validHour) || validHour < 1) validHour = 12
  if (validHour > 12) validHour = 12

  let validMin = parseInt(minute, 10)
  if (isNaN(validMin) || validMin < 0) validMin = 0
  if (validMin > 59) validMin = 59

  const time24 = formatTime24(validHour, validMin, period)
  return time24 !== value ? time24 : null
}
