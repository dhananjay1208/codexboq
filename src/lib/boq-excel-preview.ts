import * as XLSX from "xlsx";

export type BoqSheetPreview = {
  sheetName: string;
  rowCount: number;
  headerRowIndex: number | null;
  columnOffset: number;
  detectedHeaders: string[];
};

export type BoqWorkbookPreview = {
  fileName: string;
  sheetCount: number;
  sheets: BoqSheetPreview[];
};

function normalizeCell(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim();
}

function findHeaderPosition(rows: unknown[][]) {
  for (let rowIndex = 0; rowIndex < Math.min(10, rows.length); rowIndex += 1) {
    const row = rows[rowIndex];

    if (!row || row.length < 2) {
      continue;
    }

    for (
      let columnIndex = 0;
      columnIndex <= Math.min(4, row.length - 1);
      columnIndex += 1
    ) {
      const cellValue = normalizeCell(row[columnIndex]);

      if (
        cellValue.includes("s.no") ||
        cellValue.includes("sl.no") ||
        cellValue === "sno"
      ) {
        return {
          headerRowIndex: rowIndex,
          columnOffset: columnIndex,
        };
      }
    }
  }

  return {
    headerRowIndex: null,
    columnOffset: 0,
  };
}

function buildHeaderPreview(rows: unknown[][], headerRowIndex: number | null) {
  if (headerRowIndex === null) {
    return [];
  }

  const headerRow = rows[headerRowIndex] ?? [];
  const continuationRow = rows[headerRowIndex + 1] ?? [];
  const headers: string[] = [];

  for (
    let columnIndex = 0;
    columnIndex < Math.min(Math.max(headerRow.length, continuationRow.length), 16);
    columnIndex += 1
  ) {
    const primary = normalizeCell(headerRow[columnIndex]);
    const secondary = normalizeCell(continuationRow[columnIndex]);
    const combined = [primary, secondary].filter(Boolean).join(" ");

    if (combined) {
      headers.push(combined);
    }
  }

  return headers;
}

export async function previewBoqWorkbook(file: File): Promise<BoqWorkbookPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });

  const sheets = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      blankrows: false,
    });
    const { headerRowIndex, columnOffset } = findHeaderPosition(rows);

    return {
      sheetName,
      rowCount: rows.length,
      headerRowIndex,
      columnOffset,
      detectedHeaders: buildHeaderPreview(rows, headerRowIndex),
    };
  });

  return {
    fileName: file.name,
    sheetCount: workbook.SheetNames.length,
    sheets,
  };
}
