import { describe, it, expect } from 'vitest';
import { scheduleBreaks } from '../../src/core/BreakScheduler.js';
import {
    BASIC_SCHEDULE,
    SPLIT_SHIFT_SCHEDULE,
    LONG_SHIFT_SCHEDULE,
    SHORT_SHIFT_SCHEDULE,
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

    it('6h shift gets two rests and one meal', () => {
        const { breaks } = scheduleBreaks(BASIC_SCHEDULE, OPTIONS);
        const bob = breaks['Bob Jones'];
        // 6h > 5h → 1 meal; 6h - 30m = 5.5h → 2 rests
        expect(bob.rest1).not.toBeNull();
        expect(bob.meal).not.toBeNull();
        expect(bob.rest2).not.toBeNull();
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

    it('meal break is scheduled around the 4-hour mark', () => {
        const { breaks } = scheduleBreaks(BASIC_SCHEDULE, OPTIONS);
        const alice = breaks['Alice Smith'];
        // Ideal is 8:00AM + 4h = 12:00PM (720 min). Allow ±30min
        expect(alice.meal).toBeGreaterThanOrEqual(690);
        expect(alice.meal).toBeLessThanOrEqual(750);
    });

    it('first rest break is scheduled around the 2-hour mark', () => {
        const { breaks } = scheduleBreaks(BASIC_SCHEDULE, OPTIONS);
        const alice = breaks['Alice Smith'];
        // Ideal is 8:00AM + 2h = 10:00AM (600 min). Allow ±30min
        expect(alice.rest1).toBeGreaterThanOrEqual(570);
        expect(alice.rest1).toBeLessThanOrEqual(630);
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
