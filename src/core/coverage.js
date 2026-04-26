import { findGroupContaining } from './helpers.js';

/**
 * Build a coverage map for every 15-minute interval during operating hours.
 *
 * @param {Map<string, EmployeeSchedule>} employeeSchedules - Map of name → EmployeeSchedule
 * @param {Object} breaks - Break assignments: { [name]: { rest1, meal, rest2, rest3 } }
 * @param {number} startOfDay - Operating hours start in minutes since midnight
 * @param {number} endOfDay - Operating hours end in minutes since midnight
 * @returns {Object} Map of time (minutes) → Array of { name, dept, subdept }
 */
export function calculateCoverageMap(employeeSchedules, breaks, startOfDay, endOfDay) {
    const coverage = {};

    for (let time = startOfDay; time < endOfDay; time += 15) {
        coverage[time] = [];
    }

    for (const [name, empSchedule] of employeeSchedules) {
        const empBreaks = breaks[name] || {};

        const breakWindows = buildBreakWindows(empBreaks);

        for (let time = startOfDay; time < endOfDay; time += 15) {
            if (!empSchedule.isWorkingAt(time)) continue;

            const onBreak = breakWindows.some(([bStart, bEnd]) => time < bEnd && time + 15 > bStart);
            if (!onBreak) {
                const { dept, job } = empSchedule.primaryDept();
                coverage[time].push({ name, dept, subdept: job });
            }
        }
    }

    return coverage;
}

/**
 * Convert a named break object into an array of [start, end] windows.
 * @param {{ rest1?: number, meal?: number, rest2?: number, rest3?: number }} empBreaks
 * @returns {Array<[number, number]>}
 */
function buildBreakWindows(empBreaks) {
    const windows = [];
    if (empBreaks.rest1 != null) windows.push([empBreaks.rest1, empBreaks.rest1 + 15]);
    if (empBreaks.meal  != null) windows.push([empBreaks.meal,  empBreaks.meal  + 30]);
    if (empBreaks.rest2 != null) windows.push([empBreaks.rest2, empBreaks.rest2 + 15]);
    if (empBreaks.rest3 != null) windows.push([empBreaks.rest3, empBreaks.rest3 + 15]);
    return windows;
}

/**
 * Return all employees in the coverage map at a given time who belong to the same
 * coverage group as the given dept/subdept. Falls back to same dept/subdept only
 * if not in any group.
 *
 * @param {Object} coverage - Coverage map from calculateCoverageMap
 * @param {number} time - Time in minutes
 * @param {string} dept - Main department
 * @param {string} subdept - Sub-department
 * @param {Array} groups - Coverage group configuration
 * @returns {Array<{name, dept, subdept}>}
 */
export function getCoworkersAtTime(coverage, time, dept, subdept, groups) {
    const present = coverage[time];
    if (!present) return [];

    const group = findGroupContaining(dept, subdept, groups);
    if (group) {
        return present.filter(emp =>
            group.departments.some(d => d.main === emp.dept && d.sub === emp.subdept)
        );
    }
    return present.filter(emp => emp.dept === dept && emp.subdept === subdept);
}
