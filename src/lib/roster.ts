import * as XLSX from "xlsx";

export interface RosterRow {
  studentNum: number;
  name: string;
}

const SAMPLE_ROWS: (string | number)[][] = [
  ["번호", "이름"],
  [1, "홍길동"],
  [2, "김철수"],
];

/** 학생 명단 일괄 등록용 엑셀 양식을 만들어 바로 다운로드한다. */
export function downloadRosterSample() {
  const ws = XLSX.utils.aoa_to_sheet(SAMPLE_ROWS);
  ws["!cols"] = [{ wch: 8 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "학생명단");
  XLSX.writeFile(wb, "학생명단_샘플.xlsx");
}

/** "번호"/"이름" 헤더가 있으면 그대로 쓰고, 없으면 첫 두 열을 순서대로 번호/이름으로 본다. */
export async function parseRosterExcel(file: File): Promise<RosterRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const result: RosterRow[] = [];

  for (const row of rows) {
    const values = Object.values(row);
    const numRaw = row["번호"] !== undefined && row["번호"] !== "" ? row["번호"] : values[0];
    const nameRaw = row["이름"] !== undefined && row["이름"] !== "" ? row["이름"] : values[1];

    const studentNum = Number(numRaw);
    const name = String(nameRaw ?? "").trim();
    if (!Number.isInteger(studentNum) || studentNum < 1 || !name) continue;
    result.push({ studentNum, name });
  }

  return result;
}
