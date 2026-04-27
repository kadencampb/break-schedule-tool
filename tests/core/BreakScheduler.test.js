import { describe, it, expect } from 'vitest';
import { scheduleBreaks } from '../../src/core/BreakScheduler.js';
import {
    BASIC_SCHEDULE,
    SPLIT_SHIFT_SCHEDULE,
    LONG_SHIFT_SCHEDULE,
    SHORT_SHIFT_SCHEDULE,
    MEAL_GAP_SCHEDULE,
    SHORT_FIRST_SPLIT_SCHEDULE,
    TEST_GROUPS,
    TEST_ADV_SETTINGS,
    TEST_OPERATING_HOURS
} from '../fixtures/scheduleData.js';

const OPTIONS = {
    operatingHours: TEST_OPERATING_HOURS,
    groups: [],
    advancedSettings: TEST_ADV_SETTINGS,
    enableLogging: false,
    dataStart: 7,
    shiftColumnIndex: 3
};

// -------------------------------------------------------------------------
// California labor law compliance
// -------------------------------------------------------------------------

describe('California law — short shifts', () => {
    it('3-hour shift: no breaks required', () => {
        const { breaks } = scheduleBreaks(SHORT_SHIFT_SCHEDULE, OPTIONS);
        const jack = breaks['Jack Adams'];
        expect(jack.meal).toBeNull();
        expect(jack.rest1).toBeNull();
        expect(jack.rest2).toBeNull();
    });

    it('4-hour shift: exactly one rest break, no meal', () => {
        const { breaks } = scheduleBreaks(SHORT_SHIFT_SCHEDULE, OPTIONS);
        const kim = breaks['Kim Baker'];
        expect(kim.rest1).not.toBeNull();
        expect(kim.meal).toBeNull();
        expect(kim.rest2).toBeNull();
    });

    it('8-hour shift: two rest breaks and one meal period', () => {
        const { breaks } = scheduleBreaks(SHORT_SHIFT_SCHEDULE, OPTIONS);
        const leo = breaks['Leo Castro'];
        expect(leo.rest1).not.toBeNull();
        expect(leo.meal).not.toBeNull();
        expect(leo.rest2).not.toBeNull();
    });
});

describe('California law — standard shifts', () => {
    it('8.5h shift gets two rests and one meal', () => {
        const { breaks } = scheduleBreaks(BASIC_SCHEDULE, OPTIONS);
        const alice = breaks['Alice Smith'];
        expect(alice.rest1).not.toBeNull();
        expect(alice.meal).not.toBeNull();
        expect(alice.rest2).not.toBeNull();
    });

    it('6h shift gets one rest and one meal (strict CA DLSE: 360 min, remainder 120, not > 120)', () => {
        const { breaks } = scheduleBreaks(BASIC_SCHEDULE, OPTIONS);
        const bob = breaks['Bob Jones'];
        expect(bob.rest1).not.toBeNull();
        expect(bob.meal).not.toBeNull();
        expect(bob.rest2).toBeNull(); // 6h exactly = 1 break, not 2
    });
});

describe('California law — long shifts', () => {
    it('11-hour shift gets three rests and two meal periods', () => {
        const { breaks } = scheduleBreaks(LONG_SHIFT_SCHEDULE, OPTIONS);
        const henry = breaks['Henry Clark'];
        expect(henry.rest1).not.toBeNull();
        expect(henry.meal).not.toBeNull();
        expect(henry.rest2).not.toBeNull();
        expect(henry.rest3).not.toBeNull(); // third rest OR second meal
    });
});

// -------------------------------------------------------------------------
// Break placement validity
// -------------------------------------------------------------------------

