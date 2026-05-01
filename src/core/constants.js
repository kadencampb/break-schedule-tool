/**
 * Default coverage optimization groups. Only departments that share staff
 * across subdepts get pre-grouped; everything else stays standalone and the
 * user can drag-and-drop to combine them in the wizard's Departments step.
 */
export const DEFAULT_GROUPS = [
    {
        id: 1,
        name: 'Bldg 2',
        departments: [
            { main: 'Frontline', sub: 'Customer Service Bldg 2' },
            { main: 'Hardgoods', sub: 'Action Sports' },
            { main: 'Hardgoods', sub: 'Rentals' }
        ]
    },
    {
        id: 2,
        name: 'Shop',
        departments: [
            { main: 'Shop', sub: 'Shop' },
            { main: 'Shop', sub: 'Service Advisor' },
            { main: 'Shop', sub: 'Assembler' }
        ]
    }
];

/**
 * Default advanced scheduling settings.
 *
 * maxEarly / maxDelay apply to REST BREAKS only. Meal period timing is constrained
 * by the CA DLSE 4h45m legal window, but the preferred placement within that window
 * is configurable via idealMealOffset.
 *
 * deptCoverageMode controls how coworkers are counted when scoring candidate break
 * times for staggering:
 *   'individual' — only same-subdepartment coworkers count
 *   'balanced'   — same subdept primary, whole coverage group as tiebreaker
 *   'group'      — entire coverage group is treated as one cohort
 *
 * timeCoverageMode controls how the scheduler trades off proximity-to-ideal vs
 * coverage maximization:
 *   'predictable' — pick the time closest to ideal; coverage breaks ties
 *   'balanced'    — sum of coverage and proximity (in normalized units)
 *   'coverage'    — pick the time with the most coworkers present; proximity breaks ties
 */
export const DEFAULT_ADVANCED_SETTINGS = {
    maxEarly: 30,
    maxDelay: 60,
    deptCoverageMode: 'balanced',
    timeCoverageMode: 'balanced',
    idealMealOffset: 240
};

/**
 * CA DLSE meal violation threshold in minutes.
 * An employee cannot work more than 5 hours (300 min) continuously without a meal.
 * This constant is set to 285 (4h 45m) as the latest safe start — scheduling the meal
 * here means the employee returns after 5h15m of shift time but only 4h45m of worked
 * time, leaving a compliance buffer before the 5h worked trigger.
 */
export const MAX_WORK_BEFORE_MEAL = 285;

/** Default operating hours (10 AM – 9 PM) */
export const DEFAULT_OPERATING_HOURS = {
    startTime: 10 * 60,
    endTime: 21 * 60
};

/** Default per-day operating hours for the settings UI */
export const DEFAULT_HOURS_BY_DAY = {
    monday:    { start: '10:00', end: '21:00' },
    tuesday:   { start: '10:00', end: '21:00' },
    wednesday: { start: '10:00', end: '21:00' },
    thursday:  { start: '10:00', end: '21:00' },
    friday:    { start: '10:00', end: '21:00' },
    saturday:  { start: '10:00', end: '21:00' },
    sunday:    { start: '10:00', end: '21:00' }
};

/** Minimum gap in minutes between shift segments to be considered a split shift */
export const SPLIT_SHIFT_GAP_THRESHOLD = 30;

/** Column indices in the schedule data after column D is removed */
export const COL = {
    DEPT:  0,
    JOB:   1,
    NAME:  2,
    SHIFT: 3,
    REST1: 4,
    MEAL:  5,
    REST2: 6
};
