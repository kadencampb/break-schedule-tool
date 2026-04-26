import * as XLSX from 'xlsx';
import { timeToMinutes } from '../core/helpers.js';
import { COL } from '../core/constants.js';

/**
 * ExcelFacade — hides xlsx.js complexity behind a clean interface.
 *
 * Facade pattern: all xlsx interactions (parse, build, style, download)
 * go through this class. Callers never need to know about XLSX internals.
 */
export class ExcelFacade {
    /**
     * Parse an ArrayBuffer from a .xlsx file into an array of raw row arrays.
     * Validates that the file has at least one sheet.
     *
     * @param {ArrayBuffer} buffer
     * @returns {{ rowData: Array<Array>, isValid: boolean, error: string|null }}
     */
    parseWorkbook(buffer) {
        try {
            const workbook = XLSX.read(new Uint8Array(buffer), {
                type: 'array',
                cellStyles: true
            });

            if (!workbook.SheetNames.length) {
                return { rowData: [], isValid: false, error: 'The file contains no sheets.' };
            }

            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rowData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            if (!rowData.length) {
                return { rowData: [], isValid: false, error: 'The file appears to be empty.' };
            }

            return { rowData, isValid: true, error: null };
        } catch (e) {
            return { rowData: [], isValid: false, error: `Could not read file: ${e.message}` };
        }
    }

    /**
     * Validate that a set of parsed rows looks like a UKG schedule export.
     * Checks for expected header markers.
     *
     * @param {Array<Array>} rowData
     * @returns {{ isValid: boolean, error: string|null }}
     */
    validateScheduleStructure(rowData) {
        if (!rowData || rowData.length < 8) {
            return { isValid: false, error: 'File has too few rows to be a valid schedule.' };
        }

        // Look for a "Name" column header within the first 10 rows
        const hasNameHeader = rowData.slice(0, 10).some(row =>
            row && row.some(cell => typeof cell === 'string' && cell.trim().toLowerCase() === 'name')
        );

        if (!hasNameHeader) {
            return { isValid: false, error: 'File does not appear to be a UKG schedule export (no "Name" column found).' };
        }

        return { isValid: true, error: null };
    }

    /**
     * Split raw row data containing multiple daily schedules (separated by "Date: YYYY-MM-DD" markers)
     * into an array of individual day objects.
     *
     * @param {Array<Array>} rowData
     * @returns {Array<{ date: string, rows: Array<Array> }>}
     */
    splitIntoDailySchedules(rowData) {
        const dailySchedules = [];
        let currentRows = [];
        let currentDate = null;

        for (const row of rowData) {
            const cell = row[0];
            if (typeof cell === 'string') {
                const match = cell.match(/Date:\s*(\d{4}-\d{2}-\d{2})/);
                if (match) {
                    if (currentRows.length && currentDate) {
                        dailySchedules.push({ date: currentDate, rows: currentRows });
                    }
                    currentDate = match[1];
                    currentRows = [];
                }
            }
            currentRows.push([...row]);
        }

        if (currentRows.length && currentDate) {
            dailySchedules.push({ date: currentDate, rows: currentRows });
        }

        return dailySchedules;
    }

