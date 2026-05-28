"use client";

import * as XLSX from "xlsx";
import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  CheckCircle2,
  FileSpreadsheet,
  FolderOpen,
  Pencil,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { ElectricSkeleton } from "@/components/electric-skeleton";
import { EmptyState } from "@/components/empty-state";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type SiteOption = {
  id: string;
  name: string;
  location: string | null;
};

type ColumnMap = {
  sl_no: number;
  description: number;
  unit: number;
  quantity: number;
  rate: number;
  amount: number;
};

type NormalizeResult = {
  column_map: ColumnMap;
  header_row_index: number;
  headline_pattern:
    | "whole_number"
    | "letter_suffix"
    | "no_sl_no_under_headline";
  confidence: number;
  notes: string;
};

type ExtractedSheet = {
  name: string;
  rows: string[][];
  headerRowGuess: number;
  columnCount: number;
};

type WorkbookState = {
  fileName: string;
  sheets: ExtractedSheet[];
  headers: string[];
  sampleRows: string[][];
  columnCount: number;
};

type ParsedHeadline = {
  sl_no: string;
  title: string;
  sort_order: number;
  lineItems: Array<{
    sl_no: string;
    description: string;
    unit: string | null;
    quantity: number | null;
    rate: number | null;
    amount: number | null;
  }>;
};

const canonicalFields: Array<keyof ColumnMap> = [
  "sl_no",
  "description",
  "unit",
  "quantity",
  "rate",
  "amount",
];

function isExcelFile(file: File) {
  return (
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.name.toLowerCase().endsWith(".xls")
  );
}

function normalizeCell(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeRows(rows: unknown[][]) {
  return rows.map((row) => row.map((cell) => normalizeCell(cell)));
}

function detectHeaderRow(rows: string[][]) {
  for (let rowIndex = 0; rowIndex < Math.min(10, rows.length); rowIndex += 1) {
    const rowText = rows[rowIndex].join(" ").toLowerCase();

    if (
      rowText.includes("s.no") ||
      rowText.includes("sl.no") ||
      rowText.includes("description")
    ) {
      return rowIndex;
    }
  }

  return 0;
}

function columnLetter(index: number) {
  if (index < 0) {
    return "Absent";
  }

  let value = index + 1;
  let letters = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }

  return letters;
}

function parseNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/,/g, "").replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

function getCell(row: string[], index: number) {
  if (index < 0) {
    return "";
  }

  return normalizeCell(row[index]);
}

function buildHeuristicMap(headers: string[]): NormalizeResult {
  const findIndex = (...patterns: string[]) =>
    headers.findIndex((header) => {
      const lower = header.toLowerCase();
      return patterns.some((pattern) => lower.includes(pattern));
    });

  return {
    column_map: {
      sl_no: findIndex("s.no", "sl.no", "sno"),
      description: findIndex("description", "particular", "item"),
      unit: findIndex("unit", "uom"),
      quantity: findIndex("quantity", "qty"),
      rate: findIndex("rate"),
      amount: findIndex("amount", "total"),
    },
    header_row_index: 0,
    headline_pattern: "whole_number",
    confidence: 0.45,
    notes:
      "Fallback mapping generated locally. Review columns before importing.",
  };
}

function isWholeNumberSlNo(value: string) {
  return /^\d+$/.test(value.trim());
}

function isDecimalSlNo(value: string) {
  return /^\d+\.\d+$/.test(value.trim());
}

function isLetterSuffixSlNo(value: string) {
  return /^\d+\.[a-z]$/i.test(value.trim());
}

