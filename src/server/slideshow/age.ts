type CalendarDate = [number, number, number];

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isValidDate([year, month, day]: CalendarDate): boolean {
  return (
    Number.isInteger(year) &&
    year >= 1 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

function calendarTime([year, month, day]: CalendarDate): number {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
}

function addMonthsClamped([year, month, day]: CalendarDate, months: number): CalendarDate {
  const targetMonth = year * 12 + month - 1 + months;
  const targetYear = Math.floor(targetMonth / 12);
  const monthOfYear = (targetMonth % 12) + 1;
  return [targetYear, monthOfYear, Math.min(day, daysInMonth(targetYear, monthOfYear))];
}

function dateParts(value: string, timeZone: string): CalendarDate | null {
  const datePrefix = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  const inputDate: CalendarDate | null = datePrefix
    ? [Number(datePrefix[1]), Number(datePrefix[2]), Number(datePrefix[3])]
    : null;
  if (inputDate && !isValidDate(inputDate)) return null;

  const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(value);
  if (local && inputDate) {
    const hour = Number(local[4]);
    const minute = Number(local[5]);
    const second = Number(local[6] ?? 0);
    return hour <= 23 && minute <= 59 && second <= 59 ? inputDate : null;
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const result: CalendarDate = [read("year"), read("month"), read("day")];
  return isValidDate(result) ? result : null;
}

function unit(value: number, singular: string): string {
  return `${value} ${value === 1 ? singular : `${singular}s`}`;
}

export function formatBabyAge(birthDate: string, capturedAt: string, timeZone: string): string | null {
  const birthMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  const captured = dateParts(capturedAt, timeZone);
  if (!birthMatch || !captured) return null;
  const birth: CalendarDate = [Number(birthMatch[1]), Number(birthMatch[2]), Number(birthMatch[3])];
  if (!isValidDate(birth)) return null;

  const [cy, cm, cd] = captured;
  const capturedTime = calendarTime(captured);
  const birthTime = calendarTime(birth);
  if (capturedTime < birthTime) return null;

  let months = (cy - birth[0]) * 12 + (cm - birth[1]);
  let anniversary = addMonthsClamped(birth, months);
  if (calendarTime(anniversary) > capturedTime) {
    months -= 1;
    anniversary = addMonthsClamped(birth, months);
  }
  const days = Math.floor((capturedTime - calendarTime(anniversary)) / 86_400_000);

  if (months < 1) {
    return `${unit(days, "day")} old`;
  }

  if (months < 12) return `${unit(months, "month")}, ${unit(days, "day")} old`;

  const years = Math.floor(months / 12);
  return `${unit(years, "year")}, ${unit(months % 12, "month")}, ${unit(days, "day")} old`;
}