    /**
     * Delete column D (index 3) from all rows in a sheet and update the sheet range.
     * Column D in UKG exports is a shift-label column that we don't need.
     *
     * @param {Object} sheet - XLSX sheet object (mutated in place)
     * @param {Array<Array>} rows - Raw rows (mutated in place)
     */
    deleteColumnD(sheet, rows) {
        const sheetRange = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
        const lastRow = sheetRange.e.r;
        const lastCol = sheetRange.e.c;

        // Shift columns E+ left by one in the sheet
        for (let r = 0; r <= lastRow; r++) {
            for (let c = 4; c <= lastCol; c++) {
                const srcRef = XLSX.utils.encode_cell({ r, c });
                const dstRef = XLSX.utils.encode_cell({ r, c: c - 1 });
                if (sheet[srcRef]) {
                    sheet[dstRef] = sheet[srcRef];
                } else {
                    delete sheet[dstRef];
                }
            }
            delete sheet[XLSX.utils.encode_cell({ r, c: lastCol })];
        }

        sheetRange.e.c = lastCol - 1;
        sheet['!ref'] = XLSX.utils.encode_range(sheetRange);

        // Remove column D (index 3) from every row array
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row && row.length > 3) {
                rows[i] = [row[0], row[1], row[2], ...row.slice(4)];
            }
        }
    }

    /**
     * Write break values into the sheet.
     *
     * @param {Object} sheet
     * @param {Array<{name: string, rowIndex: number}>} segments
     * @param {Object} breaks - { [name]: { rest1, meal, rest2, rest3 } }
     * @param {number} headerRowIndex
     * @param {Function} minutesToTimeFunc
     */
    writeBreaks(sheet, segments, breaks, headerRowIndex, minutesToTimeFunc) {
        const setCell = (r, c, value) => {
            const ref = XLSX.utils.encode_cell({ r, c });
            const cell = sheet[ref] || {};
            cell.t = 's';
            cell.v = value == null ? ' ' : value;
            sheet[ref] = cell;
        };

        // Write column headers
        if (headerRowIndex >= 0) {
            setCell(headerRowIndex, COL.REST1, '15');
            setCell(headerRowIndex, COL.MEAL,  '30');
            setCell(headerRowIndex, COL.REST2, '15');
        }

        // Write breaks — only on the first segment row for each employee
        const printed = new Set();

        for (const seg of segments) {
            const empBreaks = breaks[seg.name] || {};
            const r = seg.rowIndex;

            if (!printed.has(seg.name)) {
                setCell(r, COL.REST1, empBreaks.rest1 != null ? minutesToTimeFunc(empBreaks.rest1) : '');
                setCell(r, COL.MEAL,  empBreaks.meal  != null ? minutesToTimeFunc(empBreaks.meal)  : '');
                setCell(r, COL.REST2, empBreaks.rest2 != null ? minutesToTimeFunc(empBreaks.rest2) : '');
                printed.add(seg.name);
            } else {
                setCell(r, COL.REST1, '');
                setCell(r, COL.MEAL,  '');
                setCell(r, COL.REST2, '');
            }
        }

        // Ensure the sheet range covers through column G (index 6)
        const ref = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
        if (ref.e.c < 6) {
            ref.e.c = 6;
            sheet['!ref'] = XLSX.utils.encode_range(ref);
        }
    }

    /**
     * Apply formatting and cell styles to a single-day schedule sheet.
     *
     * @param {Object} sheet
     * @param {Array<Array>} rows
     */
    applyScheduleStyling(sheet, rows) {
        const styler = new SheetStyler(sheet, rows);
        styler.apply();
    }

    /**
     * Apply formatting for a multi-day combined sheet.
     *
     * @param {Object} sheet
     * @param {Array<Array>} combinedRows
     * @param {Array<{ date: string, rows: Array }>} dailySchedules
     */
    applyMultiDayStyling(sheet, combinedRows, dailySchedules) {
        const styler = new MultiDaySheetStyler(sheet, combinedRows, dailySchedules);
        styler.apply();
    }

    /**
     * Generate a .xlsx file and trigger a browser download.
     *
     * @param {Object} workbook
     * @param {string} filename
     */
    download(workbook, filename) {
        const binary = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary', cellStyles: true });
        const buffer = this._binaryToArrayBuffer(binary);
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Create a new XLSX workbook.
     * @returns {Object}
     */
    createWorkbook() {
        return XLSX.utils.book_new();
    }

    /**
     * Create a sheet from an array of arrays.
     * @param {Array<Array>} rows
     * @returns {Object}
     */
    createSheet(rows) {
        return XLSX.utils.aoa_to_sheet(rows);
    }

    /**
     * Convert a processed sheet back to an array of arrays.
     * @param {Object} sheet
     * @returns {Array<Array>}
     */
    sheetToRows(sheet) {
        return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    }

    /**
     * Append a sheet to a workbook.
     * @param {Object} workbook
     * @param {Object} sheet
     * @param {string} name
     */
    appendSheet(workbook, sheet, name) {
        XLSX.utils.book_append_sheet(workbook, sheet, name);
    }

    /** @private */
    _binaryToArrayBuffer(binary) {
        const buf = new ArrayBuffer(binary.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < binary.length; i++) {
            view[i] = binary.charCodeAt(i) & 0xFF;
        }
        return buf;
    }
}