function parseSheetRows(
  sheet: ExtractedSheet,
  mapping: NormalizeResult
): ParsedHeadline[] {
  const dataStart = Math.max(mapping.header_row_index + 1, 0);
  const headlines: ParsedHeadline[] = [];
  let currentHeadline: ParsedHeadline | null = null;

  function ensureHeadline(title = "Imported BOQ") {
    if (!currentHeadline) {
      currentHeadline = {
        sl_no: String(headlines.length + 1),
        title,
        sort_order: headlines.length + 1,
        lineItems: [],
      };
      headlines.push(currentHeadline);
    }

    return currentHeadline;
  }

  function pushHeadline(slNo: string, title: string) {
    currentHeadline = {
      sl_no: slNo,
      title: title || `Item ${slNo}`,
      sort_order: headlines.length + 1,
      lineItems: [],
    };
    headlines.push(currentHeadline);
  }

  for (const row of sheet.rows.slice(dataStart)) {
    const slNo = getCell(row, mapping.column_map.sl_no);
    const description = getCell(row, mapping.column_map.description);
    const unit = getCell(row, mapping.column_map.unit);
    const quantity = parseNumber(getCell(row, mapping.column_map.quantity));
    const rate = parseNumber(getCell(row, mapping.column_map.rate));
    const amount =
      parseNumber(getCell(row, mapping.column_map.amount)) ??
      (quantity !== null && rate !== null ? quantity * rate : null);

    if (!slNo && !description) {
      continue;
    }

    const hasCommercialData =
      unit.length > 0 || quantity !== null || rate !== null || amount !== null;
    const isHeadlineWithoutSlNo =
      mapping.headline_pattern === "no_sl_no_under_headline" &&
      description.length > 0 &&
      !hasCommercialData;
    const isNumberHeadline =
      mapping.headline_pattern !== "no_sl_no_under_headline" &&
      isWholeNumberSlNo(slNo);

    if (isHeadlineWithoutSlNo || isNumberHeadline) {
      pushHeadline(slNo || String(headlines.length + 1), description);
      continue;
    }

    const isLineItem =
      mapping.headline_pattern === "letter_suffix"
        ? isLetterSuffixSlNo(slNo) || hasCommercialData
        : isDecimalSlNo(slNo) || hasCommercialData || !slNo;

    if (!isLineItem || !description) {
      continue;
    }

    ensureHeadline().lineItems.push({
      sl_no: slNo,
      description,
      unit: unit || null,
      quantity,
      rate,
      amount,
    });
  }

  return headlines.filter(
    (headline) => headline.title || headline.lineItems.length > 0
  );
}

