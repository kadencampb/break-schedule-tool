import { DEFAULT_GROUPS, DEFAULT_ADVANCED_SETTINGS, DEFAULT_OPERATING_HOURS, MAX_WORK_BEFORE_MEAL } from './constants.js';
import { formatName, parseShiftInterval, findGroupContaining } from './helpers.js';
import { minutesToTime } from './helpers.js';
import { EmployeeSchedule } from './EmployeeSchedule.js';
import { calculateCoverageMap, getCoworkersAtTime } from './coverage.js';
import { findOptimalBreakTime } from './optimizer.js';

/**
 * Parse raw schedule rows into a Map of name → EmployeeSchedule.
 *
 * @param {Array<Array>} rows - Raw schedule rows (array of arrays)
 * @param {number} dataStart - Row index where employee data begins
 * @param {number} shiftCol - Column index containing the shift time string
 * @returns {Map<string, EmployeeSchedule>}
 */
function parseScheduleRows(rows, dataStart, shiftCol) {
    const schedules = new Map();
    let currentDept = '';

    for (let i = dataStart; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;

        // Department header row: col A has content, col C does not
        if (row[0] && !row[2]) {
            currentDept = String(row[0]).trim();
            continue;
        }

        // Employee row: col C has a name; col B is the per-employee subdept/job.
        if (!row[2]) continue;

        const job = row[1] ? String(row[1]).trim() : '';
        const name = formatName(String(row[2]));
        const shiftStr = row[shiftCol] ? String(row[shiftCol]) : '';
        const [start, end] = parseShiftInterval(shiftStr);

        // Skip rows with invalid shift data
        if (start === 0 && end === 0) continue;

        if (!schedules.has(name)) {
            schedules.set(name, new EmployeeSchedule(name));
        }
        schedules.get(name).addSegment(currentDept, job, start, end, i);
    }

    return schedules;
}

/**
 * Returns the scheduling flexibility window (in minutes) for an employee's first meal.
 * Smaller = less flexible = should be scheduled first.
 */
function mealWindowSize(empSchedule) {
    const MEAL_DURATION = 30;
    const mealsNeeded = empSchedule.mealsRequired();
    if (mealsNeeded === 0) return Infinity;
    const netWork = empSchedule.totalWorkMinutes - mealsNeeded * MEAL_DURATION;
    const latest  = empSchedule.workedTimeToClockTime(Math.min(MAX_WORK_BEFORE_MEAL, netWork))
        ?? (empSchedule.overallStart + MAX_WORK_BEFORE_MEAL);
    const earliest = empSchedule.workedTimeToClockTime(Math.max(0, netWork - mealsNeeded * MAX_WORK_BEFORE_MEAL))
        ?? empSchedule.overallStart;
    return latest - earliest;
}

/**
 * Schedule all breaks for the day.
 *
 * Returns a named-slot break structure:
 * ```
 * breaks[name] = { rest1: number|null, meal: number|null, rest2: number|null, rest3: number|null }
 * ```
 *
 * @param {Array<Array>} schedule - Raw schedule rows (from XLSX parser)
 * @param {Object} options
 * @param {Object}  options.operatingHours  - { startTime, endTime } in minutes
 * @param {Array}   options.groups          - Coverage group definitions
 * @param {Object}  options.advancedSettings
 * @param {boolean} options.enableLogging
 * @param {number}  options.dataStart       - Row index where employee data begins
 * @param {number}  options.shiftColumnIndex
 * @returns {{ breaks: Object, segments: Array, employeeSchedules: Map }}
 */
