// @ts-nocheck
// ====================================================================================
// BREAK SCHEDULER FOR OFFICE SCRIPTS
// Version: 1.0.1
// TypeScript version for Excel Office Scripts
// ====================================================================================

// ====================================================================================
// TYPE DEFINITIONS
// ====================================================================================

interface Department {
    main: string;
    sub: string;
}

interface Group {
    id: number;
    name: string;
    departments: Department[];
}

interface AdvancedSettings {
    maxMealEarly: number;
    maxMealDelay: number;
    maxRestEarly: number;
    maxRestDelay: number;
    deptWeightMultiplier: number;
    proximityWeight: number;
}

interface OperatingHours {
    startTime: number;
    endTime: number;
}

interface ScheduleRow {
    dept: string;
    job: string;
    name: string;
    interval: number[];
}

interface Segment {
    name: string;
    dept: string;
    job: string;
    start: number;
    end: number;
    intervalStr: string;
    rowIndex: number;
}

interface EmployeeNeedingMeal {
    name: string;
    shiftStart: number;
    shiftEnd: number;
    mealsNeeded: number;
    hasUKGLunch: boolean;
}

interface CoverageEmployee {
    name: string;
    dept: string;
    subdept: string;
}

interface ScheduleBreaksOptions {
    operatingHours?: OperatingHours;
    groups?: Group[];
    advancedSettings?: AdvancedSettings;
    enableLogging?: boolean;
}

interface ScheduleBreaksResult {
    breaks: { [name: string]: (number | undefined)[] };
    segments: Segment[];
    schedule: ScheduleRow[];
    shifts: { [name: string]: number[] };
}

// ====================================================================================
// CONFIGURATION AND CONSTANTS
// ====================================================================================

const DEPARTMENT_REGISTRY: { [key: string]: string[] } = {
    "Frontline": [
        "Cashier",
        "Cashier Bldg 2",
        "Customer Service",
        "Customer Service Bldg 2",
        "Greeter",
        "Greeter Bldg 2",
        "Order Pick Up",
        "Order Pick Up Bldg 2"
    ],
    "Hardgoods": [
        "Action Sports",
        "Camping",
        "Climbing",
        "Cycling",
        "Hardgoods",
        "Nordic",
        "Optics",
        "Outfitter",
        "Packs",
        "Paddling",
        "Racks",
        "Rentals",
        "Ski",
        "Snow Clothing",
        "Snow Sports"
    ],
    "Softgoods": [
        "Childrenswear",
        "Clothing",
        "Fitting Room",
        "Footwear",
        "Mens Clothing",
        "Outfitter",
        "Softgoods",
        "Womens Clothing"
    ],
    "Office": [
        "Banker",
        "Office"
    ],
    "Order Fulfillment": [
        "Order Fulfillment",
        "Order Fulfillment Bldg 2"
    ],
    "Product Movement": [
        "Action Sports Stock",
        "Camping Stock",
        "Clothing Stock",
        "Cycling Stock",
        "Footwear Stock",
        "Hardgoods Stock",
        "Ops Stock",
        "Ops Stock Bldg 2",
        "Ship Recv",
        "Ship Recv Bldg 2",
        "Snow Sports Stock",
        "Softgoods Stock",
        "Stocking"
    ],
    "Shop": [
        "Assembler",
        "Service Advisor",
        "Ski Shop"
    ],
    "Mgmt Retail": [
        "Key Holder",
        "Key Holder Bldg 2",
        "Leader on Duty",
        "Management",
        "Management Bldg 2"
    ]
};

const DEFAULT_GROUPS: Group[] = [
    {
        id: 1,
        name: "Building 2 Cross-trained",
        departments: [
            { main: "Hardgoods", sub: "Action Sports" },
            { main: "Hardgoods", sub: "Rentals" },
            { main: "Frontline", sub: "Cashier Bldg 2" },
            { main: "Frontline", sub: "Customer Service Bldg 2" }
        ]
    },
    {
        id: 2,
        name: "Camping",
        departments: [{ main: "Hardgoods", sub: "Camping" }]
    },
    {
        id: 3,
        name: "Clothing",
        departments: [{ main: "Softgoods", sub: "Clothing" }]
    },
    {
        id: 4,
        name: "Footwear",
        departments: [{ main: "Softgoods", sub: "Footwear" }]
    },
    {
        id: 5,
        name: "Cashier",
        departments: [{ main: "Frontline", sub: "Cashier" }]
    }
];

