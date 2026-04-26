import { SPLIT_SHIFT_GAP_THRESHOLD } from './constants.js';

/**
 * Represents all scheduled segments for a single employee on a given day.
 *
 * An employee with a split shift will have multiple segments (e.g., 8AM–12PM and 4PM–8PM).
 * This class centralizes the logic for determining total work time, gaps, and valid break windows —
 * which is critical for correct California labor law compliance on split shifts.
 */
export class EmployeeSchedule {
    /**
     * @param {string} name - The employee's formatted name (First Last)
     */
    constructor(name) {
        this.name = name;
        /** @type {Array<{dept: string, job: string, start: number, end: number, rowIndex: number}>} */
        this.segments = [];
    }

    /**
     * Add a shift segment for this employee.
     * @param {string} dept - Main department name
     * @param {string} job - Sub-department / job title
     * @param {number} start - Start time in minutes since midnight
     * @param {number} end - End time in minutes since midnight
     * @param {number} rowIndex - Row index in the source schedule data (for write-back)
     */
    addSegment(dept, job, start, end, rowIndex) {
        this.segments.push({ dept, job, start, end, rowIndex });
        // Keep segments sorted chronologically
        this.segments.sort((a, b) => a.start - b.start);
    }

    /** Total minutes actually worked (sum of segment durations, excludes gaps). */
    get totalWorkMinutes() {
        return this.segments.reduce((sum, s) => sum + (s.end - s.start), 0);
    }

    /** Earliest shift start time across all segments. */
    get overallStart() {
        return this.segments.length ? Math.min(...this.segments.map(s => s.start)) : 0;
    }

    /** Latest shift end time across all segments. */
    get overallEnd() {
        return this.segments.length ? Math.max(...this.segments.map(s => s.end)) : 0;
    }

    /**
     * True if there is at least one gap >= SPLIT_SHIFT_GAP_THRESHOLD between consecutive segments.
     * A split shift gap is treated as unpaid time (not a meal break).
     */
    get isSplitShift() {
        return this.gaps.some(g => g.duration >= SPLIT_SHIFT_GAP_THRESHOLD);
    }

    /**
     * All gaps between consecutive segments, sorted chronologically.
     * @returns {Array<{start: number, end: number, duration: number}>}
     */
    get gaps() {
        const result = [];
        for (let i = 0; i < this.segments.length - 1; i++) {
            const gapStart = this.segments[i].end;
            const gapEnd = this.segments[i + 1].start;
            if (gapEnd > gapStart) {
                result.push({ start: gapStart, end: gapEnd, duration: gapEnd - gapStart });
            }
        }
        return result;
    }

    /**
     * The largest gap between segments, or null if there are no gaps.
     * For a split shift, this gap is treated as the unpaid period between shifts.
     */
    get largestGap() {
        const gaps = this.gaps;
        return gaps.length ? gaps.reduce((max, g) => g.duration > max.duration ? g : max) : null;
    }

    /**
     * The department and job of the first chronological segment.
     * Used as the "primary" department for coverage optimization.
     * @returns {{dept: string, job: string}}
     */
    primaryDept() {
        if (!this.segments.length) return { dept: '', job: '' };
        return { dept: this.segments[0].dept, job: this.segments[0].job };
    }

    /**
     * Returns true if the employee is working at the given time
     * (i.e., it falls within any segment).
     * @param {number} time - Time in minutes since midnight
     */
    isWorkingAt(time) {
        return this.segments.some(s => time >= s.start && time < s.end);
    }

    /**
     * Returns true if a break of the given duration can be placed starting at `time`
     * without the break overlapping a gap or falling outside any segment.
     * @param {number} time - Proposed break start in minutes since midnight
     * @param {number} duration - Break duration in minutes
     */
    isValidBreakWindow(time, duration) {
        const breakEnd = time + duration;
        // The break must end strictly before the segment boundary — a break that ends
        // exactly at the segment end would return the employee into unpaid gap time.
        return this.segments.some(s => time >= s.start && breakEnd < s.end);
    }

    /**
     * For a split shift employee, determine whether the split gap itself counts as the
     * meal period. The gap must be >= 30 minutes and occur within the first 5 hours of work.
     *
     * If true, no additional meal break should be scheduled unless the employee works
     * > 9:45 of total time (i.e., they need a second meal period).
     */
    gapSatisfiesMealPeriod() {
        if (!this.isSplitShift) return false;
        const lg = this.largestGap;
        return lg !== null && lg.duration >= 30;
    }

    /**
     * Determine how many meal periods are legally required.
     * Accounts for split shifts where the gap itself satisfies the first meal period.
     *
     * California law (IWC Wage Orders):
     * - >= 5 hours worked (300 min): 1 meal period
     * - >= 10 hours worked (600 min): 2 meal periods
     */
    mealsRequired() {
        const work = this.totalWorkMinutes;
        let required = 0;
        if (work >= 300) required = 1;
        if (work >= 600) required = 2;

        // If the split gap satisfies the first meal, reduce required by 1
        // (but still need the second meal if totalWork > 9:45)
        if (this.gapSatisfiesMealPeriod() && required >= 1) {
            required -= 1;
        }

        return required;
    }

    /**
     * Determine how many rest breaks are legally required.
     *
     * California law — rest breaks based on total hours WORKED (excluding meal breaks):
     * - >= 3:30 (210 min): 1 rest break
     * - >= 5:00 (300 min): 2 rest breaks  (one on each side of the meal period)
     * - >= 10:00 (600 min): 3 rest breaks
     *
     * Meal periods (paid or unpaid) are excluded from hours worked for this calculation.
     * A 6-hour shift with a 30-minute meal yields 330 min of effective work, which exceeds
     * the 300-minute threshold and therefore requires 2 rest breaks.
     * @param {number} scheduledMealMinutes - Total minutes of scheduled meal breaks
     */
    restBreaksRequired(scheduledMealMinutes = 0) {
        const hoursWorked = this.totalWorkMinutes - scheduledMealMinutes;
        if (hoursWorked >= 600) return 3;
        if (hoursWorked >= 300) return 2;
        if (hoursWorked >= 210) return 1;
        return 0;
    }

    /**
     * Find the segment that contains a given time.
     * Returns the segment object or null.
     */
    segmentAt(time) {
        return this.segments.find(s => time >= s.start && time < s.end) || null;
    }
}
