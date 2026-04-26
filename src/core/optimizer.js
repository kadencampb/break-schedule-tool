import { calculateCoverageMap } from './coverage.js';
import { minutesToTime, findGroupContaining } from './helpers.js';

/**
 * Find the optimal time for a break by scoring all candidate times for coverage impact.
 *
 * Strategy:
 * 1. Generate candidate times within [idealTime ± maxEarly/maxDelay]
 * 2. Filter to times where the break fits within an actual working segment
 * 3. Score each candidate: more coverage = better, closer to ideal = tie-breaker
 * 4. Return the highest-scoring time
 *
 * @param {Object} params
 * @param {string}               params.empName       - Employee name
 * @param {EmployeeSchedule}     params.empSchedule   - Full schedule for this employee
 * @param {number}               params.idealTime     - Ideal break start in minutes
 * @param {number}               params.breakDuration - 15 (rest) or 30 (meal)
 * @param {string}               params.breakSlot     - 'rest1' | 'meal' | 'rest2' | 'rest3'
 * @param {string}               params.dept          - Main department
 * @param {string}               params.subdept       - Sub-department
 * @param {Object|null}          params.group         - Coverage group or null
 * @param {Object}               params.breaks        - Current break assignments (all employees)
 * @param {Map}                  params.employeeSchedules - All EmployeeSchedule objects
 * @param {number}               params.startOfDay    - Operating hours start
 * @param {number}               params.endOfDay      - Operating hours end
 * @param {Object}               params.advSettings   - Advanced settings
 * @param {Function}             params.log           - Logging function
 * @returns {{ bestTime: number, bestScore: number }}
 */
export function findOptimalBreakTime(params) {
    const {
        empName, empSchedule, idealTime, breakDuration, breakSlot,
        dept, subdept, group, breaks, employeeSchedules,
        startOfDay, endOfDay, advSettings, log
    } = params;

    // Build candidate times: ideal + delays + early offsets
    const candidates = [idealTime];
    for (let delay = 15; delay <= advSettings.maxDelay; delay += 15) {
        candidates.push(idealTime + delay);
    }
    for (let early = 15; early <= advSettings.maxEarly; early += 15) {
        candidates.push(idealTime - early);
    }

    // Filter to times the employee is actually working and the break fits in a segment
    const validCandidates = candidates.filter(t => empSchedule.isValidBreakWindow(t, breakDuration));

    // If no valid candidate exists, fall back to the ideal time clamped to the shift
    if (validCandidates.length === 0) {
        const fallback = clampToSegment(empSchedule, idealTime, breakDuration);
        log(`  [FALLBACK] ${empName}: no valid window near ideal ${minutesToTime(idealTime)}, using ${minutesToTime(fallback)}`);
        return { bestTime: fallback, bestScore: -1 };
    }

    let bestTime = validCandidates[0];
    let bestScore = -Infinity;

    for (const testTime of validCandidates) {
        // Temporarily assign this break time and measure coverage
        const tempBreaks = deepCloneBreaks(breaks);
        if (!tempBreaks[empName]) tempBreaks[empName] = {};
        tempBreaks[empName][breakSlot] = testTime;

        const coverageMap = calculateCoverageMap(employeeSchedules, tempBreaks, startOfDay, endOfDay);

        // Find the minimum coverage in the group during the break window
        let minDeptCoverage = Infinity;
        let minGroupCoverage = Infinity;

        for (let t = testTime; t < testTime + breakDuration; t += 15) {
            const present = coverageMap[t] || [];

            const deptCount = present.filter(c => c.dept === dept && c.subdept === subdept).length;
            minDeptCoverage = Math.min(minDeptCoverage, deptCount);

            if (group) {
                const groupCount = present.filter(c =>
                    group.departments.some(d => d.main === c.dept && d.sub === c.subdept)
                ).length;
                minGroupCoverage = Math.min(minGroupCoverage, groupCount);
            } else {
                minGroupCoverage = 0;
            }
        }

        // Score: prioritize same-dept coverage, then group coverage, then proximity
        const coverageScore = (minDeptCoverage * advSettings.deptWeightMultiplier) + minGroupCoverage;

        const maxDistance = Math.max(advSettings.maxEarly, advSettings.maxDelay);
        const maxIntervals = maxDistance / 15;
        const intervalsAway = Math.abs(testTime - idealTime) / 15;
        const proximityBonus = advSettings.proximityWeight * Math.max(0, maxIntervals - intervalsAway);

        const finalScore = coverageScore + proximityBonus;

        log(`  [EVAL] ${empName}: ${minutesToTime(testTime)} → dept=${minDeptCoverage}, group=${minGroupCoverage}, score=${finalScore.toFixed(2)}`);

        if (finalScore > bestScore) {
            bestScore = finalScore;
            bestTime = testTime;
        }
    }

    return { bestTime, bestScore };
}

/**
 * Clamp an ideal break start time to the nearest valid segment window.
 */
function clampToSegment(empSchedule, idealTime, duration) {
    for (const seg of empSchedule.segments) {
        const latest = seg.end - duration;
        if (idealTime >= seg.start && idealTime <= latest) return idealTime;
        if (idealTime < seg.start) return seg.start;
        if (idealTime > latest && latest >= seg.start) return latest;
    }
    // Last resort: start of first segment
    return empSchedule.segments[0]?.start ?? idealTime;
}

/** Deep clone the breaks object to avoid mutation during scoring */
function deepCloneBreaks(breaks) {
    const clone = {};
    for (const [name, slots] of Object.entries(breaks)) {
        clone[name] = { ...slots };
    }
    return clone;
}

/**
 * Find the group containing the given dept/subdept.
 * Re-exported here for convenience so optimizer callers don't need to import from helpers.
 */
export { findGroupContaining };