async function insertInChunks(
  rows: Array<Record<string, string | number | null>>,
  table: "boq_line_items",
  chunkSize = 400
) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export default function BoqPage() {
  const router = useRouter();
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [isLoadingSites, setIsLoadingSites] = useState(true);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<WorkbookState | null>(null);
  const [aiMap, setAiMap] = useState<NormalizeResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [selectedSiteId, sites]
  );

  const columnOptions = useMemo(() => {
    const count = Math.max(workbook?.columnCount ?? 0, 8);
    return Array.from({ length: count }, (_, index) => index);
  }, [workbook?.columnCount]);

  async function loadSites() {
    setIsLoadingSites(true);
    const { data, error } = await supabase
      .from("sites")
      .select("id,name,location")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(`Could not load sites: ${error.message}`);
      setSites([]);
      setIsLoadingSites(false);
      return;
    }

    const nextSites = data ?? [];
    setSites(nextSites);
    setSelectedSiteId((current) => current || nextSites[0]?.id || "");
    setIsLoadingSites(false);
  }

  useEffect(() => {
    let isMounted = true;

    queueMicrotask(() => {
      if (isMounted) {
        loadSites();
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  async function analyzeWithAI(nextWorkbook: WorkbookState) {
    setIsAnalyzing(true);
    setAiMap(null);

    try {
      const response = await fetch("/api/ai/normalize-boq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headers: nextWorkbook.headers,
          sample_rows: nextWorkbook.sampleRows,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "AI normalization failed.");
      }

      setAiMap(payload as NormalizeResult);
      toast.success("BOQ Normalizer mapped the workbook.");
    } catch (error) {
      const fallback = buildHeuristicMap(nextWorkbook.headers);
      setAiMap(fallback);
      toast.error(
        error instanceof Error
          ? `AI mapping failed: ${error.message}`
          : "AI mapping failed. Using fallback map."
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    if (!isExcelFile(file)) {
      toast.error("Please upload an .xlsx or .xls BOQ file.");
      return;
    }

    setSelectedFile(file);
    setWorkbook(null);
    setAiMap(null);

    try {
      const buffer = await file.arrayBuffer();
      const parsedWorkbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
      const sheets = parsedWorkbook.SheetNames.map((sheetName) => {
        const worksheet = parsedWorkbook.Sheets[sheetName];
        const rows = normalizeRows(
          XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
            header: 1,
            blankrows: false,
            raw: false,
          })
        );
        const columnCount = Math.max(0, ...rows.map((row) => row.length));

        return {
          name: sheetName,
          rows,
          headerRowGuess: detectHeaderRow(rows),
          columnCount,
        };
      }).filter((sheet) => sheet.rows.length > 0);

      if (sheets.length === 0) {
        toast.error("No usable sheets found in that workbook.");
        return;
      }

      const firstSheet = sheets[0];
      const headers = firstSheet.rows[firstSheet.headerRowGuess] ?? [];
      const nextWorkbook = {
        fileName: file.name,
        sheets,
        headers,
        sampleRows: firstSheet.rows.slice(0, 10),
        columnCount: Math.max(...sheets.map((sheet) => sheet.columnCount)),
      };

      setWorkbook(nextWorkbook);
      toast.success("BOQ workbook loaded.");
      await analyzeWithAI(nextWorkbook);
    } catch {
      toast.error("Could not read that Excel file.");
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files[0]);
  }

  function updateColumnMap(field: keyof ColumnMap, value: number) {
    setAiMap((current) =>
      current
        ? {
            ...current,
            column_map: {
              ...current.column_map,
              [field]: value,
            },
          }
        : current
    );
  }

  async function handleConfirmImport() {
    if (!workbook || !aiMap || !selectedSiteId) {
      toast.error("Select a site and upload a mapped BOQ first.");
      return;
    }

    setIsImporting(true);

    try {
      let importedItems = 0;

      for (const sheet of workbook.sheets) {
        const headlines = parseSheetRows(sheet, aiMap);

        if (headlines.length === 0) {
          continue;
        }

        const { data: insertedPackage, error: packageError } = await supabase
          .from("packages")
          .insert({
            site_id: selectedSiteId,
            name:
              workbook.sheets.length > 1
                ? sheet.name
                : workbook.fileName.replace(/\.(xlsx|xls)$/i, ""),
          })
          .select("id")
          .single();

        if (packageError || !insertedPackage) {
          throw new Error(packageError?.message ?? "Package insert failed.");
        }

        for (const headline of headlines) {
          const { data: insertedHeadline, error: headlineError } =
            await supabase
              .from("boq_headlines")
              .insert({
                package_id: insertedPackage.id,
                sl_no: headline.sl_no,
                title: headline.title,
                sort_order: headline.sort_order,
              })
              .select("id")
              .single();

          if (headlineError || !insertedHeadline) {
            throw new Error(headlineError?.message ?? "Headline insert failed.");
          }

          const rows = headline.lineItems.map((lineItem) => ({
            headline_id: insertedHeadline.id,
            sl_no: lineItem.sl_no,
            description: lineItem.description,
            unit: lineItem.unit,
            quantity: lineItem.quantity,
            rate: lineItem.rate,
            amount: lineItem.amount,
          }));

          importedItems += rows.length;
          await insertInChunks(rows, "boq_line_items");
        }
      }

      if (importedItems === 0) {
        toast.error("No BOQ line items were found with this mapping.");
        return;
      }

      toast.success(`Imported ${importedItems.toLocaleString("en-IN")} BOQ items.`);
      router.push(`/boq/${selectedSiteId}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Import failed: ${error.message}`
          : "Import failed."
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-slate-400">
            <FileSpreadsheet className="size-4 text-[var(--accent)]" />
            BOQ import workspace
          </p>
          <h1 className="bg-gradient-to-r from-white via-blue-100 to-fuchsia-200 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            BOQ Normalizer
          </h1>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl sm:flex-row sm:items-center">
          <select
            value={selectedSiteId}
            onChange={(event) => setSelectedSiteId(event.target.value)}
            className="h-10 min-w-72 rounded-xl border border-white/10 bg-[#0b0d14] px-3 text-sm text-white outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
            disabled={isLoadingSites || sites.length === 0}
          >
            {sites.length === 0 ? (
              <option value="">No sites available</option>
            ) : (
              sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))
            )}
          </select>
          <Button
            variant="outline"
            className="h-10 gap-2 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            disabled={!selectedSiteId}
            onClick={() => router.push(`/boq/${selectedSiteId}`)}
          >
            <FolderOpen className="size-4" />
            View Imported BOQ
          </Button>
          <Button
            className="h-10 gap-2 bg-[var(--brand)] text-white hover:bg-blue-500"
            disabled={!selectedSiteId}
            onClick={() => setIsImportOpen(true)}
          >
            <UploadCloud className="size-4" />
            Import BOQ
          </Button>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <GlassCard className="p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-white">
                Selected site
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                BOQ packages will be attached to this project.
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-blue-400/20 bg-blue-400/10 text-blue-200"
            >
              Live
            </Badge>
          </div>

          {isLoadingSites ? (
            <ElectricSkeleton rows={2} />
          ) : selectedSite ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-lg font-medium text-white">
                {selectedSite.name}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {selectedSite.location || "Location not set"}
              </p>
            </div>
          ) : (
            <EmptyState
              title="No sites available"
              description="Seed demo data or create a site before importing a BOQ workbook."
            />
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/10">
              <Bot className="size-5 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-white">
                Agent #4: BOQ Normalizer
              </h2>
              <p className="text-sm text-slate-500">
                Detects sheets, S.No headers, shifted columns, units,
                quantities, rates, and amounts.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {["Find headers", "Map columns", "Structure BOQ"].map((step) => (
              <div
                key={step}
                className="rounded-xl border border-white/10 bg-black/20 p-3"
              >
                <CheckCircle2 className="mb-3 size-4 text-blue-300" />
                <p className="text-sm font-medium text-white">{step}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </section>

      {isImportOpen ? (
        <GlassCard className="p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-white">
                Import BOQ Excel
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Upload `.xlsx` or `.xls`; BOQ.ai will ask the Normalizer agent
                to map columns before import.
              </p>
            </div>
            {selectedFile ? (
              <Badge
                variant="outline"
                className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
              >
                File ready
              </Badge>
            ) : null}
          </div>

          <label
            className={cn(
              "flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center transition",
              isDragging &&
                "border-[var(--accent)] bg-fuchsia-500/10 shadow-[0_0_40px_rgba(217,70,239,0.2)]"
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={handleFileInput}
            />
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
              <UploadCloud className="size-7 text-blue-300" />
            </div>
            <p className="text-lg font-medium text-white">
              Drop BOQ Excel here
            </p>
            <p className="mt-2 max-w-md text-sm text-slate-400">
              Or click to browse. The first sheet sample goes to the BOQ
              Normalizer agent.
            </p>
          </label>

          {isAnalyzing ? (
            <div className="mt-5 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="ai-status-dot" />
                <p className="font-medium text-white">
                  AI is analyzing your BOQ format...
                </p>
              </div>
              <div className="grid gap-3">
                <div className="shimmer h-4 w-2/3 rounded-full bg-white/10" />
                <div className="shimmer h-4 w-1/2 rounded-full bg-white/10" />
                <div className="shimmer h-4 w-5/6 rounded-full bg-white/10" />
              </div>
            </div>
          ) : null}

          {workbook && selectedFile ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm text-slate-500">Selected file</p>
                <p className="mt-1 font-medium text-white">
                  {selectedFile.name}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {workbook.sheets.length} sheet
                  {workbook.sheets.length === 1 ? "" : "s"} detected,{" "}
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button
                className="h-full min-h-20 gap-2 bg-gradient-to-r from-[var(--brand)] to-[var(--accent)] px-6 text-white hover:opacity-90"
                disabled={!aiMap || isImporting}
                onClick={handleConfirmImport}
              >
                <Sparkles className="size-4" />
                {isImporting ? "Importing..." : "Confirm & Import"}
              </Button>
            </div>
          ) : null}

          {aiMap ? (
            <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-white">
                      AI column map
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Confidence {(aiMap.confidence * 100).toFixed(0)}% ·{" "}
                      {aiMap.headline_pattern}
                    </p>
                  </div>
                  <Pencil className="size-4 text-slate-500" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {canonicalFields.map((field) => (
                    <div
                      key={field}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                    >
                      <label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">
                        {field.replace("_", " ")}
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 min-w-12 items-center justify-center rounded-lg bg-blue-500/15 text-sm font-semibold text-blue-200">
                          {columnLetter(aiMap.column_map[field])}
                        </span>
                        <select
                          value={aiMap.column_map[field]}
                          onChange={(event) =>
                            updateColumnMap(field, Number(event.target.value))
                          }
                          className="h-9 w-full rounded-lg border border-white/10 bg-[#0b0d14] px-2 text-sm text-white outline-none focus:border-blue-400/60"
                        >
                          <option value={-1}>Absent</option>
                          {columnOptions.map((index) => (
                            <option key={index} value={index}>
                              {columnLetter(index)} ·{" "}
                              {workbook?.headers[index] || `Column ${index + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">
                  {aiMap.notes}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <h3 className="mb-4 font-semibold text-white">
                  Excel to BOQ diagram
                </h3>
                <div className="grid gap-2">
                  {canonicalFields.map((field) => (
                    <div
                      key={field}
                      className="grid grid-cols-[4rem_1fr] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                    >
                      <span className="rounded-lg bg-white/10 px-3 py-2 text-center text-sm font-semibold text-white">
                        {columnLetter(aiMap.column_map[field])}
                      </span>
                      <span className="text-sm capitalize text-slate-300">
                        {field.replace("_", " ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </GlassCard>
      ) : null}
    </div>
  );
}