export function scheduleBreaks(schedule, options = {}) {
    const operatingHours = options.operatingHours || DEFAULT_OPERATING_HOURS;
    const groups         = options.groups          || DEFAULT_GROUPS;
    const advSettings    = options.advancedSettings || DEFAULT_ADVANCED_SETTINGS;
    const enableLogging  = options.enableLogging !== false;
    const dataStart      = options.dataStart      ?? 7;
    const shiftCol       = options.shiftColumnIndex ?? 3;

    const log = enableLogging ? (...args) => console.log(...args) : () => {}; // eslint-disable-line no-console

    // --- Parse rows into EmployeeSchedule objects ---
    const employeeSchedules = parseScheduleRows(schedule, dataStart, shiftCol);

    // Coverage window: cover the union of all employee shifts AND the user's
    // operating hours. The operating-hours setting describes when the store is
    // open (a UI concept), but staff often start earlier (stocking) or stay later
    // (closing) — limiting coverage to operating hours leaves those candidates
    // tied at zero, which collapses the optimizer to "everyone at the ideal time."
    let earliestSegment = Infinity;
    let latestSegment   = -Infinity;
    for (const empSchedule of employeeSchedules.values()) {
        for (const seg of empSchedule.segments) {
            if (seg.start < earliestSegment) earliestSegment = seg.start;
            if (seg.end   > latestSegment)   latestSegment   = seg.end;
        }
    }
    const startOfDay = Number.isFinite(earliestSegment)
        ? Math.min(earliestSegment, operatingHours.startTime)
        : operatingHours.startTime;
    const endOfDay = Number.isFinite(latestSegment)
        ? Math.max(latestSegment, operatingHours.endTime)
        : operatingHours.endTime;

    // Build ordered list of names (schedule order for deterministic break assignment)
    const employeeOrder = [];
    const seen = new Set();
    for (let i = dataStart; i < schedule.length; i++) {
        const row = schedule[i];
        if (!row || !row[2]) continue;
        const name = formatName(String(row[2]));
        if (!seen.has(name) && employeeSchedules.has(name)) {
            seen.add(name);
            employeeOrder.push(name);
        }
    }

    // Initialize empty break objects for every employee
    const breaks = {};
    for (const name of employeeOrder) {
        breaks[name] = { rest1: null, meal: null, rest2: null, rest3: null };
    }

    // =========================================================
    // STEP 1: MEAL PERIODS
    // =========================================================
    //
    // Meal timing is dynamic — derived from the CA DLSE 4h45m constraint rather than
    // a fixed wall-clock offset. The window for each meal is:
    //
    //   earliest start = workedTimeToClockTime(max(0, netWork - (N-k+1) * MAX_WORK_BEFORE_MEAL))
    //                    + (k-1) * MEAL_DURATION
    //   latest start   = workedTimeToClockTime(min(k * MAX_WORK_BEFORE_MEAL, netWork))
    //                    + (k-1) * MEAL_DURATION
    //
    // where k = meal index (1-based), N = total meals needed, netWork = totalWorkMinutes - N * 30.
    //
    // Ideal is the LATEST valid start — this minimizes the risk of a post-meal violation
    // for shifts approaching the next meal threshold (e.g., an 8.5h shift approaching 10h).

    // Schedule meals in ascending window-size order: employees with the least scheduling
    // flexibility (approaching 10h, single valid slot) are locked in first. Employees
    // with more room can then adjust around them for better coverage staggering.
    const mealOrder = employeeOrder
        .filter(n => employeeSchedules.get(n).mealsRequired() > 0)
        .sort((a, b) => mealWindowSize(employeeSchedules.get(a)) - mealWindowSize(employeeSchedules.get(b)));

    const idealMealOffset = advSettings.idealMealOffset ?? DEFAULT_ADVANCED_SETTINGS.idealMealOffset;

    for (const name of mealOrder) {
        const empSchedule = employeeSchedules.get(name);
        const mealsNeeded = empSchedule.mealsRequired();

        const { dept, job: subdept } = empSchedule.primaryDept();
        const group = findGroupContaining(dept, subdept, groups);

        const MEAL_DURATION = 30;
        // Net worked time = total segment minutes minus all expected meal periods
        const netWork = empSchedule.totalWorkMinutes - mealsNeeded * MEAL_DURATION;

        // --- First meal (k=1) ---
        const meal1Latest = (empSchedule.workedTimeToClockTime(
            Math.min(MAX_WORK_BEFORE_MEAL, netWork)
        ) ?? (empSchedule.overallStart + MAX_WORK_BEFORE_MEAL));

        const meal1Earliest = (empSchedule.workedTimeToClockTime(
            Math.max(0, netWork - mealsNeeded * MAX_WORK_BEFORE_MEAL)
        ) ?? empSchedule.overallStart);

        // Preferred = idealMealOffset worked min from clock-in, clamped to the legal
        // window [meal1Earliest, meal1Latest]. For shifts approaching 10h, the legal
        // window collapses toward 4h45m and the clamp pushes the preference back.
        // The optimizer is allowed to move earlier within the legal window for
        // coverage staggering, but never past the latest safe slot.
        const meal1Preferred = (empSchedule.workedTimeToClockTime(
            Math.min(idealMealOffset, netWork)
        ) ?? (empSchedule.overallStart + idealMealOffset));
        const idealMeal1 = Math.max(meal1Earliest, Math.min(meal1Latest, meal1Preferred));

        const meal1MaxEarly = Math.max(0, idealMeal1 - meal1Earliest);
        const meal1MaxDelay = Math.max(0, meal1Latest - idealMeal1);
        const mealAdvSettings = { ...advSettings, maxEarly: meal1MaxEarly, maxDelay: meal1MaxDelay };

        const { bestTime: meal1Time } = findOptimalBreakTime({
            empName: name, empSchedule,
            idealTime: idealMeal1,
            breakDuration: MEAL_DURATION,
            breakSlot: 'meal',
            dept, subdept, group, breaks,
            employeeSchedules, startOfDay, endOfDay,
            advSettings: mealAdvSettings, log
        });
        breaks[name].meal = meal1Time;

        if (meal1Time !== idealMeal1) {
            log(`[MEAL OPTIMIZE] ${name} (${subdept}): ${minutesToTime(idealMeal1)} → ${minutesToTime(meal1Time)}`);
        }

        // --- Second meal (k=2) for shifts >= 10h ---
        if (mealsNeeded >= 2) {
            const meal2Latest = (empSchedule.workedTimeToClockTime(
                Math.min(2 * MAX_WORK_BEFORE_MEAL, netWork)
            ) ?? (empSchedule.overallStart + 2 * MAX_WORK_BEFORE_MEAL)) + MEAL_DURATION;

            const meal2Earliest = (empSchedule.workedTimeToClockTime(
                Math.max(0, netWork - MAX_WORK_BEFORE_MEAL)
            ) ?? empSchedule.overallStart) + MEAL_DURATION;

            // Preferred placement: idealMealOffset of additional worked time after the
            // first meal, i.e., 2 * idealMealOffset worked min from clock-in.
            const meal2Preferred = (empSchedule.workedTimeToClockTime(
                Math.min(2 * idealMealOffset, netWork)
            ) ?? (empSchedule.overallStart + 2 * idealMealOffset)) + MEAL_DURATION;
            const idealMeal2 = Math.max(meal2Earliest, Math.min(meal2Latest, meal2Preferred));

            breaks[name].rest3 = null; // reset — rest3 slot used below for third rest break
            empSchedule._secondMealTime = idealMeal2;
            empSchedule._secondMealMaxEarly = Math.max(0, idealMeal2 - meal2Earliest);
        }
    }

    // =========================================================
    // STEP 2: REST BREAKS
    // =========================================================
    //
    // Ideal rest break times are the 2-hour midpoints of each 4-hour worked period,
    // computed in NET WORKED TIME (pausing during meal periods and natural shift gaps).
    //
    //   Break n ideal: midpoint of the nth 4-hour work period (or major fraction)
    //   computed in net worked time, then mapped to clock time via workedTimeToClockTime.
    //
    // workedTimeToClockTime already handles natural gaps (split shifts). For SCHEDULED
    // meals (continuous shifts), the raw time is shifted forward by 30 min for each
    // scheduled meal that falls before the computed ideal.

    for (const name of employeeOrder) {
        const empSchedule = employeeSchedules.get(name);
        const restCount = empSchedule.restBreaksRequired();

        if (restCount === 0) continue;

        const { dept, job: subdept } = empSchedule.primaryDept();
        const group = findGroupContaining(dept, subdept, groups);

        // Collect scheduled meal start times (in clock time) for the adjustment step
        const scheduledMeals = [
            breaks[name].meal,
            empSchedule._secondMealTime ?? null
        ].filter(t => t != null).sort((a, b) => a - b);

        for (let k = 1; k <= restCount; k++) {
            const idealRest = computeIdealRestClock(k, empSchedule, scheduledMeals);
            breaks[name][`rest${k}`] = scheduleRestBreak(
                name, empSchedule, idealRest, `rest${k}`,
                dept, subdept, group, breaks, employeeSchedules,
                startOfDay, endOfDay, advSettings, log
            );
        }
    }

    // Resolve second meal periods (placed after rest breaks to avoid slot conflicts)
    for (const name of employeeOrder) {
        const empSchedule = employeeSchedules.get(name);
        if (empSchedule._secondMealTime != null) {
            // Store the second meal in rest3 slot (only one of rest3 or second meal is needed,
            // since rest3 only applies to shifts ≥ 10 hours worked, and second meal only applies
            // to shifts > 9:45 — they coexist only for 10+ hour shifts, handled explicitly here)
            if (breaks[name].rest3 == null) {
                breaks[name].rest3 = empSchedule._secondMealTime;
            }
            delete empSchedule._secondMealTime;
        }
    }

    // =========================================================
    // STEP 3: SWAP BREAKS TO PRESERVE SCHEDULE ORDER
    // =========================================================

    swapBreaksForScheduleOrder(employeeOrder, employeeSchedules, breaks, groups, startOfDay, endOfDay, log);

    // =========================================================
    // BUILD SEGMENTS FOR WRITE-BACK
    // =========================================================

    const segments = [];
    for (const name of employeeOrder) {
        const empSchedule = employeeSchedules.get(name);
        for (const seg of empSchedule.segments) {
            segments.push({
                name,
                dept: seg.dept,
                job: seg.job,
                start: seg.start,
                end: seg.end,
                rowIndex: seg.rowIndex
            });
        }
    }

    log('Break scheduling complete.');

    return { breaks, segments, employeeSchedules };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scheduleRestBreak(
    name, empSchedule, idealTime, slot,
    dept, subdept, group, breaks, employeeSchedules,
    startOfDay, endOfDay, advSettings, log
) {
    if (!group) {
        // No optimization: clamp to the nearest valid segment window
        return empSchedule.isValidBreakWindow(idealTime, 15)
            ? idealTime
            : findNearestValidWindow(empSchedule, idealTime, 15);
    }

    const { bestTime } = findOptimalBreakTime({
        empName: name,
        empSchedule,
        idealTime,
        breakDuration: 15,
        breakSlot: slot,
        dept, subdept, group, breaks,
        employeeSchedules,
        startOfDay, endOfDay,
        advSettings, log
    });
    return bestTime;
}

function findNearestValidWindow(empSchedule, idealTime, duration) {
    // Try offsets in both directions
    for (let offset = 0; offset <= 60; offset += 15) {
        if (empSchedule.isValidBreakWindow(idealTime + offset, duration)) return idealTime + offset;
        if (offset > 0 && empSchedule.isValidBreakWindow(idealTime - offset, duration)) return idealTime - offset;
    }
    // Fallback: start of first segment
    return empSchedule.segments[0]?.start ?? idealTime;
}

/**
 * Post-processing pass: for employees in the same dept/subdept,
 * swap break times that are out of schedule order, as long as coverage remains identical.
 * This produces a more readable schedule where earlier-listed employees get earlier breaks.
 */
function swapBreaksForScheduleOrder(
    employeeOrder, employeeSchedules, breaks, groups, startOfDay, endOfDay, log
) {
    // Group employees by dept|job
    const byDept = {};
    for (const name of employeeOrder) {
        const empSchedule = employeeSchedules.get(name);
        const { dept, job } = empSchedule.primaryDept();
        const key = `${dept}|${job}`;
        if (!byDept[key]) byDept[key] = [];
        byDept[key].push(name);
    }

    for (const [key, employees] of Object.entries(byDept)) {
        const [dept, subdept] = key.split('|');
        const group = findGroupContaining(dept, subdept, groups);
        if (!group) continue;

        for (const slot of ['rest1', 'rest2']) {
            for (let i = 0; i < employees.length; i++) {
                for (let j = i + 1; j < employees.length; j++) {
                    const empA = employees[i];
                    const empB = employees[j];

                    const timeA = breaks[empA]?.[slot];
                    const timeB = breaks[empB]?.[slot];
                    if (timeA == null || timeB == null || timeA <= timeB) continue;

                    const schedA = employeeSchedules.get(empA);
                    const schedB = employeeSchedules.get(empB);

                    // Verify the swapped times are valid for both employees
                    if (!schedA.isValidBreakWindow(timeB, 15)) continue;
                    if (!schedB.isValidBreakWindow(timeA, 15)) continue;

                    // Verify coverage doesn't degrade after the swap
                    const original = deepCloneBreaksObj(breaks);
                    breaks[empA][slot] = timeB;
                    breaks[empB][slot] = timeA;

                    const covBefore = calculateCoverageMap(employeeSchedules, original, startOfDay, endOfDay);
                    const covAfter  = calculateCoverageMap(employeeSchedules, breaks,   startOfDay, endOfDay);

                    let identical = true;
                    for (let t = startOfDay; t <= endOfDay; t += 15) {
                        const before = getCoworkersAtTime(covBefore, t, dept, subdept, groups).length;
                        const after  = getCoworkersAtTime(covAfter,  t, dept, subdept, groups).length;
                        if (before !== after) { identical = false; break; }
                    }

                    if (identical) {
                        log(`[SWAP] ${empA} ↔ ${empB} (${subdept}): ${slot} swapped (${minutesToTime(timeA)} ↔ ${minutesToTime(timeB)})`);
                    } else {
                        // Revert
                        breaks[empA][slot] = timeA;
                        breaks[empB][slot] = timeB;
                    }
                }
            }
        }
    }
}

function deepCloneBreaksObj(breaks) {
    const clone = {};
    for (const [name, slots] of Object.entries(breaks)) {
        clone[name] = { ...slots };
    }
    return clone;
}

/**
 * Shift a raw worked-time clock time forward by 30 minutes for each scheduled meal
 * that starts before it. This accounts for the fact that workedTimeToClockTime maps
 * net worked minutes to clock time based on the original segments (ignoring scheduled
 * meals). For each meal that interrupts the worked-time timeline before the target
 * point, the actual clock time is 30 minutes later than the raw mapping suggests.
 *
 * Natural shift gaps are already handled by workedTimeToClockTime directly (it skips
 * them). Only SCHEDULED meals (placed by Step 1) require this correction.
 *
 * @param {number} rawTime - Clock time from workedTimeToClockTime
 * @param {number[]} mealStarts - Scheduled meal start times in ascending order
 * @returns {number} Adjusted clock time
 */
function adjustForMeals(rawTime, mealStarts) {
    let t = rawTime;
    for (const mealStart of mealStarts) {
        if (t >= mealStart) t += 30;
    }
    return t;
}

/**
 * Compute the ideal clock time for rest break number `periodIndex` (1-based) using
 * a per-work-period footprint algorithm.
 *
 * Each rest break belongs to a 4-hour work period (or the final major fraction).
 * The break is placed at the midpoint of that period in worked time — but for split
 * shifts where the worked-time midpoint falls in a gap (the period spans across the
 * unpaid split), we instead pick the segment-portion with the largest footprint
 * within the period and place the break at the midpoint of that footprint. On ties,
 * the later piece wins.
 *
 * Examples (assume 8AM clock-in, no scheduled meals):
 *   8h continuous → P1 mid in seg → 10AM. P2 mid in seg → 2PM.
 *   6h split 3h+3h → P1 mid (120 worked) maps to 10AM (in seg1) → 10AM.
 *   2h+4h split → P1 mid (120 worked) hits end of seg1 (gap). Footprint pieces:
 *                 seg1 entirely (120 min) and first half of seg2 (120 min). Tie →
 *                 later wins → midpoint of [2PM,4PM] = 3PM.
 *   1h+5h split → P1 mid (120 worked) maps to 3PM (in seg2) → 3PM.
 *
 * @param {number} periodIndex - 1-based rest break number
 * @param {EmployeeSchedule} empSchedule
 * @param {number[]} scheduledMeals - Sorted scheduled meal start times (clock time)
 * @returns {number} Ideal clock time for the break, rounded to the 15-min grid
 */
function computeIdealRestClock(periodIndex, empSchedule, scheduledMeals) {
    const totalWork = empSchedule.totalWorkMinutes;
    const periodStart = (periodIndex - 1) * 240;
    const periodEnd = Math.min(periodIndex * 240, totalWork);
    if (periodEnd <= periodStart) return empSchedule.overallStart;

    // Primary: use the period's worked-time midpoint when it lands inside a real
    // worked segment. This preserves the prior algorithm for continuous shifts and
    // continuous shifts with mid-shift meal gaps.
    const workedMid = (periodStart + periodEnd) / 2;
    const rawMid = empSchedule.workedTimeToClockTime(workedMid);
    if (rawMid != null) {
        const adjusted = adjustForMeals(rawMid, scheduledMeals);
        if (empSchedule.isWorkingAt(adjusted)) {
            return Math.round(adjusted / 15) * 15;
        }
    }

    // Fallback: the worked-time midpoint sits in a split-shift gap. Choose the
    // segment-portion with the largest footprint inside this period, and place the
    // break at the midpoint of that footprint. On ties, the later piece wins.
    const pieces = [];
    let accumulated = 0;
    for (const seg of empSchedule.segments) {
        const segDuration = seg.end - seg.start;
        const segWorkedStart = accumulated;
        accumulated += segDuration;
        const overlapStart = Math.max(periodStart, segWorkedStart);
        const overlapEnd = Math.min(periodEnd, accumulated);
        if (overlapEnd > overlapStart) {
            pieces.push({
                length: overlapEnd - overlapStart,
                workedMid: (overlapStart + overlapEnd) / 2,
                segStart: seg.start,
                segWorkedStart
            });
        }
    }
    if (pieces.length === 0) return empSchedule.overallStart + periodStart;

    let best = pieces[0];
    for (let i = 1; i < pieces.length; i++) {
        if (pieces[i].length >= best.length) best = pieces[i];
    }
    const raw = best.segStart + (best.workedMid - best.segWorkedStart);
    return Math.round(adjustForMeals(raw, scheduledMeals) / 15) * 15;
}
