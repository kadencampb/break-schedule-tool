import { describe, it, expect } from 'vitest';
import { timeToMinutes, minutesToTime, formatName, parseShiftInterval, findGroupContaining } from '../../src/core/helpers.js';

describe('timeToMinutes', () => {
    it('converts 12-hour AM times', () => {
        expect(timeToMinutes('8:00AM')).toBe(480);
        expect(timeToMinutes('12:00AM')).toBe(0);
        expect(timeToMinutes('8:30AM')).toBe(510);
        expect(timeToMinutes('11:45AM')).toBe(705);
    });

    it('converts 12-hour PM times', () => {
        expect(timeToMinutes('12:00PM')).toBe(720);
        expect(timeToMinutes('1:00PM')).toBe(780);
        expect(timeToMinutes('9:30PM')).toBe(1290);
        expect(timeToMinutes('4:30PM')).toBe(990);
    });

    it('converts 24-hour times', () => {
        expect(timeToMinutes('09:00')).toBe(540);
        expect(timeToMinutes('14:30')).toBe(870);
        expect(timeToMinutes('21:00')).toBe(1260);
        expect(timeToMinutes('10:00')).toBe(600);
    });

    it('handles leading/trailing spaces', () => {
        expect(timeToMinutes('  8:00AM  ')).toBe(480);
    });

    it('returns 0 for null or empty input', () => {
        expect(timeToMinutes(null)).toBe(0);
        expect(timeToMinutes('')).toBe(0);
        expect(timeToMinutes(undefined)).toBe(0);
    });

    it('returns 0 for non-string input', () => {
        expect(timeToMinutes(480)).toBe(0);
    });
});

describe('minutesToTime', () => {
    it('converts minutes to 12-hour AM time', () => {
        expect(minutesToTime(480)).toBe('8:00AM');
        expect(minutesToTime(510)).toBe('8:30AM');
        expect(minutesToTime(0)).toBe('12:00AM');
        expect(minutesToTime(705)).toBe('11:45AM');
    });

    it('converts minutes to 12-hour PM time', () => {
        expect(minutesToTime(720)).toBe('12:00PM');
        expect(minutesToTime(780)).toBe('1:00PM');
        expect(minutesToTime(1290)).toBe('9:30PM');
        expect(minutesToTime(990)).toBe('4:30PM');
    });

    it('is the inverse of timeToMinutes for standard values', () => {
        const times = ['8:00AM', '9:30AM', '12:00PM', '1:30PM', '4:30PM', '5:00PM', '9:00PM'];
        for (const t of times) {
            expect(minutesToTime(timeToMinutes(t))).toBe(t);
        }
    });
});

describe('formatName', () => {
    it('reformats Last, First to First Last', () => {
        expect(formatName('Smith, John')).toBe('John Smith');
        expect(formatName('Brown, Alice')).toBe('Alice Brown');
        expect(formatName("O'Brien, Pat")).toBe("Pat O'Brien");
    });

    it('trims whitespace around name parts', () => {
        expect(formatName('Smith , John ')).toBe('John Smith');
    });

    it('leaves names without a comma unchanged', () => {
        expect(formatName('John Smith')).toBe('John Smith');
    });

    it('returns empty string for null/undefined/empty', () => {
        expect(formatName(null)).toBe('');
        expect(formatName(undefined)).toBe('');
        expect(formatName('')).toBe('');
    });
});

describe('parseShiftInterval', () => {
    it('parses standard 12-hour shift strings', () => {
        expect(parseShiftInterval('8:00AM-4:30PM')).toEqual([480, 990]);
        expect(parseShiftInterval('9:00AM-5:00PM')).toEqual([540, 1020]);
        expect(parseShiftInterval('7:00AM-3:30PM')).toEqual([420, 930]);
    });

    it('handles spaces around the dash', () => {
        expect(parseShiftInterval('8:00AM - 4:30PM')).toEqual([480, 990]);
    });

    it('returns [0, 0] for null or empty input', () => {
        expect(parseShiftInterval(null)).toEqual([0, 0]);
        expect(parseShiftInterval('')).toEqual([0, 0]);
    });

    it('returns [0, 0] for malformed input with no dash', () => {
        expect(parseShiftInterval('8:00AM')).toEqual([0, 0]);
    });
});

describe('findGroupContaining', () => {
    const groups = [
        { id: 1, name: 'Cashier', departments: [{ main: 'Frontline', sub: 'Cashier' }] },
        {
            id: 2,
            name: 'Clothing',
            departments: [
                { main: 'Softgoods', sub: 'Clothing' },
                { main: 'Softgoods', sub: 'Fitting Room' }
            ]
        }
    ];

    it('finds the correct group for a known dept', () => {
        const result = findGroupContaining('Frontline', 'Cashier', groups);
        expect(result).toBeDefined();
        expect(result.name).toBe('Cashier');
    });

    it('finds a group with multiple departments', () => {
        const result = findGroupContaining('Softgoods', 'Fitting Room', groups);
        expect(result).toBeDefined();
        expect(result.name).toBe('Clothing');
    });

    it('returns undefined for an unknown subdept', () => {
        expect(findGroupContaining('Frontline', 'Unknown', groups)).toBeUndefined();
    });

    it('returns undefined for null mainDept', () => {
        expect(findGroupContaining(null, 'Cashier', groups)).toBeUndefined();
    });

    it('returns undefined for null groups', () => {
        expect(findGroupContaining('Frontline', 'Cashier', null)).toBeUndefined();
    });
});
