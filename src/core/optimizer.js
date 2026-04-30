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

    const deptMode = advSettings.deptCoverageMode || 'balanced';
    const timeMode = advSettings.timeCoverageMode || 'balanced';

    let bestTime = validCandidates[0];
    let bestVec  = null;

    for (const testTime of validCandidates) {
        // Temporarily assign this break time and measure coverage
        const tempBreaks = deepCloneBreaks(breaks);
        if (!tempBreaks[empName]) tempBreaks[empName] = {};
        tempBreaks[empName][breakSlot] = testTime;

        const coverageMap = calculateCoverageMap(employeeSchedules, tempBreaks, startOfDay, endOfDay);

        // Compute AVERAGE coverage during the break window. Average distinguishes
        // partial-overlap candidates from full-overlap (a meal that overlaps only
        // the first half of a coworker's break should outscore one that overlaps
        // the whole break), which `min` flattened.
        let deptSum = 0;
        let groupSum = 0;
        let samples = 0;

        for (let t = testTime; t < testTime + breakDuration; t += 15) {
            const present = coverageMap[t] || [];
            deptSum += present.filter(c => c.dept === dept && c.subdept === subdept).length;
            if (group) {
                groupSum += present.filter(c =>
                    group.departments.some(d => d.main === c.dept && d.sub === c.subdept)
                ).length;
            }
            samples++;
        }

        const avgDeptCoverage  = samples > 0 ? deptSum  / samples : 0;
        const avgGroupCoverage = samples > 0 ? groupSum / samples : 0;

        const maxDistance = Math.max(advSettings.maxEarly, advSettings.maxDelay);
        const maxIntervals = maxDistance > 0 ? maxDistance / 15 : 1;
        const intervalsAway = Math.abs(testTime - idealTime) / 15;
        const proximity = Math.max(0, maxIntervals - intervalsAway);

        const vec = buildScoreVector(avgDeptCoverage, avgGroupCoverage, proximity, deptMode, timeMode);

        log(`  [EVAL] ${empName}: ${minutesToTime(testTime)} → dept=${avgDeptCoverage.toFixed(2)}, group=${avgGroupCoverage.toFixed(2)}, prox=${proximity.toFixed(2)}, vec=[${vec.map(v => v.toFixed(2)).join(',')}]`);

        if (bestVec === null || compareScoreVectors(vec, bestVec) > 0) {
            bestVec = vec;
            bestTime = testTime;
        }
    }

    return { bestTime, bestScore: bestVec ? bestVec[0] : -1 };
}

/**
 * Build a lexicographic score vector for a candidate time given the user's
 * coverage-priority and time-vs-coverage modes. Higher tuples win.
 *
 * Coverage component (from deptCoverageMode):
 *   'individual' → primary = same-subdept count;       secondary = 0
 *   'group'      → primary = whole coverage-group count; secondary = 0
 *   'balanced'   → primary = same-subdept count;       secondary = whole-group count
 *
 * Then the time component (from timeCoverageMode) layers on top:
 *   'predictable' → [proximity, primary, secondary]   — proximity wins outright
 *   'coverage'    → [primary, secondary, proximity]   — coverage wins outright
 *   'balanced'    → [primary + proximity, secondary]  — both contribute, coverage breaks ties
 */
function buildScoreVector(deptCount, groupCount, proximity, deptMode, timeMode) {
    let primaryCov, secondaryCov;
    if (deptMode === 'individual') {
        primaryCov = deptCount;
        secondaryCov = 0;
    } else if (deptMode === 'group') {
        primaryCov = groupCount;
        secondaryCov = 0;
    } else { // 'balanced'
        primaryCov = deptCount;
        secondaryCov = groupCount;
    }

    if (timeMode === 'predictable') {
        return [proximity, primaryCov, secondaryCov];
    }
    if (timeMode === 'coverage') {
        return [primaryCov, secondaryCov, proximity];
    }
    // 'balanced' — weight coverage so 1 lost coworker outweighs a 45-min
    // proximity penalty. This is the calibration that pulls duplicate meals
    // off the same time slot when many coworkers share an ideal time.
    const COVERAGE_WEIGHT = 3;
    return [primaryCov * COVERAGE_WEIGHT + proximity, secondaryCov];
}

/**
 * Compare two score vectors element-by-element. Returns positive if `a` wins,
 * negative if `b` wins, 0 if tied. Treats missing elements as 0.
 */
function compareScoreVectors(a, b) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const av = a[i] ?? 0;
        const bv = b[i] ?? 0;
        if (av !== bv) return av - bv;
    }
    return 0;
}

/**
 * Clamp an ideal break start time to the nearest valid segment window.
 */
function clampToSegment(empSchedule, idealTime, duration) {
    for (const seg of empSchedule.segments) {
        // Earliest valid start is seg.start + 1 (not adjacent to start boundary).
        // Latest valid start is seg.end - duration - 1 (break ends strictly before seg.end).
        const earliest = seg.start + 1;
        const latest   = seg.end - duration - 1;
        if (latest < earliest) continue; // segment too short to fit any break
        if (idealTime >= earliest && idealTime <= latest) return idealTime;
        if (idealTime < earliest) return earliest;
        if (idealTime > latest) return latest;
    }
    // Last resort: first valid slot of first segment
    const first = empSchedule.segments[0];
    return first ? first.start + 1 : idealTime;
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
