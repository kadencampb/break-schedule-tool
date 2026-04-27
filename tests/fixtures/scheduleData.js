/**
 * Synthetic schedule fixtures — no real employee names or data.
 * These mirror the row format produced by XLSX.utils.sheet_to_json after column D is removed:
 * [dept, job, name, shiftStr, ...]
 *
 * dataStart = 7 means the first 7 rows are headers; employee rows begin at index 7.
 */

/** Single-day schedule with a mix of short, medium, and long shifts */
export const BASIC_SCHEDULE = [
    ['Date: 2024-01-15'],   // row 0
    ['Location: Test Store'], // row 1
    ['Dept', 'Job', 'Name'], // row 2
    [],                      // row 3
    [],                      // row 4
    [],                      // row 5
    ['Dept', 'Job', 'Name', 'Shift', '15', '30', '15'], // row 6 — header
    // --- Employee rows ---
    ['Cashier', null,       null,           null], // row 7 — dept header
    [null,      'Cashier',  'Alice Smith',  '8:00AM-4:30PM'], // row 8 — 8.5h shift
    [null,      'Cashier',  'Bob Jones',    '9:00AM-3:00PM'], // row 9 — 6h shift (1 rest under strict DLSE)
    [null,      'Cashier',  'Carol Davis',  '12:00PM-6:00PM'], // row 10 — 6h shift (1 rest under strict DLSE)
    ['Clothing', null,      null,           null], // row 11 — dept header
    [null,      'Clothing', 'Dave Wilson',  '10:00AM-2:00PM'], // row 12 — 4h shift
    [null,      'Clothing', 'Eve Brown',    '7:00AM-3:30PM'], // row 13 — 8.5h shift
];

/**
 * Schedule containing a split shift employee.
 * "Frank Green" works 7AM–11AM and 3PM–7PM (8h total, 4h gap).
 */
export const SPLIT_SHIFT_SCHEDULE = [
    ['Date: 2024-01-15'],
    ['Location: Test Store'],
    ['Dept', 'Job', 'Name'],
    [], [], [],
    ['Dept', 'Job', 'Name', 'Shift', '15', '30', '15'],
    ['Cashier', null,      null,           null],
    [null,      'Cashier', 'Frank Green',  '7:00AM-11:00AM'], // first segment
    [null,      'Cashier', 'Frank Green',  '3:00PM-7:00PM'],  // second segment (split)
    [null,      'Cashier', 'Grace Lee',    '8:00AM-4:30PM'],  // normal shift
];

/**
 * Long shift schedule (> 10 hours worked) to test three rest breaks
 * and the second meal period.
 */
export const LONG_SHIFT_SCHEDULE = [
    ['Date: 2024-01-15'],
    ['Location: Test Store'],
    ['Dept', 'Job', 'Name'],
    [], [], [],
    ['Dept', 'Job', 'Name', 'Shift', '15', '30', '15'],
    ['Cashier', null,      null,                null],
    [null,      'Cashier', 'Henry Clark',  '6:00AM-5:00PM'], // 11h shift — needs 2 meals, 3 rests
    [null,      'Cashier', 'Iris Martin',  '8:00AM-4:30PM'], // 8.5h — needs 1 meal, 2 rests
];

/**
 * Short shifts that need no breaks or only one rest break.
 */
export const SHORT_SHIFT_SCHEDULE = [
    ['Date: 2024-01-15'],
    ['Location: Test Store'],
    ['Dept', 'Job', 'Name'],
    [], [], [],
    ['Dept', 'Job', 'Name', 'Shift', '15', '30', '15'],
    ['Cashier', null,      null,           null],
    [null,      'Cashier', 'Jack Adams',   '9:00AM-12:00PM'], // 3h — no breaks
    [null,      'Cashier', 'Kim Baker',    '9:00AM-1:00PM'],  // 4h — 1 rest
    [null,      'Cashier', 'Leo Castro',   '9:00AM-5:00PM'],  // 8h — 2 rests, 1 meal
];

/** Coverage groups for testing */
export const TEST_GROUPS = [
    {
        id: 1,
        name: 'Cashier',
        departments: [{ main: 'Cashier', sub: 'Cashier' }]
    },
    {
        id: 2,
        name: 'Clothing',
        departments: [{ main: 'Clothing', sub: 'Clothing' }]
    }
];

/** Advanced settings for testing — matches DEFAULT_ADVANCED_SETTINGS */
export const TEST_ADV_SETTINGS = {
    maxEarly: 60,
    maxDelay: 45,
    deptWeightMultiplier: 4,
    proximityWeight: 1
};

/**
 * Schedule with a natural 30-min meal gap in a continuous shift.
 * "Meal Gap Employee" works 10AM–2:45PM then 3:15PM–6:30PM (8h total, 30-min gap).
 * This tests workedTimeToClockTime-based break placement:
 *   Break 1 ideal: 120 min worked from 10AM = 12PM
 *   Break 2 ideal: 360 min worked = 75 min into second segment (3:15PM + 75 min = 4:30PM)
 */
export const MEAL_GAP_SCHEDULE = [
    ['Date: 2024-01-15'],
    ['Location: Test Store'],
    ['Dept', 'Job', 'Name'],
    [], [], [],
    ['Dept', 'Job', 'Name', 'Shift', '15', '30', '15'],
    ['Cashier', null,      null,              null],
    [null,      'Cashier', 'Meal Gap Employee', '10:00AM-2:45PM'], // first segment: 285 min
    [null,      'Cashier', 'Meal Gap Employee', '3:15PM-6:30PM'],  // second segment: 195 min
];

/** Operating hours for testing (9 AM – 9 PM) */
export const TEST_OPERATING_HOURS = {
    startTime: 9 * 60,
    endTime: 21 * 60
};
