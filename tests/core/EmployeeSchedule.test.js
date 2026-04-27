import { describe, it, expect, beforeEach } from 'vitest';
import { EmployeeSchedule } from '../../src/core/EmployeeSchedule.js';

// Helper: minutes from hour value
const h = (hour) => hour * 60;

describe('EmployeeSchedule — standard shift', () => {
    let emp;

    beforeEach(() => {
        emp = new EmployeeSchedule('Alice Smith');
        emp.addSegment('Cashier', 'Cashier', h(8), h(16.5), 0); // 8:00AM–4:30PM (8.5h)
    });

    it('reports correct totalWorkMinutes', () => {
        expect(emp.totalWorkMinutes).toBe(510); // 8.5h × 60
    });

    it('overallStart and overallEnd are correct', () => {
        expect(emp.overallStart).toBe(h(8));
        expect(emp.overallEnd).toBe(h(16.5));
    });

    it('isSplitShift is false', () => {
        expect(emp.isSplitShift).toBe(false);
    });

    it('gaps returns empty array', () => {
        expect(emp.gaps).toHaveLength(0);
    });

    it('isWorkingAt returns true within segment', () => {
        expect(emp.isWorkingAt(h(10))).toBe(true);
        expect(emp.isWorkingAt(h(8))).toBe(true);
    });

    it('isWorkingAt returns false outside segment', () => {
        expect(emp.isWorkingAt(h(7))).toBe(false);
        expect(emp.isWorkingAt(h(17))).toBe(false);
    });

    it('isValidBreakWindow accepts windows inside segment', () => {
        expect(emp.isValidBreakWindow(h(10), 15)).toBe(true);
        expect(emp.isValidBreakWindow(h(12), 30)).toBe(true);
    });

    it('isValidBreakWindow rejects windows that exceed segment end', () => {
        expect(emp.isValidBreakWindow(h(16.5), 15)).toBe(false);
        expect(emp.isValidBreakWindow(h(16.25), 30)).toBe(false);
    });

    it('isValidBreakWindow rejects a break adjacent to segment start (time == s.start)', () => {
        // Augustus v. ABM Security (2016): break adjacent to a shift boundary is not a
        // genuine off-duty rest period. Employee must have worked before taking the break.
        expect(emp.isValidBreakWindow(h(8), 15)).toBe(false);  // starts exactly at 8AM
    });

    it('isValidBreakWindow rejects a break adjacent to segment end (breakEnd == s.end)', () => {
        // Symmetric: employee would go directly from break to clock-out.
        // 4:15PM start + 15 min = 4:30PM = segment end.
        expect(emp.isValidBreakWindow(h(16.25), 15)).toBe(false);
    });

    it('isValidBreakWindow accepts a break one step inside both boundaries', () => {
        expect(emp.isValidBreakWindow(h(8) + 1, 15)).toBe(true);   // 1 min after start
        expect(emp.isValidBreakWindow(h(16.25) - 1, 15)).toBe(true); // 1 min before latest
    });

    it('mealsRequired: short shift (3h) = 0 meals', () => {
        const short = new EmployeeSchedule('Bob');
        short.addSegment('Cashier', 'Cashier', h(9), h(12), 0);
        expect(short.mealsRequired()).toBe(0);
    });

    it('mealsRequired: exactly 4h59m (299 min) = 0 meals', () => {
        const justUnder = new EmployeeSchedule('Bob');
        justUnder.addSegment('Cashier', 'Cashier', 0, 299, 0);
        expect(justUnder.mealsRequired()).toBe(0);
    });

    it('mealsRequired: exactly 5h (300 min) = 1 meal', () => {
        const exactly5 = new EmployeeSchedule('Bob');
        exactly5.addSegment('Cashier', 'Cashier', 0, 300, 0);
        expect(exactly5.mealsRequired()).toBe(1);
    });

    it('mealsRequired: 5h+ shift = 1 meal', () => {
        expect(emp.mealsRequired()).toBe(1); // 8.5h shift
    });

    it('mealsRequired: exactly 9h59m (599 min) = 1 meal', () => {
        const justUnder10 = new EmployeeSchedule('Carol');
        justUnder10.addSegment('Cashier', 'Cashier', 0, 599, 0);
        expect(justUnder10.mealsRequired()).toBe(1);
    });

    it('mealsRequired: exactly 10h (600 min) = 2 meals', () => {
        const exactly10 = new EmployeeSchedule('Carol');
        exactly10.addSegment('Cashier', 'Cashier', 0, 600, 0);
        expect(exactly10.mealsRequired()).toBe(2);
    });

    it('mealsRequired: 10h+ shift = 2 meals', () => {
        const long = new EmployeeSchedule('Carol');
        long.addSegment('Cashier', 'Cashier', h(6), h(17), 0); // 11h
        expect(long.mealsRequired()).toBe(2);
    });

    // -----------------------------------------------------------------------
    // restBreaksRequired — strict CA DLSE formula
    // 1 break per 4h or major fraction (> 2h). No break if total < 3.5h.
    // -----------------------------------------------------------------------

    it('restBreaksRequired: 3h (180 min) = 0 rests', () => {
        const short = new EmployeeSchedule('Dave');
        short.addSegment('Cashier', 'Cashier', h(9), h(12), 0);
        expect(short.restBreaksRequired()).toBe(0);
    });

    it('restBreaksRequired: 3.5h (210 min) = 1 rest', () => {
        const threeHalf = new EmployeeSchedule('Dave');
        threeHalf.addSegment('Cashier', 'Cashier', h(9), h(12.5), 0);
        expect(threeHalf.restBreaksRequired()).toBe(1);
    });

    it('restBreaksRequired: 4h (240 min) = 1 rest', () => {
        const four = new EmployeeSchedule('Eve');
        four.addSegment('Cashier', 'Cashier', h(9), h(13), 0);
        expect(four.restBreaksRequired()).toBe(1);
    });

    it('restBreaksRequired: exactly 6h (360 min) = 1 rest (remainder 120 min, not > 120)', () => {
        const six = new EmployeeSchedule('Frank');
        six.addSegment('Cashier', 'Cashier', h(9), h(15), 0);
        expect(six.restBreaksRequired()).toBe(1);
    });

    it('restBreaksRequired: 6h+1min (361 min) = 2 rests (remainder 121 min > 120)', () => {
        const sixPlus = new EmployeeSchedule('Frank');
        sixPlus.addSegment('Cashier', 'Cashier', 0, 361, 0);
        expect(sixPlus.restBreaksRequired()).toBe(2);
    });

    it('restBreaksRequired: 6.5h (390 min) = 2 rests', () => {
        // 390 min: floor(390/240)=1, remainder=150, 150 > 120 → 2 rests
        const sixHalf = new EmployeeSchedule('Frank');
        sixHalf.addSegment('Cashier', 'Cashier', h(8), h(14.5), 0);
        expect(sixHalf.restBreaksRequired()).toBe(2);
    });

    it('restBreaksRequired: 8h (480 min) = 2 rests', () => {
        const eight = new EmployeeSchedule('Grace');
        eight.addSegment('Cashier', 'Cashier', h(9), h(17), 0);
        expect(eight.restBreaksRequired()).toBe(2);
    });

    it('restBreaksRequired: 8.5h (510 min) = 2 rests', () => {
        expect(emp.restBreaksRequired()).toBe(2); // Alice Smith: 8:00AM–4:30PM
    });

    it('restBreaksRequired: 11h (660 min) = 3 rests', () => {
        const eleven = new EmployeeSchedule('Grace');
        eleven.addSegment('Cashier', 'Cashier', h(6), h(17), 0);
        expect(eleven.restBreaksRequired()).toBe(3);
    });
});