const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
    maxMealEarly: 15,
    maxMealDelay: 45,
    maxRestEarly: 15,
    maxRestDelay: 30,
    deptWeightMultiplier: 3,
    proximityWeight: 1
};

const DEFAULT_OPERATING_HOURS: OperatingHours = {
    startTime: 9 * 60,
    endTime: 21 * 60
};

// ====================================================================================
// HELPER FUNCTIONS
// ====================================================================================

function timeToMinutes(time: string | null | undefined): number {
    if (!time) return 0;
    const timeStr = String(time);
    return (timeStr.includes("AM") || timeStr.includes("PM")
        ? ((+timeStr.split(":")[0] % 12) + (timeStr.includes("PM") ? 12 : 0)) * 60 + +timeStr.split(":")[1].slice(0, 2)
        : +timeStr.split(":")[0] * 60 + +timeStr.split(":")[1]);
}

function minutesToTime(minutes: number): string {
    const h: number = Math.floor(minutes / 60) % 12 || 12;
    const m: string = (minutes % 60).toString().padStart(2, "0");
    return `${h}:${m}${minutes >= 720 ? "PM" : "AM"}`;
}

function formatName(name: string | number | boolean | null | undefined): string {
    if (!name) return "";
    const nameStr = String(name);
    const parts: string[] = nameStr.split(",").map((s: string) => s.trim());
    if (parts.length === 2) {
        return `${parts[1]} ${parts[0]}`;
    }
    return nameStr;
}

function findGroupContaining(mainDept: string, subDept: string, groups: Group[] = DEFAULT_GROUPS): Group | undefined {
    return groups.find((group: Group) =>
        group.departments.some((d: Department) => d.main === mainDept && d.sub === subDept)
    );
}

// ====================================================================================
// CORE SCHEDULING ALGORITHM
// ====================================================================================

function calculateCoverageMap(
    schedule: ScheduleRow[],
    shifts: { [name: string]: number[] },
    breaks: { [name: string]: (number | undefined)[] },
    startOfDay: number,
    endOfDay: number
): { [time: number]: CoverageEmployee[] } {
    const coverage: { [time: number]: CoverageEmployee[] } = {};

    for (let time = startOfDay; time < endOfDay; time += 15) {
        coverage[time] = [];
    }

    schedule.forEach((row: ScheduleRow) => {
        const name: string = row.name;
        const [shiftStart, shiftEnd] = row.interval;
        const employeeBreaks: (number | undefined)[] = breaks[name] || [];

        for (let time = startOfDay; time < endOfDay; time += 15) {
            if (time >= shiftStart && time < shiftEnd) {
                let onBreak = false;

                for (let i = 0; i < employeeBreaks.length; i++) {
                    if (employeeBreaks[i] === undefined) continue;

                    const breakStart: number = employeeBreaks[i]!;
                    const breakDuration: number = (i === 1) ? 30 : 15;
                    const breakEnd: number = breakStart + breakDuration;

                    if (time < breakEnd && time + 15 > breakStart) {
                        onBreak = true;
                        break;
                    }
                }

                if (!onBreak) {
                    coverage[time].push({
                        name: name,
                        dept: row.dept,
                        subdept: row.job
                    });
                }
            }
        }
    });

    return coverage;
}

function getCoworkersAtTime(
    coverage: { [time: number]: CoverageEmployee[] },
    time: number,
    dept: string,
    subdept: string,
    groups: Group[] = DEFAULT_GROUPS
): CoverageEmployee[] {
    if (!coverage[time]) return [];

    const group: Group | undefined = findGroupContaining(dept, subdept, groups);

    if (group) {
        return coverage[time].filter((emp: CoverageEmployee) =>
            group.departments.some((d: Department) =>
                d.main === emp.dept && d.sub === emp.subdept
            )
        );
    } else {
        return coverage[time].filter((emp: CoverageEmployee) => emp.dept === dept && emp.subdept === subdept);
    }
}

