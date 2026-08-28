import { describe, expect, it } from "vitest";
import {
  birthdayWindowAt,
  isValidBirthday,
  isValidIanaTimeZone,
} from "../birthday-calendar";

describe("birthday calendar authority", () => {
  it("validates month/day without storing or requiring a year", () => {
    expect(isValidBirthday(1, 31)).toBe(true);
    expect(isValidBirthday(2, 29)).toBe(true);
    expect(isValidBirthday(4, 31)).toBe(false);
    expect(isValidBirthday(2, 30)).toBe(false);
    expect(isValidBirthday(0, 1)).toBe(false);
    expect(isValidBirthday(13, 1)).toBe(false);
  });

  it("uses the rule timezone rather than the server timezone", () => {
    const now = new Date("2026-06-01T06:30:00.000Z");
    expect(match({ month: 6, day: 1, timeZone: "Asia/Tokyo", now })?.benefitYear).toBe(2026);
    expect(match({ month: 6, day: 1, timeZone: "America/Los_Angeles", now })).toBeNull();
  });

  it("handles month-crossing and calendar-year-crossing windows", () => {
    const monthCrossing = birthdayWindowAt({
      birthdayMonth: 3,
      birthdayDay: 1,
      windowBeforeDays: 2,
      windowAfterDays: 0,
      leapDayObservation: "FEB_28",
      eligibilityTimeZone: "UTC",
      now: new Date("2026-02-28T12:00:00.000Z"),
    });
    expect(monthCrossing?.benefitYear).toBe(2026);
    expect(monthCrossing?.windowStartsOn).toBe("2026-02-27");

    const yearCrossing = birthdayWindowAt({
      birthdayMonth: 1,
      birthdayDay: 2,
      windowBeforeDays: 5,
      windowAfterDays: 1,
      leapDayObservation: "FEB_28",
      eligibilityTimeZone: "Asia/Seoul",
      now: new Date("2026-12-27T15:30:00.000Z"),
    });
    expect(yearCrossing).toMatchObject({
      benefitYear: 2027,
      localDate: "2026-12-28",
      observedBirthday: "2027-01-02",
    });
  });

  it("observes Feb 29 exactly in leap years", () => {
    const result = match({
      month: 2,
      day: 29,
      timeZone: "UTC",
      now: new Date("2028-02-29T12:00:00.000Z"),
      leapRule: "MAR_01",
    });
    expect(result).toMatchObject({ benefitYear: 2028, observedBirthday: "2028-02-29" });
  });

  it("applies explicit non-leap FEB_28 and MAR_01 observations", () => {
    expect(match({
      month: 2,
      day: 29,
      timeZone: "UTC",
      now: new Date("2027-02-28T12:00:00.000Z"),
      leapRule: "FEB_28",
    })).toMatchObject({ benefitYear: 2027, observedBirthday: "2027-02-28" });
    expect(match({
      month: 2,
      day: 29,
      timeZone: "UTC",
      now: new Date("2027-03-01T12:00:00.000Z"),
      leapRule: "MAR_01",
    })).toMatchObject({ benefitYear: 2027, observedBirthday: "2027-03-01" });
  });

  it("rejects invalid timezone authority", () => {
    expect(isValidIanaTimeZone("Asia/Seoul")).toBe(true);
    expect(isValidIanaTimeZone("ko-KR")).toBe(false);
    expect(() => match({
      month: 1,
      day: 1,
      timeZone: "not/a-zone",
      now: new Date("2026-01-01T00:00:00.000Z"),
    })).toThrow("BIRTHDAY_TIME_ZONE_INVALID");
  });
});

interface MatchInput {
  readonly month: number;
  readonly day: number;
  readonly timeZone: string;
  readonly now: Date;
  readonly leapRule?: "FEB_28" | "MAR_01";
}

function match(input: MatchInput) {
  return birthdayWindowAt({
    birthdayMonth: input.month,
    birthdayDay: input.day,
    windowBeforeDays: 0,
    windowAfterDays: 0,
    leapDayObservation: input.leapRule ?? "FEB_28",
    eligibilityTimeZone: input.timeZone,
    now: input.now,
  });
}
