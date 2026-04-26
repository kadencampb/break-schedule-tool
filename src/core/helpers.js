/**
 * Convert a time string to minutes since midnight.
 * Accepts 12-hour format ("2:30PM", "12:00AM") or 24-hour format ("14:30", "09:00").
 * Returns 0 for null/undefined/empty input.
 */
export function timeToMinutes(time) {
    if (!time || typeof time !== 'string') return 0;

    const trimmed = time.trim();

    if (trimmed.includes('AM') || trimmed.includes('PM')) {
        const isPM = trimmed.includes('PM');
        const [hourStr, minutePart] = trimmed.split(':');
        const hour = parseInt(hourStr, 10) % 12;
        const minute = parseInt(minutePart, 10);
        return (hour + (isPM ? 12 : 0)) * 60 + minute;
    }

    const [hourStr, minuteStr] = trimmed.split(':');
    return parseInt(hourStr, 10) * 60 + parseInt(minuteStr, 10);
}

/**
 * Convert minutes since midnight to a 12-hour time string (e.g., "2:30PM").
 */
export function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60) % 12 || 12;
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}${minutes >= 720 ? 'PM' : 'AM'}`;
}

/**
 * Reformat an employee name from "Last, First" to "First Last".
 * Returns the original string if it doesn't match the expected format.
 */
export function formatName(name) {
    if (!name || typeof name !== 'string') return '';
    const parts = name.split(',').map(s => s.trim());
    return parts.length === 2 ? `${parts[1]} ${parts[0]}` : name;
}

/**
 * Find which coverage group (if any) contains the given main/sub department pair.
 * Returns the group object or undefined.
 */
export function findGroupContaining(mainDept, subDept, groups) {
    if (!mainDept || !groups) return undefined;
    return groups.find(group =>
        group.departments.some(d => d.main === mainDept && d.sub === subDept)
    );
}

/**
 * Parse a shift string like "8:00AM-4:30PM" into [startMinutes, endMinutes].
 * Returns [0, 0] if the string is invalid.
 */
export function parseShiftInterval(shiftStr) {
    if (!shiftStr || typeof shiftStr !== 'string') return [0, 0];
    const parts = shiftStr.split('-');
    if (parts.length !== 2) return [0, 0];
    return [timeToMinutes(parts[0].trim()), timeToMinutes(parts[1].trim())];
}
