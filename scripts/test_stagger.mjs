import { scheduleBreaks } from "../src/core/BreakScheduler.js";
import { DEFAULT_GROUPS } from "../src/core/constants.js";
import XLSX from "xlsx";

const wb = XLSX.readFile("_Report Output_Custom Daily Schedule_194130_2026-04-27T10_49_49.281.xlsx");
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });

// Mimic ExcelFacade.deleteColumnD: drop index 3 from each row.
for (let i = 0; i < rows.length; i++) {
  if (rows[i] && rows[i].length > 3) rows[i].splice(3, 1);
}

// Mimic _detectDataStart: find row where row[2] === 'Name', return next index.
let dataStart = 8;
for (let i = 0; i < rows.length; i++) {
  if (rows[i] && typeof rows[i][2] === "string" && rows[i][2].trim().toLowerCase() === "name") {
    dataStart = i + 1;
    break;
  }
}
console.log("dataStart:", dataStart);

const result = scheduleBreaks(rows, {
  operatingHours: { startTime: 6 * 60, endTime: 21 * 60 + 30 },
  groups: DEFAULT_GROUPS,
  advancedSettings: { maxEarly: 60, maxDelay: 45, deptWeightMultiplier: 4, proximityWeight: 1, idealMealOffset: 270 },
  enableLogging: false,
  dataStart,
  shiftColumnIndex: 3
});

const target = ["Cashier", "Action Sports", "Camping", "Stocking", "Footwear", "Clothing"];
const fmt = (m) => {
  if (m == null) return "";
  let h = Math.floor(m / 60), mm = m % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2, "0")}${ap}`;
};
const grouped = {};
const seen = new Set();
for (const seg of result.segments) {
  if (!target.includes(seg.job)) continue;
  if (seen.has(seg.name)) continue;
  seen.add(seg.name);
  grouped[seg.job] = grouped[seg.job] || [];
  grouped[seg.job].push(seg);
}
for (const job of target) {
  if (!grouped[job]) continue;
  console.log("\n=== " + job + " ===");
  for (const seg of grouped[job]) {
    const b = result.breaks[seg.name] || {};
    console.log(`  ${seg.name.padEnd(28)} ${fmt(seg.start)}-${fmt(seg.end)}  r1=${fmt(b.rest1).padEnd(8)} meal=${fmt(b.meal).padEnd(8)} r2=${fmt(b.rest2).padEnd(8)} r3=${fmt(b.rest3)}`);
  }
}