function countBreaksAtTime(
    schedule: ScheduleRow[],
    breaks: { [name: string]: (number | undefined)[] },
    targetTime: number,
    breakDuration: number,
    dept: string,
    subdept: string,
    groups: Group[] = DEFAULT_GROUPS
): number {
    let count = 0;
    const group: Group | undefined = findGroupContaining(dept, subdept, groups);

    for (let name in breaks) {
        const empRow: ScheduleRow | undefined = schedule.find((row: ScheduleRow) => row.name === name);
        if (!empRow) continue;

        let isInScope = false;
        if (group) {
            isInScope = group.departments.some((d: Department) =>
                d.main === empRow.dept && d.sub === empRow.job
            );
        } else {
            isInScope = (empRow.dept === dept && empRow.job === subdept);
        }

        if (!isInScope) continue;

        const empBreaks: (number | undefined)[] = breaks[name];
        for (let i = 0; i < empBreaks.length; i++) {
            if (empBreaks[i] === undefined) continue;

            const breakStart: number = empBreaks[i]!;
            const duration: number = (i === 1) ? 30 : 15;
            const breakEnd: number = breakStart + duration;

            if (targetTime < breakEnd && targetTime + breakDuration > breakStart) {
                count++;
                break;
            }
        }
    }

    return count;
}