// ---------------------------------------------------------------------------
// Private: sheet styling helpers
// ---------------------------------------------------------------------------

const BLACK_BORDER = {
    top:    { style: 'thin', color: { rgb: '000000' } },
    bottom: { style: 'thin', color: { rgb: '000000' } },
    left:   { style: 'thin', color: { rgb: '000000' } },
    right:  { style: 'thin', color: { rgb: '000000' } }
};

/**
 * Detects the row index where employee data starts (the row after the "Name" header row).
 */
function detectDataStart(rows) {
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row && typeof row[2] === 'string' && row[2].trim().toLowerCase() === 'name') {
            return i + 1;
        }
    }
    return 8;
}

/**
 * Single-day sheet styler.
 */
class SheetStyler {
    constructor(sheet, rows) {
        this.sheet = sheet;
        this.rows = rows;
        this.dataStart = detectDataStart(rows);
    }

    apply() {
        const sheet = this.sheet;
        if (!sheet['!ref']) return;

        const range = XLSX.utils.decode_range(sheet['!ref']);
        const lastRow = range.e.r;
        const { dataStart, rows } = this;

        // Initialize every cell with a default style
        for (let r = 0; r <= lastRow; r++) {
            for (let c = 0; c <= 6; c++) {
                const cell = this._touch(r, c);
                cell.s = { font: { name: 'Arial', sz: 6.75, bold: false }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true } };
            }
        }

        // Date row (row 0)
        for (let c = 0; c <= 6; c++) {
            this._touch(0, c).s = { font: { name: 'Arial', sz: 9, bold: true }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } };
        }

        // Location row (row 1)
        for (let c = 0; c <= 6; c++) {
            this._touch(1, c).s = { font: { name: 'Arial', sz: 9, bold: true }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } };
        }

        // Dept/Job header row (row 2)
        for (let c = 0; c <= 6; c++) {
            this._touch(2, c).s = { font: { name: 'Arial', sz: 7.5, bold: true }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: BLACK_BORDER };
        }

        // Rows 4–5 (break type labels)
        for (let r = 4; r <= 5; r++) {
            for (let c = 0; c <= 6; c++) {
                const sz = c === 0 ? 7.5 : (c >= 4 && c <= 6) ? 9 : 6.75;
                this._touch(r, c).s = { font: { name: 'Arial', sz, bold: c === 0 }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BLACK_BORDER };
            }
        }

        // Column header row
        for (let c = 0; c <= 6; c++) {
            this._touch(dataStart - 1, c).s = { font: { name: 'Arial', sz: 7.5, bold: true }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: BLACK_BORDER };
        }

        // Data rows
        for (let r = dataStart; r <= lastRow; r++) {
            const row = rows[r] || [];
            const hasDept = row[0] != null && String(row[0]).trim() !== '';
            const hasName = row[2] != null && String(row[2]).trim() !== '';

            for (let c = 0; c <= 6; c++) {
                const cell = this._touch(r, c);
                if (hasDept && !hasName) {
                    cell.s = { font: { name: 'Arial', sz: 7.5, bold: true }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BLACK_BORDER };
                } else if (hasName) {
                    const sz = (c >= 4 && c <= 6) ? 9 : 6.75;
                    cell.s = { font: { name: 'Arial', sz, bold: false }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BLACK_BORDER };
                } else {
                    cell.s = { font: { name: 'Arial', sz: 6.75, bold: false }, alignment: { horizontal: 'left', vertical: 'top' }, border: BLACK_BORDER };
                }
            }
        }

        this._applyMerges(0, lastRow, dataStart);
        this._setColumnWidths();
    }

    _touch(r, c) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (!this.sheet[ref]) this.sheet[ref] = { t: 's', v: ' ' };
        const cell = this.sheet[ref];
        if (!cell.v && cell.v !== 0) { cell.t = 's'; cell.v = ' '; }
        if (!cell.s) cell.s = {};
        return cell;
    }

    _applyMerges(sectionStart, lastRow, dataStart) {
        if (!this.sheet['!merges']) this.sheet['!merges'] = [];
        const m = this.sheet['!merges'];
        m.push({ s: { r: sectionStart,     c: 0 }, e: { r: sectionStart,     c: 6 } }); // date row
        m.push({ s: { r: sectionStart + 1, c: 0 }, e: { r: sectionStart + 1, c: 6 } }); // location row
        m.push({ s: { r: dataStart - 1,    c: 0 }, e: { r: dataStart - 1,    c: 1 } }); // header A:B

        for (let r = dataStart; r <= lastRow; r++) {
            const row = this.rows[r] || [];
            if (row[0] && !row[2]) {
                m.push({ s: { r, c: 0 }, e: { r, c: 1 } });
            }
        }
    }

    _setColumnWidths() {
        this.sheet['!cols'] = [
            { wch: 6.14 }, { wch: 16 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }
        ];
    }
}

