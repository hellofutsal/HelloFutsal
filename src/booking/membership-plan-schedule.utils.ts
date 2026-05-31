import { MembershipTimeWindow } from "./entities/membership-plan.entity";

export interface MembershipScheduleWithWindows {
  day: string;
  startTime: string | string[];
  endTime: string | string[];
}

export function getMembershipTimeWindows(
  schedule: MembershipScheduleWithWindows,
): MembershipTimeWindow[] {
  const startTimes = Array.isArray(schedule.startTime)
    ? schedule.startTime
    : [schedule.startTime];
  const endTimes = Array.isArray(schedule.endTime)
    ? schedule.endTime
    : [schedule.endTime];

  if (startTimes.length !== endTimes.length) {
    throw new Error(
      `Membership plan day ${schedule.day} has mismatched startTime and endTime counts`,
    );
  }

  return startTimes.map((startTime, index) => ({
    startTime,
    endTime: endTimes[index],
  }));
}