function scheduleBreaks(schedule: (string | number | boolean)[][], options: ScheduleBreaksOptions = {}): ScheduleBreaksResult {
    const operatingHours: OperatingHours = options.operatingHours || DEFAULT_OPERATING_HOURS;
    const groups: Group[] = options.groups || DEFAULT_GROUPS;
    const advSettings: AdvancedSettings = options.advancedSettings || DEFAULT_ADVANCED_SETTINGS;
    const enableLogging: boolean = options.enableLogging !== false;

    const startOfDay: number = operatingHours.startTime;
    const endOfDay: number = operatingHours.endTime;

    let dept: string = "";
    let newSchedule: ScheduleRow[] = [];
    let shiftSegments: { [name: string]: ScheduleRow[] } = {};
    const segments: Segment[] = [];

    const log = enableLogging ? console.log : (...args: unknown[]) => {};

    for (let i = 7; i < schedule.length; i++) {
        if (schedule[i][0]) {
            dept = String(schedule[i][0]);

            if (dept === "Mgmt Retail") {
                dept = "Management";
            }

            if (dept.startsWith("Training-")) {
                dept = dept.replace("Training-", "");
            }

            continue;
        }

        if (!schedule[i][2]) {
            continue;
        }

        let name: string = formatName(schedule[i][2]);
        const intervalStr: string = schedule[i][4] ? String(schedule[i][4]) : "";
        let interval: number[] = (intervalStr ? intervalStr.split("-") : []).map((bound: string) => timeToMinutes(bound));

        newSchedule.push({
            dept: dept,
            job: String(schedule[i][1] || ""),
            name: name,
            interval: interval
        });

        if (!shiftSegments[name]) {
            shiftSegments[name] = [];
        }

        shiftSegments[name].push({
            dept: dept,
            job: String(schedule[i][1] || ""),
            name: name,
            interval: interval
        });

        segments.push({
            name: name,
            dept: dept,
            job: String(schedule[i][1] || ""),
            start: interval[0],
            end: interval[1],
            intervalStr: intervalStr,
            rowIndex: i
        });
    }

    const departmentOrder: string[] = ["Frontline", "Hardgoods", "Softgoods", "Order Fulfillment", "Product Movement", "Shop", "Management"];

    function getDeptOrder(d: string): number {
        let index: number = departmentOrder.indexOf(d);
        return index === -1 ? departmentOrder.length : index;
    }

    newSchedule.sort((a: ScheduleRow, b: ScheduleRow) => {
        let da: number = getDeptOrder(a.dept);
        let db: number = getDeptOrder(b.dept);
        if (da !== db) return da - db;
        return 0;
    });

    let shifts: { [name: string]: number[] } = {};
    newSchedule.forEach((row: ScheduleRow) => {
        if (!(row.name in shifts)) shifts[row.name] = [1440, 0];
        shifts[row.name][0] = Math.min(shifts[row.name][0], row.interval[0]);
        shifts[row.name][1] = Math.max(shifts[row.name][1], row.interval[1]);
    });

    let breaks: { [name: string]: (number | undefined)[] } = {};

    for (let name in shiftSegments) {
        let segs: ScheduleRow[] = shiftSegments[name];
        segs.sort((a: ScheduleRow, b: ScheduleRow) => a.interval[0] - b.interval[0]);

        for (let i = 0; i < segs.length - 1; i++) {
            if (segs[i].interval[1] >= shifts[name][0] + 240 &&
                segs[i + 1].interval[0] === segs[i].interval[1] + 30) {
                if (!breaks[name]) {
                    breaks[name] = [];
                }
                breaks[name][1] = segs[i].interval[1];
            }
        }
    }

    const employeesNeedingMeals: EmployeeNeedingMeal[] = [];
    const processedForMeals: Set<string> = new Set();

    newSchedule.forEach((row: ScheduleRow) => {
        const name: string = row.name;

        if (processedForMeals.has(name)) return;
        processedForMeals.add(name);

        const shiftDuration: number = shifts[name][1] - shifts[name][0];

        let mealsNeeded = 0;
        if (shiftDuration > 285) mealsNeeded = 1;
        if (shiftDuration > 585) mealsNeeded = 2;

        if (mealsNeeded > 0) {
            employeesNeedingMeals.push({
                name: name,
                shiftStart: shifts[name][0],
                shiftEnd: shifts[name][1],
                mealsNeeded: mealsNeeded,
                hasUKGLunch: breaks[name] && breaks[name][1] !== undefined
            });
        }
    });

    for (let emp of employeesNeedingMeals) {
        if (!breaks[emp.name]) breaks[emp.name] = [];

        if (emp.hasUKGLunch) continue;

        const empRow: ScheduleRow | undefined = newSchedule.find((row: ScheduleRow) => row.name === emp.name);
        if (!empRow) continue;

        const dept: string = empRow.dept;
        const subdept: string = empRow.job;

        const group: Group | undefined = findGroupContaining(dept, subdept, groups);

        if (!group) {
            breaks[emp.name][1] = emp.shiftStart + 240;
            continue;
        }

        const idealMealTime: number = emp.shiftStart + 240;
        const conflictsAtIdeal: number = countBreaksAtTime(newSchedule, breaks, idealMealTime, 30, dept, subdept, groups);

        log(`[MEAL DEBUG] ${emp.name} (${subdept}): ideal time ${minutesToTime(idealMealTime)}, conflicts: ${conflictsAtIdeal}`);

        const possibleTimes: number[] = [idealMealTime];

        for (let delay = 15; delay <= advSettings.maxMealDelay; delay += 15) {
            possibleTimes.push(idealMealTime + delay);
        }

        for (let early = 15; early <= advSettings.maxMealEarly; early += 15) {
            possibleTimes.push(idealMealTime - early);
        }

        const validTimes: number[] = possibleTimes.filter((t: number) => t >= emp.shiftStart && t + 30 <= emp.shiftEnd);

        let bestTime: number = idealMealTime;
        let bestScore: number = -Infinity;

        for (const testTime of validTimes) {
            const tempBreaks: { [name: string]: (number | undefined)[] } = JSON.parse(JSON.stringify(breaks));
            tempBreaks[emp.name] = tempBreaks[emp.name] || [];
            tempBreaks[emp.name][1] = testTime;

            const coverageMap: { [time: number]: CoverageEmployee[] } = calculateCoverageMap(newSchedule, shifts, tempBreaks, startOfDay, endOfDay);

            let minDeptCoverage: number = Infinity;
            let minGroupCoverage: number = Infinity;

            for (let time = testTime; time < testTime + 30; time += 15) {
                const coworkers: CoverageEmployee[] = coverageMap[time] || [];

                const deptCoverage: number = coworkers.filter((c: CoverageEmployee) => c.dept === dept && c.subdept === subdept).length;
                minDeptCoverage = Math.min(minDeptCoverage, deptCoverage);

                const groupCoverage: number = coworkers.filter((c: CoverageEmployee) =>
                    group.departments.some((d: Department) => d.main === c.dept && d.sub === c.subdept)
                ).length;
                minGroupCoverage = Math.min(minGroupCoverage, groupCoverage);
            }

            const score: number = (minDeptCoverage * advSettings.deptWeightMultiplier) + minGroupCoverage;

            const maxDistance: number = Math.max(advSettings.maxMealEarly, advSettings.maxMealDelay);
            const maxIntervals: number = maxDistance / 15;
            const distanceFromIdeal: number = Math.abs(testTime - idealMealTime);
            const intervalsAway: number = distanceFromIdeal / 15;
            const proximityBonus: number = Math.max(0, advSettings.proximityWeight * (maxIntervals - intervalsAway));

            const finalScore: number = score + proximityBonus;

            log(`  [EVAL] ${emp.name}: ${minutesToTime(testTime)} → dept coverage ${minDeptCoverage}, group coverage ${minGroupCoverage}, score ${score}, final ${finalScore.toFixed(2)}`);

            if (finalScore > bestScore) {
                bestScore = finalScore;
                bestTime = testTime;
            }
        }

        breaks[emp.name][1] = bestTime;

        if (bestTime === idealMealTime) {
            log(`[MEAL SCHEDULE] ${emp.name} (${subdept}): lunch scheduled at ${minutesToTime(idealMealTime)}`);
        } else {
            log(`[MEAL STAGGER] ${emp.name} (${subdept}): lunch optimized from ${minutesToTime(idealMealTime)} to ${minutesToTime(bestTime)} for coverage (score: ${bestScore})`);
        }
    }

    for (let emp of employeesNeedingMeals) {
        if (emp.mealsNeeded < 2) continue;
        breaks[emp.name].push(emp.shiftStart + 480);
    }

    const employeesInOrder: string[] = [];
    const seenEmployees: Set<string> = new Set();
    newSchedule.forEach((row: ScheduleRow) => {
        if (!seenEmployees.has(row.name)) {
            seenEmployees.add(row.name);
            employeesInOrder.push(row.name);
        }
    });

    for (let name of employeesInOrder) {
        if (!breaks[name]) breaks[name] = [];

        const shiftStart: number = shifts[name][0];
        const shiftEnd: number = shifts[name][1];
        const shiftDuration: number = shiftEnd - shiftStart;

        let hoursWorked: number = shiftDuration;
        if (breaks[name] && breaks[name][1] !== undefined) {
            hoursWorked = shiftDuration - 30;
        }

        let restBreaksNeeded = 0;
        if (hoursWorked >= 210) restBreaksNeeded = 1;
        if (hoursWorked > 360) restBreaksNeeded = 2;
        if (hoursWorked >= 600) restBreaksNeeded = 3;

        const empRow: ScheduleRow | undefined = newSchedule.find((row: ScheduleRow) => row.name === name);
        if (!empRow) continue;

        const dept: string = empRow.dept;
        const subdept: string = empRow.job;

        const group: Group | undefined = findGroupContaining(dept, subdept, groups);

        if (restBreaksNeeded >= 1) {
            const idealFirstBreak: number = shiftStart + 120;

            if (!group) {
                breaks[name][0] = idealFirstBreak;
            } else {
                const possibleTimes: number[] = [idealFirstBreak];

                for (let delay = 15; delay <= advSettings.maxRestDelay; delay += 15) {
                    possibleTimes.push(idealFirstBreak + delay);
                }

                for (let early = 15; early <= advSettings.maxRestEarly; early += 15) {
                    possibleTimes.push(idealFirstBreak - early);
                }

                let bestTime: number = idealFirstBreak;
                let bestMinCoverage: number = -1;

                for (let i = 0; i < possibleTimes.length; i++) {
                    const candidateTime: number = possibleTimes[i];
                    if (candidateTime < shiftStart || candidateTime + 15 > shiftEnd) continue;

                    const tempBreaks: { [name: string]: (number | undefined)[] } = JSON.parse(JSON.stringify(breaks));
                    if (!tempBreaks[name]) tempBreaks[name] = [];
                    tempBreaks[name] = [...(breaks[name] || [])];
                    tempBreaks[name][0] = candidateTime;

                    const tempCoverage: { [time: number]: CoverageEmployee[] } = calculateCoverageMap(newSchedule, shifts, tempBreaks, startOfDay, endOfDay);

                    let minDeptCoverage: number = Infinity;
                    let minGroupCoverage: number = Infinity;

                    for (let t = candidateTime; t < candidateTime + 15; t += 15) {
                        const coworkers: CoverageEmployee[] = tempCoverage[t] || [];

                        const deptCoverage: number = coworkers.filter((c: CoverageEmployee) => c.dept === dept && c.subdept === subdept).length;
                        minDeptCoverage = Math.min(minDeptCoverage, deptCoverage);

                        const groupCoverage: number = coworkers.filter((c: CoverageEmployee) =>
                            group.departments.some((d: Department) => d.main === c.dept && d.sub === c.subdept)
                        ).length;
                        minGroupCoverage = Math.min(minGroupCoverage, groupCoverage);
                    }

                    const score: number = (minDeptCoverage * advSettings.deptWeightMultiplier) + minGroupCoverage;

                    const maxDistance: number = Math.max(advSettings.maxRestEarly, advSettings.maxRestDelay);
                    const maxIntervals: number = maxDistance / 15;
                    const distanceFromIdeal: number = Math.abs(candidateTime - idealFirstBreak);
                    const intervalsAway: number = distanceFromIdeal / 15;
                    const proximityBonus: number = Math.max(0, advSettings.proximityWeight * (maxIntervals - intervalsAway));

                    const finalScore: number = score + proximityBonus;

                    log(`  [EVAL] ${name}: ${minutesToTime(candidateTime)} → dept coverage ${minDeptCoverage}, group coverage ${minGroupCoverage}, score ${score}, final ${finalScore.toFixed(2)}`);

                    if (finalScore > bestMinCoverage) {
                        bestMinCoverage = finalScore;
                        bestTime = candidateTime;
                    }
                }

                breaks[name][0] = bestTime;

                if (bestTime !== idealFirstBreak) {
                    const offset: number = bestTime - idealFirstBreak;
                    log(`[REST STAGGER] ${name} (${subdept}): first break adjusted from ${minutesToTime(idealFirstBreak)} to ${minutesToTime(bestTime)} (offset: ${offset > 0 ? '+' : ''}${offset}min, maintains min coverage of ${bestMinCoverage})`);
                }
            }
        }

        if (restBreaksNeeded >= 2 && breaks[name][1] !== undefined) {
            const idealSecondBreak: number = shiftStart + 390;

            if (!group) {
                breaks[name][2] = idealSecondBreak;
            } else {
                const possibleTimes: number[] = [idealSecondBreak];

                for (let delay = 15; delay <= advSettings.maxRestDelay; delay += 15) {
                    possibleTimes.push(idealSecondBreak + delay);
                }

                for (let early = 15; early <= advSettings.maxRestEarly; early += 15) {
                    possibleTimes.push(idealSecondBreak - early);
                }

                let bestTime: number = idealSecondBreak;
                let bestMinCoverage: number = -1;

                for (let i = 0; i < possibleTimes.length; i++) {
                    const candidateTime: number = possibleTimes[i];
                    if (candidateTime < shiftStart || candidateTime + 15 > shiftEnd) continue;

                    const tempBreaks: { [name: string]: (number | undefined)[] } = JSON.parse(JSON.stringify(breaks));
                    if (!tempBreaks[name]) tempBreaks[name] = [];
                    tempBreaks[name] = [...(breaks[name] || [])];
                    tempBreaks[name][2] = candidateTime;

                    const tempCoverage: { [time: number]: CoverageEmployee[] } = calculateCoverageMap(newSchedule, shifts, tempBreaks, startOfDay, endOfDay);

                    let minDeptCoverage: number = Infinity;
                    let minGroupCoverage: number = Infinity;

                    for (let t = candidateTime; t < candidateTime + 15; t += 15) {
                        const coworkers: CoverageEmployee[] = tempCoverage[t] || [];

                        const deptCoverage: number = coworkers.filter((c: CoverageEmployee) => c.dept === dept && c.subdept === subdept).length;
                        minDeptCoverage = Math.min(minDeptCoverage, deptCoverage);

                        const groupCoverage: number = coworkers.filter((c: CoverageEmployee) =>
                            group.departments.some((d: Department) => d.main === c.dept && d.sub === c.subdept)
                        ).length;
                        minGroupCoverage = Math.min(minGroupCoverage, groupCoverage);
                    }

                    const score: number = (minDeptCoverage * advSettings.deptWeightMultiplier) + minGroupCoverage;

                    const maxDistance: number = Math.max(advSettings.maxRestEarly, advSettings.maxRestDelay);
                    const maxIntervals: number = maxDistance / 15;
                    const distanceFromIdeal: number = Math.abs(candidateTime - idealSecondBreak);
                    const intervalsAway: number = distanceFromIdeal / 15;
                    const proximityBonus: number = Math.max(0, advSettings.proximityWeight * (maxIntervals - intervalsAway));

                    const finalScore: number = score + proximityBonus;

                    log(`  [EVAL] ${name}: ${minutesToTime(candidateTime)} → dept coverage ${minDeptCoverage}, group coverage ${minGroupCoverage}, score ${score}, final ${finalScore.toFixed(2)}`);

                    if (finalScore > bestMinCoverage) {
                        bestMinCoverage = finalScore;
                        bestTime = candidateTime;
                    }
                }

                breaks[name][2] = bestTime;

                if (bestTime !== idealSecondBreak) {
                    const offset: number = bestTime - idealSecondBreak;
                    log(`[REST STAGGER] ${name} (${subdept}): second break adjusted from ${minutesToTime(idealSecondBreak)} to ${minutesToTime(bestTime)} (offset: ${offset > 0 ? '+' : ''}${offset}min, maintains min coverage of ${bestMinCoverage})`);
                }
            }
        }

        if (restBreaksNeeded >= 3 && breaks[name][2] !== undefined) {
            const idealThirdBreak: number = breaks[name][2]! + 15 + 120;
            breaks[name][3] = idealThirdBreak;
        }
    }

    const deptEmployees: { [key: string]: string[] } = {};
    employeesInOrder.forEach((name: string) => {
        const empRow: ScheduleRow | undefined = newSchedule.find((row: ScheduleRow) => row.name === name);
        if (!empRow) return;

        const deptKey: string = `${empRow.dept}|${empRow.job}`;
        if (!deptEmployees[deptKey]) {
            deptEmployees[deptKey] = [];
        }
        deptEmployees[deptKey].push(name);
    });

    for (let deptKey in deptEmployees) {
        const [dept, subdept] = deptKey.split('|');
        const group: Group | undefined = findGroupContaining(dept, subdept, groups);
        if (!group) continue;

        const employees: string[] = deptEmployees[deptKey];

        for (let breakIndex of [0, 2]) {
            for (let i = 0; i < employees.length; i++) {
                for (let j = i + 1; j < employees.length; j++) {
                    const empA: string = employees[i];
                    const empB: string = employees[j];

                    if (!breaks[empA] || !breaks[empB]) continue;
                    if (breaks[empA][breakIndex] === undefined || breaks[empB][breakIndex] === undefined) continue;

                    const timeA: number = breaks[empA][breakIndex]!;
                    const timeB: number = breaks[empB][breakIndex]!;

                    if (timeA > timeB) {
                        const empARow: ScheduleRow | undefined = newSchedule.find((row: ScheduleRow) => row.name === empA);
                        const empBRow: ScheduleRow | undefined = newSchedule.find((row: ScheduleRow) => row.name === empB);

                        if (!empARow || !empBRow) continue;

                        const breakDuration: number = breakIndex === 0 || breakIndex === 2 ? 15 : 30;

                        const timeB_validForA: boolean = timeB >= shifts[empA][0] && (timeB + breakDuration) <= shifts[empA][1];
                        const timeA_validForB: boolean = timeA >= shifts[empB][0] && (timeA + breakDuration) <= shifts[empB][1];

                        if (!timeB_validForA || !timeA_validForB) {
                            continue;
                        }

                        const originalBreaks: { [name: string]: (number | undefined)[] } = JSON.parse(JSON.stringify(breaks));
                        breaks[empA][breakIndex] = timeB;
                        breaks[empB][breakIndex] = timeA;

                        const coverageOriginal: { [time: number]: CoverageEmployee[] } = calculateCoverageMap(newSchedule, shifts, originalBreaks, startOfDay, endOfDay);
                        const coverageSwapped: { [time: number]: CoverageEmployee[] } = calculateCoverageMap(newSchedule, shifts, breaks, startOfDay, endOfDay);

                        let coverageIdentical = true;
                        for (let t = startOfDay; t <= endOfDay; t += 15) {
                            const origCoworkers: CoverageEmployee[] = getCoworkersAtTime(coverageOriginal, t, dept, subdept, groups);
                            const swapCoworkers: CoverageEmployee[] = getCoworkersAtTime(coverageSwapped, t, dept, subdept, groups);
                            if (origCoworkers.length !== swapCoworkers.length) {
                                coverageIdentical = false;
                                break;
                            }
                        }

                        if (coverageIdentical) {
                            const breakName: string = breakIndex === 0 ? 'first rest' : 'second rest';
                            log(`[BREAK SWAP] ${empA} and ${empB} (${subdept}): swapped ${breakName} breaks (${minutesToTime(timeA)} ↔ ${minutesToTime(timeB)}) to preserve schedule order with identical coverage`);
                        } else {
                            breaks[empA][breakIndex] = timeA;
                            breaks[empB][breakIndex] = timeB;
                        }
                    }
                }
            }
        }
    }

    const coverageBefore: { [time: number]: CoverageEmployee[] } = calculateCoverageMap(newSchedule, shifts, {}, startOfDay, endOfDay);
    const coverageAfter: { [time: number]: CoverageEmployee[] } = calculateCoverageMap(newSchedule, shifts, breaks, startOfDay, endOfDay);

    log("Coverage optimization complete");
    log(`Operating hours: ${minutesToTime(startOfDay)} - ${minutesToTime(endOfDay)}`);
    log("Sample coverage (4:00 PM before breaks):", coverageBefore[16 * 60]);
    log("Sample coverage (4:00 PM after breaks):", coverageAfter[16 * 60]);

    return {
        breaks,
        segments,
        schedule: newSchedule,
        shifts
    };
}

