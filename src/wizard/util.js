/**
 * Shared wizard utilities — small helpers used by multiple step renderers and
 * the schedule preview, kept here so they don't get reimplemented per file.
 */

/** Escape a string for safe insertion into innerHTML template literals. */
export function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
}

/**
 * Stable color palette for coverage groups, indexed by group id. Keeps the
 * sidebar group containers and the right-pane preview cards visually in sync.
 */
const GROUP_PALETTE = ['#2f855a', '#3182ce', '#805ad5', '#dd6b20', '#d53f8c', '#0987a0', '#b7791f', '#5a67d8'];

export function colorForGroupId(id) {
    return GROUP_PALETTE[id % GROUP_PALETTE.length];
}
