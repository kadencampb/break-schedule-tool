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
        // Both boundaries are strict: the break must not start at the segment boundary
        // (employee would clock in and immediately go on break) and must not end at the
        // segment boundary (employee would go from break directly to clock-out). Either
        // condition means the employee cannot take a genuine off-duty rest period
        // adjacent to a shift transition (Augustus v. ABM Security, 2016).
        return this.segments.some(s => time > s.start && breakEnd < s.end);
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
     * Strict CA DLSE formula: one paid 10-minute rest per 4-hour work period or
     * major fraction thereof. "Major fraction" = strictly more than 2 hours (120 min).
     * No break required if total scheduled time is less than 3.5 hours (210 min).
     *
     * Rest breaks are paid and count as time worked, so no meal deduction is applied.
     * Uses total segment minutes (sum of all shift segments).
     *
     * Examples:
     *   3h  (180 min) → 0   (below 3.5h threshold)
     *   3.5h (210 min) → 1   (major fraction of first 4h period)
     *   6h  (360 min) → 1   (1 full period + 2h remainder, NOT > 2h)
     *   6h1m (361 min) → 2   (1 full period + 121 min remainder > 120)
     *   8h  (480 min) → 2   (2 full periods)
     *   11h (660 min) → 3   (2 full periods + 3h remainder > 2h)
     */
    restBreaksRequired() {
        const total = this.totalWorkMinutes;
        if (total < 210) return 0;
        return Math.floor(total / 240) + (total % 240 > 120 ? 1 : 0);
    }

    /**
     * Map a net worked-time offset to a wall clock time.
     *
     * Walks segments in chronological order, accumulating worked minutes.
     * Gaps between segments are unpaid and not counted. Returns the clock time
     * at which `targetWorkedMin` minutes of work have been completed.
     *
     * Used to find the ideal rest break time: break n should fall at
     * (n * 240 - 120) net worked minutes from clock-in (midpoint of nth 4h period).
     *
     * @param {number} targetWorkedMin - Net worked minutes to reach
     * @returns {number|null} Wall clock time in minutes since midnight, or null if
     *   target exceeds totalWorkMinutes
     *
     * @example
     * // 10AM-2:45PM (285 min) + 3:15PM-6:30PM (195 min), target = 360 min
     * // Segment 1: accumulated 0+285=285 < 360. accumulated = 285.
     * // Segment 2 starts at 3:15PM (195 min). Need 75 more → 3:15PM + 75 = 4:30PM.
     */
    workedTimeToClockTime(targetWorkedMin) {
        if (targetWorkedMin > this.totalWorkMinutes) return null;
        let accumulated = 0;
        for (const seg of this.segments) {
            const segDuration = seg.end - seg.start;
            if (accumulated + segDuration >= targetWorkedMin) {
                return seg.start + (targetWorkedMin - accumulated);
            }
            accumulated += segDuration;
        }
        return null;
    }

    /**
     * Find the segment that contains a given time.
     * Returns the segment object or null.
     */
    segmentAt(time) {
        return this.segments.find(s => time >= s.start && time < s.end) || null;
    }
}
