export type BirthdayLeapDayRule = "FEB_28" | "MAR_01";

export interface BirthdayWindowInput {
  readonly birthdayMonth: number;
  readonly birthdayDay: number;
  readonly windowBeforeDays: number;
  readonly windowAfterDays: number;
  readonly leapDayObservation: BirthdayLeapDayRule;
  readonly eligibilityTimeZone: string;
  readonly now: Date;
}

export interface BirthdayWindowMatch {
  readonly benefitYear: number;
  readonly localDate: string;
  readonly observedBirthday: string;
  readonly windowStartsOn: string;
  readonly windowEndsOn: string;
}

interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const DAY_MS = 86_400_000;

export function isValidIanaTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function birthdayWindowAt(input: BirthdayWindowInput): BirthdayWindowMatch | null {
  validateBirthdayWindowInput(input);
  const localDate = localCalendarDate(input.now, input.eligibilityTimeZone);
  const localDay = calendarDayNumber(localDate);
  const candidates = [localDate.year - 1, localDate.year, localDate.year + 1]
    .map((benefitYear) => birthdayCandidate(input, benefitYear))
    .filter((candidate) => (
      localDay >= candidate.windowStartDay && localDay <= candidate.windowEndDay
    ))
    .sort((left, right) => compareCandidate(left, right, localDay));
  const selected = candidates[0];
  if (!selected) return null;
  return Object.freeze({
    benefitYear: selected.benefitYear,
    localDate: formatCalendarDate(localDate),
    observedBirthday: formatCalendarDate(selected.observedBirthday),
    windowStartsOn: formatCalendarDate(calendarDateFromDayNumber(selected.windowStartDay)),
    windowEndsOn: formatCalendarDate(calendarDateFromDayNumber(selected.windowEndDay)),
  });
}

export function isValidBirthday(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(2000, month);
}

function validateBirthdayWindowInput(input: BirthdayWindowInput): void {
  if (!isValidBirthday(input.birthdayMonth, input.birthdayDay)) {
    throw new Error("BIRTHDAY_DATE_INVALID");
  }
  if (!isNonnegativeInteger(input.windowBeforeDays)
    || !isNonnegativeInteger(input.windowAfterDays)) {
    throw new Error("BIRTHDAY_WINDOW_INVALID");
  }
  if (input.leapDayObservation !== "FEB_28" && input.leapDayObservation !== "MAR_01") {
    throw new Error("BIRTHDAY_LEAP_DAY_RULE_INVALID");
  }
  if (!isValidIanaTimeZone(input.eligibilityTimeZone)) {
    throw new Error("BIRTHDAY_TIME_ZONE_INVALID");
  }
  if (Number.isNaN(input.now.getTime())) throw new Error("PROMOTION_NOW_INVALID");
}

function localCalendarDate(now: Date, timeZone: string): CalendarDate {
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = numericPart(parts, "year");
  const month = numericPart(parts, "month");
  const day = numericPart(parts, "day");
  return Object.freeze({ year, month, day });
}

function numericPart(parts: readonly Intl.DateTimeFormatPart[], type: string): number {
  const raw = parts.find((part) => part.type === type)?.value;
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isInteger(value)) throw new Error("BIRTHDAY_LOCAL_DATE_INVALID");
  return value;
}

function birthdayCandidate(input: BirthdayWindowInput, benefitYear: number) {
  const observedBirthday = observedBirthdayForYear(input, benefitYear);
  const birthdayDay = calendarDayNumber(observedBirthday);
  return Object.freeze({
    benefitYear,
    observedBirthday,
    birthdayDay,
    windowStartDay: birthdayDay - input.windowBeforeDays,
    windowEndDay: birthdayDay + input.windowAfterDays,
  });
}

function observedBirthdayForYear(
  input: BirthdayWindowInput,
  benefitYear: number,
): CalendarDate {
  if (input.birthdayMonth !== 2 || input.birthdayDay !== 29 || isLeapYear(benefitYear)) {
    return Object.freeze({ year: benefitYear, month: input.birthdayMonth, day: input.birthdayDay });
  }
  return input.leapDayObservation === "FEB_28"
    ? Object.freeze({ year: benefitYear, month: 2, day: 28 })
    : Object.freeze({ year: benefitYear, month: 3, day: 1 });
}

function compareCandidate(
  left: ReturnType<typeof birthdayCandidate>,
  right: ReturnType<typeof birthdayCandidate>,
  localDay: number,
): number {
  const leftDistance = Math.abs(left.birthdayDay - localDay);
  const rightDistance = Math.abs(right.birthdayDay - localDay);
  if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  return left.benefitYear - right.benefitYear;
}

function calendarDayNumber(date: CalendarDate): number {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / DAY_MS);
}

function calendarDateFromDayNumber(dayNumber: number): CalendarDate {
  const date = new Date(dayNumber * DAY_MS);
  return Object.freeze({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function formatCalendarDate(date: CalendarDate): string {
  return `${date.year.toString().padStart(4, "0")}-${date.month.toString().padStart(2, "0")}-${date.day.toString().padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isNonnegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}
