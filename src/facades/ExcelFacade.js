import ExcelJS from 'exceljs';
import { COL } from '../core/constants.js';

export class ExcelFacade {
    async parseWorkbook(buffer) {
        try {
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buffer);

            if (!wb.worksheets.length) {
                return { rowData: [], isValid: false, error: 'The file contains no sheets.' };
            }

            const ws = wb.worksheets[0];
            const colCount = ws.columnCount;
            const rowData = [];

            ws.eachRow({ includeEmpty: true }, (row) => {
                const cells = [];
                for (let c = 1; c <= colCount; c++) {
                    cells.push(_cellValue(row.getCell(c)));
                }
                rowData.push(cells);
            });

            if (!rowData.length) {
                return { rowData: [], isValid: false, error: 'The file appears to be empty.' };
            }

            return { rowData, isValid: true, error: null };
        } catch (e) {
            return { rowData: [], isValid: false, error: `Could not read file: ${e.message}` };
        }
    }

    validateScheduleStructure(rowData) {
        if (!rowData || rowData.length < 8) {
            return { isValid: false, error: 'File has too few rows to be a valid schedule.' };
        }

        const hasNameHeader = rowData.slice(0, 10).some(row =>
            row && row.some(cell => typeof cell === 'string' && cell.trim().toLowerCase() === 'name')
        );

        if (!hasNameHeader) {
            return { isValid: false, error: 'File does not appear to be a UKG schedule export (no "Name" column found).' };
        }

        return { isValid: true, error: null };
    }

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

    createWorkbook() {
        return { sheets: [] };
    }

    createSheet(rows) {
        return {
            rows:      rows.map(r => r ? [...r] : []),
            styles:    {},
            merges:    [],
            colWidths: [],
            rowBreaks: []
        };
    }

    sheetToRows(sheet) {
        return sheet.rows;
    }

    appendSheet(workbook, sheet, name) {
        workbook.sheets.push({ name, sheet });
    }

    setRowBreaks(sheet, rowIndices) {
        sheet.rowBreaks = rowIndices;
    }

    deleteColumnD(sheet, rows) {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row && row.length > 3) {
                rows[i] = [row[0], row[1], row[2], ...row.slice(4)];
            }
        }
        sheet.rows = rows.map(r => r ? [...r] : []);
    }

    writeBreaks(sheet, segments, breaks, headerRowIndex, minutesToTimeFunc) {
        const setCell = (r, c, value) => {
            if (!sheet.rows[r]) sheet.rows[r] = [];
            const row = sheet.rows[r];
            while (row.length <= c) row.push('');
            row[c] = value == null ? ' ' : value;
        };

        if (headerRowIndex >= 0) {
            setCell(headerRowIndex, COL.REST1, '15');
            setCell(headerRowIndex, COL.MEAL,  '30');
            setCell(headerRowIndex, COL.REST2, '15');
        }

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
    }

    applyScheduleStyling(sheet, rows) {
        new SheetStyler(sheet, rows).apply();
    }

    applyMultiDayStyling(sheet, combinedRows, dailySchedules) {
        new MultiDaySheetStyler(sheet, combinedRows, dailySchedules).apply();
    }

    async download(workbook, filename) {
        const excelWb = new ExcelJS.Workbook();

        for (const { name, sheet } of workbook.sheets) {
            const ws = excelWb.addWorksheet(name);

            sheet.colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

            const numRows = sheet.rows.length;
            for (let r = 0; r < numRows; r++) {
                const rowArr = sheet.rows[r] || [];
                const exRow = ws.getRow(r + 1);
                for (let c = 0; c <= 6; c++) {
                    const cell = exRow.getCell(c + 1);
                    const val = rowArr[c];
                    cell.value = (val !== undefined && val !== null) ? val : null;
                    const style = sheet.styles[`${r},${c}`];
                    if (style) cell.style = style;
                }
                exRow.commit();
            }

            for (const merge of sheet.merges) {
                try {
                    ws.mergeCells(merge.s.r + 1, merge.s.c + 1, merge.e.r + 1, merge.e.c + 1);
                } catch { /* skip overlapping ranges */ }
            }

            if (sheet.rowBreaks.length) {
                ws.pageBreaks = {
                    rowBreaks: sheet.rowBreaks.map(r => ({ id: r + 1 })),
                    colBreaks: []
                };
            }
        }

        const buffer = await excelWb.xlsx.writeBuffer();
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _cellValue(cell) {
    const { value } = cell;
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') {
        if ('result' in value) return value.result ?? null;
        if ('richText' in value) return value.richText.map(rt => rt.text).join('');
        if (value instanceof Date) return value;
    }
    return value;
}

const BLACK_BORDER = {
    top:    { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    left:   { style: 'thin', color: { argb: 'FF000000' } },
    right:  { style: 'thin', color: { argb: 'FF000000' } }
};

function detectDataStart(rows) {
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row && typeof row[2] === 'string' && row[2].trim().toLowerCase() === 'name') {
            return i + 1;
        }
    }
    return 8;
}

class SheetStyler {
    constructor(sheet, rows) {
        this._sheet = sheet;
        this._rows  = rows;
        this.dataStart = detectDataStart(rows);
    }