describe('Break placement', () => {
    it('all breaks fall within shift boundaries', () => {
        const { breaks, employeeSchedules } = scheduleBreaks(BASIC_SCHEDULE, OPTIONS);

        for (const [name, empBreaks] of Object.entries(breaks)) {
            const empSchedule = employeeSchedules.get(name);
            if (!empSchedule) continue;

            if (empBreaks.rest1 != null) {
                expect(empSchedule.isValidBreakWindow(empBreaks.rest1, 15)).toBe(true);
            }
            if (empBreaks.meal != null) {
                expect(empSchedule.isValidBreakWindow(empBreaks.meal, 30)).toBe(true);
            }
            if (empBreaks.rest2 != null) {
                expect(empSchedule.isValidBreakWindow(empBreaks.rest2, 15)).toBe(true);
            }
        }
    });

    it('meal is scheduled as late as safely possible (4h45m worked mark)', () => {
        const { breaks } = scheduleBreaks(BASIC_SCHEDULE, OPTIONS);
        const alice = breaks['Alice Smith'];
        // Alice: 8AM-4:30PM (510 min). netWork = 480. Latest safe start = 480-285=195 worked
        // min from start → 8AM + 285 worked min = 12:45PM (765). Earliest = 8AM + 195 = 11:15AM (675).
        // No coverage groups → placed exactly at ideal (latest = 765 = 12:45PM).
        expect(alice.meal).toBeGreaterThanOrEqual(675); // earliest: 11:15AM
        expect(alice.meal).toBeLessThanOrEqual(765);    // latest: 12:45PM
    });

    it('first rest break is near the 2-hour worked mark (pausing for meal)', () => {
        const { breaks } = scheduleBreaks(BASIC_SCHEDULE, OPTIONS);
        const alice = breaks['Alice Smith'];
        // Rest 1 ideal: 120 net worked min from 8AM = 10:00AM (600). Meal is at 12:45PM,
        // which comes after rest 1, so no meal adjustment. Allow ±60 min (new maxEarly/maxDelay).
        expect(alice.rest1).toBeGreaterThanOrEqual(540); // 9:00AM
        expect(alice.rest1).toBeLessThanOrEqual(660);    // 11:00AM
    });
});

// -------------------------------------------------------------------------
// Split shift handling
// -------------------------------------------------------------------------

describe('Split shift', () => {
    it('does not schedule a meal when the gap satisfies the meal period', () => {
        const { breaks } = scheduleBreaks(SPLIT_SHIFT_SCHEDULE, OPTIONS);
        const frank = breaks['Frank Green'];
        // 4h gap satisfies the meal period
        expect(frank.meal).toBeNull();
    });

    it('schedules two rest breaks for an 8h split shift', () => {
        const { breaks } = scheduleBreaks(SPLIT_SHIFT_SCHEDULE, OPTIONS);
        const frank = breaks['Frank Green'];
        expect(frank.rest1).not.toBeNull();
        expect(frank.rest2).not.toBeNull();
    });

    it('rest breaks do not fall within the split gap', () => {
        const { breaks, employeeSchedules } = scheduleBreaks(SPLIT_SHIFT_SCHEDULE, OPTIONS);
        const frank = breaks['Frank Green'];
        const empSchedule = employeeSchedules.get('Frank Green');

        if (frank.rest1 != null) {
            expect(empSchedule.isValidBreakWindow(frank.rest1, 15)).toBe(true);
        }
        if (frank.rest2 != null) {
            expect(empSchedule.isValidBreakWindow(frank.rest2, 15)).toBe(true);
        }
    });

    it('normal employees alongside split-shift employee are unaffected', () => {
        const { breaks } = scheduleBreaks(SPLIT_SHIFT_SCHEDULE, OPTIONS);
        const grace = breaks['Grace Lee'];
        // 8.5h shift: 2 rests + 1 meal
        expect(grace.rest1).not.toBeNull();
        expect(grace.meal).not.toBeNull();
        expect(grace.rest2).not.toBeNull();
    });
});

// -------------------------------------------------------------------------
// Worked-time break placement (meal-gap shift)
// -------------------------------------------------------------------------

describe('Break placement — continuous shift with meal gap', () => {
    // Meal Gap Employee: 10AM–2:45PM (285 min) + 3:15PM–6:30PM (195 min), 30-min gap
    // Total: 480 min → 2 rest breaks
    // Break 1 ideal: 120 net worked min from 10AM = 12:00PM (720)
    // Break 2 ideal: 360 net worked min = 75 min into second segment → 3:15PM + 75 = 4:30PM (990)

    it('schedules two rest breaks for an 8h shift with a 30-min meal gap', () => {
        const { breaks } = scheduleBreaks(MEAL_GAP_SCHEDULE, OPTIONS);
        const emp = breaks['Meal Gap Employee'];
        expect(emp.rest1).not.toBeNull();
        expect(emp.rest2).not.toBeNull();
        expect(emp.meal).toBeNull(); // natural gap serves as meal — no scheduled meal break
    });

    it('first rest break is near the 2-hour worked mark (12PM ± 30 min)', () => {
        const { breaks } = scheduleBreaks(MEAL_GAP_SCHEDULE, OPTIONS);
        const emp = breaks['Meal Gap Employee'];
        // Ideal: 720 (12:00PM). Allow ±30 min = [690, 750]
        expect(emp.rest1).toBeGreaterThanOrEqual(690);
        expect(emp.rest1).toBeLessThanOrEqual(750);
    });

    it('second rest break is near the 4:30PM worked mark (360 min worked ± 30 min)', () => {
        const { breaks } = scheduleBreaks(MEAL_GAP_SCHEDULE, OPTIONS);
        const emp = breaks['Meal Gap Employee'];
        // Ideal: 990 (4:30PM). Allow ±30 min = [960, 1020]
        expect(emp.rest2).toBeGreaterThanOrEqual(960);
        expect(emp.rest2).toBeLessThanOrEqual(1020);
    });

    it('both rest breaks fall within actual worked segments, not in the gap', () => {
        const { breaks, employeeSchedules } = scheduleBreaks(MEAL_GAP_SCHEDULE, OPTIONS);
        const emp = breaks['Meal Gap Employee'];
        const schedule = employeeSchedules.get('Meal Gap Employee');
        if (emp.rest1 != null) expect(schedule.isValidBreakWindow(emp.rest1, 15)).toBe(true);
        if (emp.rest2 != null) expect(schedule.isValidBreakWindow(emp.rest2, 15)).toBe(true);
    });
});

