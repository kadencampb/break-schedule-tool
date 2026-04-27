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
    let currentJob = '';

    for (let i = dataStart; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;

        // Department header row: col A has content, col C does not
        if (row[0] && !row[2]) {
            currentDept = String(row[0]).trim();
            currentJob = row[1] ? String(row[1]).trim() : '';
            continue;
        }

        // Employee row: col C has a name
        if (!row[2]) continue;

        const name = formatName(String(row[2]));
        const shiftStr = row[shiftCol] ? String(row[shiftCol]) : '';
        const [start, end] = parseShiftInterval(shiftStr);

        // Skip rows with invalid shift data
        if (start === 0 && end === 0) continue;

        if (!schedules.has(name)) {
            schedules.set(name, new EmployeeSchedule(name));
        }
        schedules.get(name).addSegment(currentDept, currentJob, start, end, i);
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

    const { startOfDay, endOfDay } = { startOfDay: operatingHours.startTime, endOfDay: operatingHours.endTime };
    const log = enableLogging ? (...args) => console.log(...args) : () => {}; // eslint-disable-line no-console

    // --- Parse rows into EmployeeSchedule objects ---
    const employeeSchedules = parseScheduleRows(schedule, dataStart, shiftCol);

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

        // Ideal = latest: delay as long as possible to minimize post-meal violation risk.
        // maxDelay = 0 so the optimizer never goes past the latest safe slot.
        // The optimizer always runs (even without a coverage group) so dept-level
        // staggering applies — employees sharing a dept won't all take meals at once.
        const idealMeal1 = meal1Latest;
        const meal1MaxEarly = Math.max(0, meal1Latest - meal1Earliest);
        const mealAdvSettings = { ...advSettings, maxEarly: meal1MaxEarly, maxDelay: 0 };

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

            breaks[name].rest3 = null; // reset — rest3 slot used below for third rest break
            empSchedule._secondMealTime = meal2Latest; // ideal = latest safe slot
            empSchedule._secondMealMaxEarly = Math.max(0, meal2Latest - meal2Earliest);
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

        const w1 = idealRestWorkedTime(1, empSchedule.totalWorkMinutes);
        const idealRest1 = resolveIdealRestClock(w1, empSchedule, scheduledMeals);
        if (restCount >= 1) {
            breaks[name].rest1 = scheduleRestBreak(
                name, empSchedule, idealRest1, 'rest1',
                dept, subdept, group, breaks, employeeSchedules,
                startOfDay, endOfDay, advSettings, log
            );
        }

        const w2 = idealRestWorkedTime(2, empSchedule.totalWorkMinutes);
        const idealRest2 = resolveIdealRestClock(w2, empSchedule, scheduledMeals);
        if (restCount >= 2) {
            breaks[name].rest2 = scheduleRestBreak(
                name, empSchedule, idealRest2, 'rest2',
                dept, subdept, group, breaks, employeeSchedules,
                startOfDay, endOfDay, advSettings, log
            );
        }

        const w3 = idealRestWorkedTime(3, empSchedule.totalWorkMinutes);
        const idealRest3 = resolveIdealRestClock(w3, empSchedule, scheduledMeals);
        if (restCount >= 3) {
            breaks[name].rest3 = scheduleRestBreak(
                name, empSchedule, idealRest3, 'rest3',
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
 * Compute the ideal worked-time offset (in minutes from shift start) for rest break
 * number `periodIndex` (1-based).
 *
 * Each 4-hour work period has its rest break at the MIDPOINT of that period. For a
 * full 4-hour period this is 2h (120 min) in. For a partial final period (a "major
 * fraction" of 4 hours, i.e., > 2h), this is the midpoint of that shorter window.
 *
 * Examples:
 *   8h shift (480 min): period 1 midpoint = 120, period 2 midpoint = 240+120 = 360
 *   6h01m shift (361 min): period 1 midpoint = 120, period 2 midpoint = 240+60.5 ≈ 300
 *   11h shift (660 min): period 1 = 120, period 2 = 360, period 3 = 480+90 = 570
 *
 * Result is rounded to the nearest 15-minute interval (optimizer step size).
 *
 * @param {number} periodIndex - 1-based rest break number
 * @param {number} totalWorkMinutes - Total scheduled segment time (not deducting meals)
 * @returns {number} Ideal worked-time offset in minutes
 */
function idealRestWorkedTime(periodIndex, totalWorkMinutes) {
    const periodStart = (periodIndex - 1) * 240;
    const periodLength = Math.min(240, totalWorkMinutes - periodStart);
    const midpoint = periodStart + periodLength / 2;
    return Math.round(midpoint / 15) * 15;
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
 * Resolve the ideal rest break clock time from a worked-time offset.
 *
 * After mapping worked minutes to clock time and adjusting past scheduled meals,
 * checks whether the result falls within an actual worked segment. If not (the ideal
 * landed in a gap — e.g., a short first segment whose midpoint sits exactly at its
 * end), re-anchors to the midpoint of the next segment. This matches the CA DLSE
 * intent: the break belongs to whichever work period can actually accommodate it.
 *
 * Example: 2h + 4h split, break 1 ideal = 120 worked min = end of segment 1 (gap).
 * Re-anchors to midpoint of segment 2 → 2h into the 4h segment.
 *
 * @param {number} workedMin - Net worked-time offset for this break
 * @param {EmployeeSchedule} empSchedule
 * @param {number[]} scheduledMeals - Sorted scheduled meal start times (clock time)
 * @returns {number} Ideal clock time for the break
 */
function resolveIdealRestClock(workedMin, empSchedule, scheduledMeals) {
    const rawClock = empSchedule.workedTimeToClockTime(workedMin) ?? (empSchedule.overallStart + workedMin);
    const adjusted = adjustForMeals(rawClock, scheduledMeals);
    if (!empSchedule.isWorkingAt(adjusted)) {
        // Break was owed at this worked-time mark but the employee clocked out before it
        // could be taken. When they return, the break is overdue — place it as soon as
        // practicable: 15 min into the next segment (minimum non-boundary slot).
        const nextSeg = empSchedule.segments.find(s => s.start > adjusted);
        if (nextSeg) {
            return nextSeg.start + 15;
        }
    }
    return adjusted;
}
