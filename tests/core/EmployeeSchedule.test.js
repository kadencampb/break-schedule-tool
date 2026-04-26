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

    it('restBreaksRequired: 3h = 0 rests', () => {
        const short = new EmployeeSchedule('Dave');
        short.addSegment('Cashier', 'Cashier', h(9), h(12), 0);
        expect(short.restBreaksRequired()).toBe(0);
    });

    it('restBreaksRequired: 4h = 1 rest', () => {
        const four = new EmployeeSchedule('Eve');
        four.addSegment('Cashier', 'Cashier', h(9), h(13), 0);
        expect(four.restBreaksRequired()).toBe(1);
    });

    it('restBreaksRequired: 6.5h (with 30m meal) = 2 rests', () => {
        // 6.5h shift - 30m meal = 6h worked → 2 rests
        const six = new EmployeeSchedule('Frank');
        six.addSegment('Cashier', 'Cashier', h(8), h(14.5), 0);
        expect(six.restBreaksRequired(30)).toBe(2);
    });

    it('restBreaksRequired: 10h+ worked = 3 rests', () => {
        const ten = new EmployeeSchedule('Grace');
        ten.addSegment('Cashier', 'Cashier', h(6), h(17), 0); // 11h shift
        // 11h - 30m meal = 10.5h worked → 3 rests
        expect(ten.restBreaksRequired(30)).toBe(3);
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

    it('restBreaksRequired = 2 (based on 8h worked)', () => {
        // 8h worked, 0 meal minutes scheduled
        expect(emp.restBreaksRequired(0)).toBe(2);
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