/**
 * Multi-day sheet styler — applies per-section styling to a combined sheet.
 */
class MultiDaySheetStyler {
    constructor(sheet, combinedRows, dailySchedules) {
        this.sheet = sheet;
        this.combinedRows = combinedRows;
        this.dailySchedules = dailySchedules;
    }

    apply() {
        if (!this.sheet['!ref']) return;
        if (!this.sheet['!merges']) this.sheet['!merges'] = [];

        let rowOffset = 0;
        for (const schedule of this.dailySchedules) {
            const styler = new SheetStyler(this.sheet, this.combinedRows);
            // Override dataStart detection to be relative to this section
            styler.dataStart = detectDataStart(schedule.rows) + rowOffset;
            styler.rows = this.combinedRows;

            const sectionEnd = rowOffset + schedule.rows.length - 1;
            styler._applyMerges(rowOffset, sectionEnd, styler.dataStart);

            // Style cells in this section
            const dataStart = styler.dataStart;
            for (let r = rowOffset; r <= sectionEnd; r++) {
                for (let c = 0; c <= 6; c++) {
                    const cell = styler._touch(r, c);
                    const relR = r - rowOffset;
                    const row = schedule.rows[relR] || [];
                    const hasDept = row[0] != null && String(row[0]).trim() !== '';
                    const hasName = row[2] != null && String(row[2]).trim() !== '';

                    if (relR === 0 || relR === 1) {
                        cell.s = { font: { name: 'Arial', sz: 9, bold: true }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } };
                    } else if (r === dataStart - 1) {
                        cell.s = { font: { name: 'Arial', sz: 7.5, bold: true }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: BLACK_BORDER };
                    } else if (r >= dataStart) {
                        if (hasDept && !hasName) {
                            cell.s = { font: { name: 'Arial', sz: 7.5, bold: true }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BLACK_BORDER };
                        } else if (hasName) {
                            const sz = (c >= 4 && c <= 6) ? 9 : 6.75;
                            cell.s = { font: { name: 'Arial', sz, bold: false }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BLACK_BORDER };
                        } else {
                            cell.s = { font: { name: 'Arial', sz: 6.75, bold: false }, alignment: { horizontal: 'left', vertical: 'top' }, border: BLACK_BORDER };
                        }
                    } else {
                        cell.s = { font: { name: 'Arial', sz: 6.75, bold: false }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BLACK_BORDER };
                    }
                }
            }

            rowOffset += schedule.rows.length;
        }

        this.sheet['!cols'] = [
            { wch: 6.14 }, { wch: 16 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }
        ];
    }
}
