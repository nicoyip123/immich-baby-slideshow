function dateParts(value: string, timeZone: string): [number, number, number] | null {
  const local = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (local && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return [Number(local[1]), Number(local[2]), Number(local[3])];
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return [read("year"), read("month"), read("day")];
}

export function formatBabyAge(birthDate: string, capturedAt: string, timeZone: string): string | null {
  const birthMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  const captured = dateParts(capturedAt, timeZone);
  if (!birthMatch || !captured) return null;
  const birth: [number, number, number] = [Number(birthMatch[1]), Number(birthMatch[2]), Number(birthMatch[3])];
  const [cy, cm, cd] = captured;
  if (Date.UTC(cy, cm - 1, cd) < Date.UTC(birth[0], birth[1] - 1, birth[2])) return null;
  let months = (cy - birth[0]) * 12 + (cm - birth[1]);
  const daysInMonth = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
  const anniversaryDay = Math.min(birth[2], daysInMonth);
  if (cd < anniversaryDay) months -= 1;
  if (months < 1) {
    const days = Math.floor((Date.UTC(cy, cm - 1, cd) - Date.UTC(birth[0], birth[1] - 1, birth[2])) / 86_400_000);
    return `${days} ${days === 1 ? "day" : "days"} old`;
  }
  if (months < 24) return `${months} ${months === 1 ? "month" : "months"} old`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} old`;
}