    apply() {
        const lastRow  = this._rows.length - 1;
        const dataStart = this.dataStart;

        for (let r = 0; r <= lastRow; r++) {
            for (let c = 0; c <= 6; c++) {
                this._setStyle(r, c, {
                    font:      { name: 'Arial', size: 6.75, bold: false },
                    alignment: { horizontal: 'left', vertical: 'top', wrapText: true }
                });
            }
        }

        for (let c = 0; c <= 6; c++) {
            this._setStyle(0, c, { font: { name: 'Arial', size: 9, bold: true }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } });
            this._setStyle(1, c, { font: { name: 'Arial', size: 9, bold: true }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } });
            this._setStyle(2, c, { font: { name: 'Arial', size: 7.5, bold: true }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: BLACK_BORDER });
        }

        for (let r = 4; r <= 5; r++) {
            for (let c = 0; c <= 6; c++) {
                const size = c === 0 ? 7.5 : (c >= 4 && c <= 6) ? 9 : 6.75;
                this._setStyle(r, c, { font: { name: 'Arial', size, bold: c === 0 }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BLACK_BORDER });
            }
        }

        for (let c = 0; c <= 6; c++) {
            this._setStyle(dataStart - 1, c, { font: { name: 'Arial', size: 7.5, bold: true }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: BLACK_BORDER });
        }

        for (let r = dataStart; r <= lastRow; r++) {
            const row    = this._rows[r] || [];
            const hasDept = row[0] != null && String(row[0]).trim() !== '';
            const hasName = row[2] != null && String(row[2]).trim() !== '';

            for (let c = 0; c <= 6; c++) {
                if (hasDept && !hasName) {
                    this._setStyle(r, c, { font: { name: 'Arial', size: 7.5, bold: true }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BLACK_BORDER });
                } else if (hasName) {
                    const size = (c >= 4 && c <= 6) ? 9 : 6.75;
                    this._setStyle(r, c, { font: { name: 'Arial', size, bold: false }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BLACK_BORDER });
                } else {
                    this._setStyle(r, c, { font: { name: 'Arial', size: 6.75, bold: false }, alignment: { horizontal: 'left', vertical: 'top' }, border: BLACK_BORDER });
                }
            }
        }

        this._applyMerges(0, lastRow, dataStart);
        this._setColWidths();
    }

    _setStyle(r, c, style) {
        this._sheet.styles[`${r},${c}`] = style;
    }

    _applyMerges(sectionStart, lastRow, dataStart) {
        const m = this._sheet.merges;
        m.push({ s: { r: sectionStart,     c: 0 }, e: { r: sectionStart,     c: 6 } });
        m.push({ s: { r: sectionStart + 1, c: 0 }, e: { r: sectionStart + 1, c: 6 } });
        m.push({ s: { r: dataStart - 1,    c: 0 }, e: { r: dataStart - 1,    c: 1 } });

        for (let r = dataStart; r <= lastRow; r++) {
            const row = this._rows[r] || [];
            if (row[0] && !row[2]) {
                m.push({ s: { r, c: 0 }, e: { r, c: 1 } });
            }
        }
    }

    _setColWidths() {
        this._sheet.colWidths = [6.14, 16, 13, 13, 13, 13, 13];
    }
}

class MultiDaySheetStyler {
    constructor(sheet, combinedRows, dailySchedules) {
        this._sheet          = sheet;
        this._combinedRows   = combinedRows;
        this._dailySchedules = dailySchedules;
    }

    apply() {
        let rowOffset = 0;

        for (const schedule of this._dailySchedules) {
            const styler = new SheetStyler(this._sheet, this._combinedRows);
            styler.dataStart = detectDataStart(schedule.rows) + rowOffset;

            const sectionEnd = rowOffset + schedule.rows.length - 1;
            styler._applyMerges(rowOffset, sectionEnd, styler.dataStart);

            const dataStart = styler.dataStart;

            for (let r = rowOffset; r <= sectionEnd; r++) {
                const relR   = r - rowOffset;
                const row    = schedule.rows[relR] || [];
                const hasDept = row[0] != null && String(row[0]).trim() !== '';
                const hasName = row[2] != null && String(row[2]).trim() !== '';

                for (let c = 0; c <= 6; c++) {
                    if (relR === 0 || relR === 1) {
                        styler._setStyle(r, c, { font: { name: 'Arial', size: 9, bold: true }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } });
                    } else if (r === dataStart - 1) {
                        styler._setStyle(r, c, { font: { name: 'Arial', size: 7.5, bold: true }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: BLACK_BORDER });
                    } else if (r >= dataStart) {
                        if (hasDept && !hasName) {
                            styler._setStyle(r, c, { font: { name: 'Arial', size: 7.5, bold: true }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BLACK_BORDER });
                        } else if (hasName) {
                            const size = (c >= 4 && c <= 6) ? 9 : 6.75;
                            styler._setStyle(r, c, { font: { name: 'Arial', size, bold: false }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BLACK_BORDER });
                        } else {
                            styler._setStyle(r, c, { font: { name: 'Arial', size: 6.75, bold: false }, alignment: { horizontal: 'left', vertical: 'top' }, border: BLACK_BORDER });
                        }
                    } else {
                        styler._setStyle(r, c, { font: { name: 'Arial', size: 6.75, bold: false }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BLACK_BORDER });
                    }
                }
            }

            rowOffset += schedule.rows.length;
        }

        this._sheet.colWidths = [6.14, 16, 13, 13, 13, 13, 13];
    }
}