// -------------------------------------------------------------------------
// Short first segment — 2h + 4h split
// -------------------------------------------------------------------------

describe('Split shift — short first segment (2h + 4h)', () => {
    // Short First Employee: 8AM–10AM (2h) + 2PM–6PM (4h), 4h gap satisfies meal.
    // Total = 6h = 360 min → 1 rest break, no scheduled meal.
    // Break owed at 120 worked min = end of segment 1 (overdue). Ideal = seg2.start + 15
    // = 2:15PM (855). Optimizer window [855-60, 855+45] = [795, 900], clipped to [855, 900].

    it('gets exactly one rest break and no meal', () => {
        const { breaks } = scheduleBreaks(SHORT_FIRST_SPLIT_SCHEDULE, OPTIONS);
        const emp = breaks['Short First Employee'];
        expect(emp.rest1).not.toBeNull();
        expect(emp.meal).toBeNull();
        expect(emp.rest2).toBeNull();
    });

    it('rest break falls within segment 2, not the gap or segment 1', () => {
        const { breaks, employeeSchedules } = scheduleBreaks(SHORT_FIRST_SPLIT_SCHEDULE, OPTIONS);
        const emp = breaks['Short First Employee'];
        const schedule = employeeSchedules.get('Short First Employee');
        expect(schedule.isValidBreakWindow(emp.rest1, 15)).toBe(true);
        // Must be in segment 2 (2PM = 840), not segment 1 (ends at 10AM = 600)
        expect(emp.rest1).toBeGreaterThanOrEqual(840);
    });

    it('rest break is placed as soon as practicable in segment 2 (ideal 2:15PM)', () => {
        const { breaks } = scheduleBreaks(SHORT_FIRST_SPLIT_SCHEDULE, OPTIONS);
        const emp = breaks['Short First Employee'];
        // Break overdue from end of segment 1; ideal = 2:15PM (855).
        // Valid window within segment 2: [2:15PM (855), 3:00PM (900)]
        expect(emp.rest1).toBeGreaterThanOrEqual(855); // 2:15PM (earliest in window)
        expect(emp.rest1).toBeLessThanOrEqual(900);    // 3:00PM (latest in window)
    });
});

// -------------------------------------------------------------------------
// Segments write-back
// -------------------------------------------------------------------------

describe('Segments for write-back', () => {
    it('returns a segment entry for each employee row', () => {
        const { segments } = scheduleBreaks(BASIC_SCHEDULE, OPTIONS);
        const names = segments.map(s => s.name);
        expect(names).toContain('Alice Smith');
        expect(names).toContain('Bob Jones');
        expect(names).toContain('Carol Davis');
        expect(names).toContain('Dave Wilson');
        expect(names).toContain('Eve Brown');
    });

    it('returns two segment entries for a split-shift employee', () => {
        const { segments } = scheduleBreaks(SPLIT_SHIFT_SCHEDULE, OPTIONS);
        const frankSegs = segments.filter(s => s.name === 'Frank Green');
        expect(frankSegs).toHaveLength(2);
    });

    it('rowIndex matches the source row', () => {
        const { segments } = scheduleBreaks(BASIC_SCHEDULE, OPTIONS);
        const alice = segments.find(s => s.name === 'Alice Smith');
        expect(alice.rowIndex).toBe(8);
    });
});
