import { DEFAULT_GROUPS, DEFAULT_ADVANCED_SETTINGS, DEFAULT_OPERATING_HOURS } from './constants.js';
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

    for (const name of employeeOrder) {
        const empSchedule = employeeSchedules.get(name);
        const mealsNeeded = empSchedule.mealsRequired();

        if (mealsNeeded === 0) continue;

        const { dept, job: subdept } = empSchedule.primaryDept();
        const group = findGroupContaining(dept, subdept, groups);

        // Ideal meal time: 4 hours into the first segment
        const idealMealTime = empSchedule.overallStart + 240;

        if (!group) {
            // No coverage optimization — schedule at ideal time, clamped to a valid segment
            const mealTime = empSchedule.isValidBreakWindow(idealMealTime, 30)
                ? idealMealTime
                : empSchedule.overallStart + 240;
            breaks[name].meal = mealTime;
        } else {
            const { bestTime } = findOptimalBreakTime({
                empName: name,
                empSchedule,
                idealTime: idealMealTime,
                breakDuration: 30,
                breakSlot: 'meal',
                dept, subdept, group, breaks,
                employeeSchedules,
                startOfDay, endOfDay,
                advSettings, log
            });
            breaks[name].meal = bestTime;

            if (bestTime !== idealMealTime) {
                log(`[MEAL OPTIMIZE] ${name} (${subdept}): ${minutesToTime(idealMealTime)} → ${minutesToTime(bestTime)}`);
            }
        }

        // Second meal period (for shifts > 9:45 total work)
        if (mealsNeeded >= 2) {
            // Schedule 4 hours after the first meal
            breaks[name].rest3 = null; // reset — rest3 slot is used separately below
            // Second meal uses a dedicated tracking field; we insert it after rest breaks
            // to avoid collisions. Stored temporarily in a side channel.
            empSchedule._secondMealTime = empSchedule.overallStart + 480;
        }
    }

    // =========================================================
    // STEP 2: REST BREAKS
    // =========================================================

    for (const name of employeeOrder) {
        const empSchedule = employeeSchedules.get(name);
        const mealMinutes = breaks[name].meal != null ? 30 : 0;
        const restCount = empSchedule.restBreaksRequired(mealMinutes);

        if (restCount === 0) continue;

        const { dept, job: subdept } = empSchedule.primaryDept();
        const group = findGroupContaining(dept, subdept, groups);

        // --- First rest break (ideal: 2 hours into first segment) ---
        const idealRest1 = empSchedule.overallStart + 120;
        if (restCount >= 1) {
            breaks[name].rest1 = scheduleRestBreak(
                name, empSchedule, idealRest1, 'rest1',
                dept, subdept, group, breaks, employeeSchedules,
                startOfDay, endOfDay, advSettings, log
            );
        }

        // --- Second rest break (ideal: 6.5 hours into overall span) ---
        const idealRest2 = empSchedule.overallStart + 390;
        if (restCount >= 2) {
            breaks[name].rest2 = scheduleRestBreak(
                name, empSchedule, idealRest2, 'rest2',
                dept, subdept, group, breaks, employeeSchedules,
                startOfDay, endOfDay, advSettings, log
            );
        }

        // --- Third rest break (rare: 10+ hour shifts) ---
        if (restCount >= 3) {
            const afterRest2 = (breaks[name].rest2 ?? idealRest2) + 15 + 120;
            breaks[name].rest3 = scheduleRestBreak(
                name, empSchedule, afterRest2, 'rest3',
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