describe('EmployeeSchedule — split shift', () => {
    let emp;

    beforeEach(() => {
        emp = new EmployeeSchedule('Frank Green');
        // 7AM–11AM (4h) then 3PM–7PM (4h), with a 4h gap
        emp.addSegment('Cashier', 'Cashier', h(7), h(11), 0);
        emp.addSegment('Cashier', 'Cashier', h(15), h(19), 1);
    });

    it('totalWorkMinutes = sum of segments only (8h)', () => {
        expect(emp.totalWorkMinutes).toBe(480); // 4h + 4h
    });

    it('overallStart and overallEnd span the full day', () => {
        expect(emp.overallStart).toBe(h(7));
        expect(emp.overallEnd).toBe(h(19));
    });

    it('isSplitShift is true when gap >= 30 min', () => {
        expect(emp.isSplitShift).toBe(true);
    });

    it('gaps identifies the 4-hour gap correctly', () => {
        const gaps = emp.gaps;
        expect(gaps).toHaveLength(1);
        expect(gaps[0].start).toBe(h(11));
        expect(gaps[0].end).toBe(h(15));
        expect(gaps[0].duration).toBe(h(4));
    });

    it('gapSatisfiesMealPeriod is true', () => {
        expect(emp.gapSatisfiesMealPeriod()).toBe(true);
    });

    it('mealsRequired = 0 (gap satisfies the meal)', () => {
        // 8h total work → normally 1 meal, but gap satisfies it
        expect(emp.mealsRequired()).toBe(0);
    });

    it('restBreaksRequired = 2 (8h combined daily total)', () => {
        // 480 min: floor(480/240)=2, remainder=0 → 2 rests
        expect(emp.restBreaksRequired()).toBe(2);
    });

    it('isWorkingAt is false during the gap', () => {
        expect(emp.isWorkingAt(h(12))).toBe(false);
        expect(emp.isWorkingAt(h(14))).toBe(false);
    });

    it('isWorkingAt is true in both segments', () => {
        expect(emp.isWorkingAt(h(8))).toBe(true);
        expect(emp.isWorkingAt(h(16))).toBe(true);
    });

    it('isValidBreakWindow rejects windows that cross into the gap', () => {
        // A break starting at 10:45AM would end at 11:00AM — right at the gap edge
        expect(emp.isValidBreakWindow(h(10.75), 15)).toBe(false);
        // A break starting at 10:30AM ends at 10:45AM — valid
        expect(emp.isValidBreakWindow(h(10.5), 15)).toBe(true);
    });

    it('isValidBreakWindow rejects windows entirely within the gap', () => {
        expect(emp.isValidBreakWindow(h(12), 15)).toBe(false);
    });

    it('segments are sorted chronologically even if added out of order', () => {
        const unordered = new EmployeeSchedule('Test');
        unordered.addSegment('Dept', 'Job', h(15), h(19), 1);
        unordered.addSegment('Dept', 'Job', h(7), h(11), 0);
        expect(unordered.segments[0].start).toBe(h(7));
        expect(unordered.segments[1].start).toBe(h(15));
    });
});