// ====================================================================================
// MAIN FUNCTION FOR OFFICE SCRIPTS
// ====================================================================================

async function main(workbook: ExcelScript.Workbook) {
    const sheet: ExcelScript.Worksheet = workbook.getActiveWorksheet();
    const usedRange: ExcelScript.Range = sheet.getUsedRange();
    const schedule: (string | number | boolean)[][] = usedRange.getValues();

    console.log("Processing break schedule...");

    const result: ScheduleBreaksResult = scheduleBreaks(schedule, {
        enableLogging: true
    });

    const { breaks, segments } = result;

    // Set column headers in row 7
    sheet.getRange("D7").setValue("Shift");
    sheet.getRange("E7").setValue("15");
    sheet.getRange("F7").setValue("30");
    sheet.getRange("G7").setValue("15");

    // Format row 7 headers (Arial, Bold, 7.5pt)
    const headerRange: ExcelScript.Range = sheet.getRange("A7:G7");
    const headerFormat: ExcelScript.RangeFormat = headerRange.getFormat();
    const headerFont: ExcelScript.RangeFont = headerFormat.getFont();
    headerFont.setName("Arial");
    headerFont.setBold(true);
    headerFont.setSize(7.5);

    const printed: Set<string> = new Set();

    segments.forEach((seg: Segment) => {
        const empName: string = seg.name;
        const rowIndex: number = seg.rowIndex;
        const empBreaks: (number | undefined)[] = breaks[empName] || [];
        const firstRowForEmp: boolean = !printed.has(empName);

        if (seg.intervalStr) {
            sheet.getRange(`D${rowIndex + 1}`).setValue(seg.intervalStr);
        }

        if (firstRowForEmp) {
            const breakTimes: string[] = [
                empBreaks[0] !== undefined ? minutesToTime(empBreaks[0]!) : "",
                empBreaks[1] !== undefined ? minutesToTime(empBreaks[1]!) : "",
                empBreaks[2] !== undefined ? minutesToTime(empBreaks[2]!) : ""
            ];

            sheet.getRange(`E${rowIndex + 1}`).setValue(breakTimes[0]);
            sheet.getRange(`F${rowIndex + 1}`).setValue(breakTimes[1]);
            sheet.getRange(`G${rowIndex + 1}`).setValue(breakTimes[2]);

            printed.add(empName);
        }
    });

    console.log("Break schedule processing complete!");
}