describe('EmployeeSchedule — back-to-back segments (no real gap)', () => {
    it('isSplitShift is false when segments are adjacent', () => {
        const emp = new EmployeeSchedule('Adjacent Worker');
        emp.addSegment('Dept', 'Job', h(8), h(12), 0);
        emp.addSegment('Dept', 'Job', h(12), h(16), 1); // starts exactly where first ends
        expect(emp.isSplitShift).toBe(false);
        expect(emp.gaps).toHaveLength(0);
    });

    it('isSplitShift is false for a small gap under threshold (e.g., 15 min)', () => {
        const emp = new EmployeeSchedule('Short Gap Worker');
        emp.addSegment('Dept', 'Job', h(8), h(12), 0);
        emp.addSegment('Dept', 'Job', h(12.25), h(16), 1); // 15-min gap
        expect(emp.isSplitShift).toBe(false);
    });
});

describe('EmployeeSchedule — workedTimeToClockTime', () => {
    it('single segment: maps worked offset to clock time correctly', () => {
        const emp = new EmployeeSchedule('Alice');
        emp.addSegment('Dept', 'Job', h(8), h(16.5), 0); // 8AM–4:30PM (510 min)
        // 120 min worked from 8AM = 10AM
        expect(emp.workedTimeToClockTime(120)).toBe(h(10));
        // 360 min worked from 8AM = 2PM
        expect(emp.workedTimeToClockTime(360)).toBe(h(14));
    });

    it('two-segment shift with meal gap: skips the gap when counting worked time', () => {
        // 10AM–2:45PM (285 min) then 3:15PM–6:30PM (195 min), 30-min gap
        const emp = new EmployeeSchedule('Bob');
        emp.addSegment('Dept', 'Job', h(10), h(14.75), 0);   // 10AM–2:45PM = 285 min
        emp.addSegment('Dept', 'Job', h(15.25), h(18.5), 1); // 3:15PM–6:30PM = 195 min

        // Break 1 ideal: 120 min worked from 10AM = 12PM
        expect(emp.workedTimeToClockTime(120)).toBe(h(12));

        // Break 2 ideal: 360 min worked. After seg1 (285 min), need 75 more.
        // Seg2 starts at 3:15PM (915). 915 + 75 = 990 = 16:30 = 4:30PM
        expect(emp.workedTimeToClockTime(360)).toBe(h(16.5)); // 4:30PM
    });

    it('split shift: target in second segment', () => {
        // 7AM–11AM (240 min) then 3PM–7PM (240 min), 4h gap
        const emp = new EmployeeSchedule('Frank');
        emp.addSegment('Cashier', 'Cashier', h(7), h(11), 0);
        emp.addSegment('Cashier', 'Cashier', h(15), h(19), 1);

        // Break 1: 120 min worked from 7AM = 9AM
        expect(emp.workedTimeToClockTime(120)).toBe(h(9));

        // Break 2: 360 min worked. After seg1 (240 min), need 120 more from 3PM = 5PM
        expect(emp.workedTimeToClockTime(360)).toBe(h(17)); // 5PM
    });

    it('returns null when target exceeds totalWorkMinutes', () => {
        const emp = new EmployeeSchedule('Short');
        emp.addSegment('Dept', 'Job', h(9), h(13), 0); // 4h = 240 min
        expect(emp.workedTimeToClockTime(241)).toBeNull();
    });

    it('returns start of first segment when target is 0', () => {
        const emp = new EmployeeSchedule('Early');
        emp.addSegment('Dept', 'Job', h(10), h(14), 0);
        expect(emp.workedTimeToClockTime(0)).toBe(h(10));
    });
});
