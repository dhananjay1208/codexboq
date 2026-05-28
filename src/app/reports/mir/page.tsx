"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PDFDocument, rgb } from "pdf-lib";
import * as XLSX from "xlsx-js-style";
import { toast } from "sonner";
import { ElectricTableSkeleton } from "@/components/electric-skeleton";
import { EmptyState } from "@/components/empty-state";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  docStatusYN,
  effectiveDocStatus,
  type DocType,
  type LibSlot,
  type LineDoc,
} from "@/lib/material-compliance";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Site = {
  id: string;
  name: string;
};

type ComplianceAudit = {
  flags?: string[] | null;
};

type ComplianceDoc = {
  id: string;
  material_id: string;
  doc_type: DocType;
  status: "pending" | "uploaded" | "not_applicable" | "flagged";
  file_path: string | null;
  file_name: string | null;
  ai_audit: ComplianceAudit | null;
};

type GrnLineItem = {
  id: string;
  material_id: string | null;
  material_name: string | null;
  quantity: number | null;
  unit: string | null;
};

type GrnInvoice = {
  id: string;
  invoice_number: string | null;
  grn_date: string | null;
  source_file_path: string | null;
  grn_line_items: GrnLineItem[] | null;
};

type GrnDc = {
  is_applicable: boolean;
  is_uploaded: boolean;
  file_path: string | null;
  file_name: string | null;
};

type GrnLineItemDocument = LineDoc & {
  grn_line_item_id: string;
  document_type: "mir" | DocType;
  ai_audit: ComplianceAudit | null;
};

type MatrixInvoice = GrnInvoice & {
  invoice_date: string | null;
  grn_invoice_dc: GrnDc | GrnDc[] | null;
};

type MirOption = {
  value: string;
  label: string;
  mirNumber: number;
  formattedDate: string;
};

type MirRow = {
  sno: number;
  material: string;
  qty: number | null;
  unit: string;
  dc: "Y" | "N";
  testCert: "Y" | "N" | "NA";
  tds: "Y" | "N" | "NA";
  notes: string;
};

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

type MatrixStatus = "Y" | "N" | "NA";

type MatrixRow = {
  invoiceNo: string;
  invoiceDate: string;
  description: string;
  totalQty: number;
  unit: string;
  qtyByDate: Map<string, number>;
  dc: MatrixStatus;
  testCert: MatrixStatus;
  tds: MatrixStatus;
  notes: string;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function formatQty(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return value.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

function statusClass(value: "Y" | "N" | "NA") {
  if (value === "Y") return "text-emerald-300";
  if (value === "NA") return "text-amber-300";
  return "text-red-300";
}

function auditFlags(doc: ComplianceDoc | undefined) {
  return doc?.ai_audit?.flags?.filter(Boolean) ?? [];
}

function lineAuditFlags(doc: GrnLineItemDocument | undefined) {
  return doc?.ai_audit?.flags?.filter(Boolean) ?? [];
}

function toLibSlot(doc: ComplianceDoc | undefined): LibSlot {
  if (!doc) return undefined;
  return {
    status: doc.status === "flagged" ? "pending" : doc.status,
    file_path: doc.file_path,
    file_name: doc.file_name,
  };
}

function lineDocStatusYN(
  doc: GrnLineItemDocument | undefined,
  libSlot: LibSlot
): MatrixStatus {
  const fallbackDoc: LineDoc = {
    is_applicable: true,
    is_uploaded: false,
  };
  return docStatusYN(effectiveDocStatus(doc ?? fallbackDoc, libSlot));
}

function combineMatrixStatuses(statuses: MatrixStatus[]): MatrixStatus {
  if (statuses.includes("N")) return "N";
  if (statuses.includes("Y")) return "Y";
  return "NA";
}

function getDcRow(dc: MatrixInvoice["grn_invoice_dc"]) {
  return Array.isArray(dc) ? dc[0] : dc;
}

function dcStatusYN(dc: GrnDc | null | undefined): MatrixStatus {
  if (!dc) return "N";
  if (!dc.is_applicable) return "NA";
  return dc.is_uploaded ? "Y" : "N";
}

function safeSlug(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "site";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function excelDate(value: string | null) {
  return value ? formatDate(value) : "-";
}

function excelQty(value: number) {
  return Number(value.toFixed(3));
}

function excelStatusFont(value: MatrixStatus) {
  if (value === "Y") return { color: { rgb: "047857" }, bold: true };
  if (value === "NA") return { color: { rgb: "B45309" }, bold: true };
  return { color: { rgb: "DC2626" }, bold: true };
}

function drawSignatures(doc: jsPDF, startY: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Prepared by ____________________", 14, startY);
  doc.text("Approved by ____________________", 120, startY);
  doc.setFontSize(8);
  doc.text("Name / Signature / Date", 14, startY + 6);
  doc.text("Name / Signature / Date", 120, startY + 6);
}

function isPdfPath(path: string) {
  return path.toLowerCase().endsWith(".pdf");
}

function isPngPath(path: string) {
  return path.toLowerCase().endsWith(".png");
}

function isJpgPath(path: string) {
  return /\.(jpe?g)$/i.test(path);
}

async function fetchStorageFile(filePath: string) {
  const { data, error } = await supabase.storage
    .from("boqai-docs")
    .createSignedUrl(filePath, 60 * 30);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not sign source invoice.");
  }

  const response = await fetch(data.signedUrl);
  if (!response.ok) {
    throw new Error(`Could not download source invoice: ${response.status}`);
  }

  return response.arrayBuffer();
}

async function appendInvoiceSupportPages(
  reportBytes: ArrayBuffer,
  selectedInvoices: GrnInvoice[]
) {
  const mergedPdf = await PDFDocument.load(reportBytes);
  const seenPaths = new Set<string>();
  let attached = 0;
  let skipped = 0;

  for (const invoice of selectedInvoices) {
    const filePath = invoice.source_file_path;
    if (!filePath || seenPaths.has(filePath)) continue;
    seenPaths.add(filePath);

    try {
      const fileBytes = await fetchStorageFile(filePath);
      const separator = mergedPdf.addPage();
      const { width, height } = separator.getSize();
      separator.drawText("Supporting Invoice", {
        x: 48,
        y: height - 72,
        size: 22,
        color: rgb(0.05, 0.1, 0.2),
      });
      separator.drawText(`Invoice: ${invoice.invoice_number ?? "Unknown"}`, {
        x: 48,
        y: height - 104,
        size: 12,
        color: rgb(0.2, 0.25, 0.35),
      });
      separator.drawText(`Storage: ${filePath}`, {
        x: 48,
        y: height - 124,
        size: 9,
        color: rgb(0.35, 0.4, 0.5),
        maxWidth: width - 96,
      });

      if (isPdfPath(filePath)) {
        const invoicePdf = await PDFDocument.load(fileBytes);
        const copiedPages = await mergedPdf.copyPages(
          invoicePdf,
          invoicePdf.getPageIndices()
        );
        copiedPages.forEach((page) => mergedPdf.addPage(page));
        attached += 1;
        continue;
      }

      const image = isPngPath(filePath)
        ? await mergedPdf.embedPng(fileBytes)
        : isJpgPath(filePath)
          ? await mergedPdf.embedJpg(fileBytes)
          : null;

      if (!image) {
        skipped += 1;
        continue;
      }

      const page = mergedPdf.addPage();
      const pageSize = page.getSize();
      const scale = Math.min(
        (pageSize.width - 72) / image.width,
        (pageSize.height - 72) / image.height
      );
      const imageWidth = image.width * scale;
      const imageHeight = image.height * scale;
      page.drawImage(image, {
        x: (pageSize.width - imageWidth) / 2,
        y: (pageSize.height - imageHeight) / 2,
        width: imageWidth,
        height: imageHeight,
      });
      attached += 1;
    } catch {
      skipped += 1;
    }
  }

  return {
    bytes: await mergedPdf.save(),
    attached,
    skipped,
  };
}

export default function MirReportPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [invoices, setInvoices] = useState<GrnInvoice[]>([]);
  const [complianceDocs, setComplianceDocs] = useState<ComplianceDoc[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [isLoadingSites, setIsLoadingSites] = useState(true);
  const [isLoadingMir, setIsLoadingMir] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingMatrix, setIsGeneratingMatrix] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSites() {
      const { data, error } = await supabase
        .from("sites")
        .select("id,name")
        .order("created_at", { ascending: false });

      if (!mounted) return;
      if (error) {
        toast.error(error.message);
      } else {
        setSites(data ?? []);
        setSelectedSiteId(data?.[0]?.id ?? "");
      }
      setIsLoadingSites(false);
    }

    loadSites();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadMirData() {
      if (!selectedSiteId) {
        setInvoices([]);
        setComplianceDocs([]);
        setSelectedDate("");
        return;
      }

      setIsLoadingMir(true);
      const { data, error } = await supabase
        .from("grn_invoices")
        .select(
          "id,invoice_number,grn_date,source_file_path,grn_line_items(id,material_id,material_name,quantity,unit)"
        )
        .eq("site_id", selectedSiteId)
        .not("grn_date", "is", null)
        .order("grn_date", { ascending: true });

      if (!mounted) return;

      if (error) {
        toast.error(error.message);
        setInvoices([]);
        setComplianceDocs([]);
        setIsLoadingMir(false);
        return;
      }

      const invoiceRows = (data ?? []) as unknown as GrnInvoice[];
      setInvoices(invoiceRows);
      setSelectedDate("");

      const materialIds = Array.from(
        new Set(
          invoiceRows.flatMap((invoice) =>
            (invoice.grn_line_items ?? [])
              .map((line) => line.material_id)
              .filter((id): id is string => Boolean(id))
          )
        )
      );

      if (materialIds.length === 0) {
        setComplianceDocs([]);
        setIsLoadingMir(false);
        return;
      }

      const docsResult = await supabase
        .from("material_compliance_documents")
        .select("id,material_id,doc_type,status,file_path,file_name,ai_audit")
        .in("material_id", materialIds);

      if (!mounted) return;
      if (docsResult.error) {
        toast.error(docsResult.error.message);
        setComplianceDocs([]);
      } else {
        setComplianceDocs((docsResult.data ?? []) as ComplianceDoc[]);
      }
      setIsLoadingMir(false);
    }

    loadMirData();
    return () => {
      mounted = false;
    };
  }, [selectedSiteId]);

  const selectedSite = sites.find((site) => site.id === selectedSiteId);

  const mirOptions = useMemo<MirOption[]>(() => {
    const dates = Array.from(
      new Set(invoices.map((invoice) => invoice.grn_date).filter((date): date is string => Boolean(date)))
    ).sort();

    return dates.map((date, index) => ({
      value: date,
      label: `MIR ${index + 1} - ${formatDate(date)}`,
      mirNumber: index + 1,
      formattedDate: formatDate(date),
    }));
  }, [invoices]);

  const docsByMaterial = useMemo(() => {
    const map = new Map<string, Partial<Record<DocType, ComplianceDoc>>>();

    for (const doc of complianceDocs) {
      const row = map.get(doc.material_id) ?? {};
      row[doc.doc_type] = doc;
      map.set(doc.material_id, row);
    }

    return map;
  }, [complianceDocs]);

  const reportRows = useMemo<MirRow[]>(() => {
    const selectedInvoices = invoices.filter((invoice) => invoice.grn_date === selectedDate);
    let sno = 1;

    return selectedInvoices.flatMap((invoice) =>
      (invoice.grn_line_items ?? []).map((line) => {
        const materialDocs = line.material_id ? docsByMaterial.get(line.material_id) : undefined;
        const testDoc = materialDocs?.test_certificate;
        const tdsDoc = materialDocs?.tds;
        const flags = [...auditFlags(testDoc), ...auditFlags(tdsDoc)];

        return {
          sno: sno++,
          material: line.material_name ?? "Unmapped material",
          qty: line.quantity,
          unit: line.unit ?? "-",
          dc: invoice.source_file_path ? "Y" : "N",
          testCert: docStatusYN(effectiveDocStatus(testDoc)),
          tds: docStatusYN(effectiveDocStatus(tdsDoc)),
          notes: flags.length > 0 ? flags.join("; ") : "-",
        };
      })
    );
  }, [docsByMaterial, invoices, selectedDate]);

  const auditedDocCount = useMemo(() => {
    const selectedMaterialIds = new Set(
      invoices
        .filter((invoice) => invoice.grn_date === selectedDate)
        .flatMap((invoice) => invoice.grn_line_items ?? [])
        .map((line) => line.material_id)
        .filter((id): id is string => Boolean(id))
    );

    return complianceDocs.filter(
      (doc) => selectedMaterialIds.has(doc.material_id) && Boolean(doc.ai_audit)
    ).length;
  }, [complianceDocs, invoices, selectedDate]);

  async function downloadPdf() {
    const selectedMir = mirOptions.find((option) => option.value === selectedDate);

    if (!selectedSite || !selectedMir || reportRows.length === 0) {
      toast.error("Select a MIR with report rows first.");
      return;
    }

    setIsGenerating(true);
    try {
      const doc = new jsPDF({ orientation: "landscape" }) as JsPdfWithAutoTable;
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(59, 130, 246);
      doc.text("BOQ", 14, 16);
      doc.setTextColor(217, 70, 239);
      doc.text(".ai", 27, 16);
      doc.setTextColor(20, 24, 36);
      doc.setFontSize(17);
      doc.text("MATERIAL INSPECTION REPORT", pageWidth / 2, 20, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Site: ${selectedSite.name}`, 14, 32);
      doc.text(`MIR Ref: MIR ${selectedMir.mirNumber}`, 14, 39);
      doc.text(`Date: ${selectedMir.formattedDate}`, 14, 46);

      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(16, 185, 129);
      doc.roundedRect(pageWidth - 111, 28, 97, 14, 3, 3, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(5, 95, 70);
      doc.text(
        `Verified by BOQ.ai Compliance Auditor - ${auditedDocCount} docs audited`,
        pageWidth - 62.5,
        36.5,
        { align: "center", maxWidth: 90 }
      );

      autoTable(doc, {
        startY: 56,
        head: [["S.No", "Material", "Qty", "Unit", "DC", "Test Cert", "TDS", "Notes"]],
        body: reportRows.map((row) => [
          row.sno,
          row.material,
          formatQty(row.qty),
          row.unit,
          row.dc,
          row.testCert,
          row.tds,
          row.notes,
        ]),
        margin: { left: 14, right: 14 },
        styles: {
          font: "helvetica",
          fontSize: 8.5,
          cellPadding: 2.2,
          valign: "middle",
        },
        headStyles: {
          fillColor: [12, 18, 32],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: 13, halign: "center" },
          1: { cellWidth: 76 },
          2: { cellWidth: 23, halign: "right" },
          3: { cellWidth: 20, halign: "center" },
          4: { cellWidth: 16, halign: "center" },
          5: { cellWidth: 23, halign: "center" },
          6: { cellWidth: 18, halign: "center" },
          7: { cellWidth: 78 },
        },
      });

      const finalY = doc.lastAutoTable?.finalY ?? 56;
      drawSignatures(doc, finalY > 175 ? 190 : finalY + 18);

      const selectedInvoices = invoices.filter(
        (invoice) => invoice.grn_date === selectedDate
      );
      const reportBytes = doc.output("arraybuffer");
      const merged = await appendInvoiceSupportPages(reportBytes, selectedInvoices);
      const mergedBuffer = new ArrayBuffer(merged.bytes.byteLength);
      new Uint8Array(mergedBuffer).set(merged.bytes);
      const blob = new Blob([mergedBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeSiteName = selectedSite.name.replace(/[^a-z0-9]+/gi, "_");
      anchor.href = url;
      anchor.download = `MIR_${selectedMir.mirNumber}_${safeSiteName}_${selectedMir.value}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      if (merged.skipped > 0) {
        toast.warning(`${merged.skipped} source invoice file(s) could not be attached.`);
      }
      toast.success(
        `MIR PDF downloaded with ${merged.attached} supporting invoice file(s).`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate PDF.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function downloadMatrixExcel() {
    if (!selectedSiteId || !selectedSite) {
      toast.error("Select a site first.");
      return;
    }

    setIsGeneratingMatrix(true);
    try {
      const invoiceResult = await supabase
        .from("grn_invoices")
        .select(
          "id,invoice_number,invoice_date,grn_date,source_file_path,grn_invoice_dc(is_applicable,is_uploaded,file_path,file_name),grn_line_items(id,material_id,material_name,quantity,unit)"
        )
        .eq("site_id", selectedSiteId)
        .not("grn_date", "is", null)
        .order("grn_date", { ascending: true });

      if (invoiceResult.error) throw new Error(invoiceResult.error.message);

      const matrixInvoices = (invoiceResult.data ?? []) as unknown as MatrixInvoice[];
      const lineItems = matrixInvoices.flatMap((invoice) => invoice.grn_line_items ?? []);
      const lineItemIds = lineItems.map((line) => line.id);
      const materialIds = Array.from(
        new Set(
          lineItems
            .map((line) => line.material_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      if (matrixInvoices.length === 0 || lineItems.length === 0) {
        toast.error("No GRN line items found for this site.");
        return;
      }

      const lineDocsByLine = new Map<
        string,
        Partial<Record<"mir" | DocType, GrnLineItemDocument>>
      >();
      if (lineItemIds.length > 0) {
        const docsResult = await supabase
          .from("grn_line_item_documents")
          .select(
            "grn_line_item_id,document_type,is_applicable,is_uploaded,file_path,file_name,ai_audit"
          )
          .in("grn_line_item_id", lineItemIds);

        if (docsResult.error) throw new Error(docsResult.error.message);

        for (const doc of (docsResult.data ?? []) as GrnLineItemDocument[]) {
          const current = lineDocsByLine.get(doc.grn_line_item_id) ?? {};
          current[doc.document_type] = doc;
          lineDocsByLine.set(doc.grn_line_item_id, current);
        }
      }

      const libraryDocsByMaterial = new Map<string, Partial<Record<DocType, ComplianceDoc>>>();
      if (materialIds.length > 0) {
        const libraryResult = await supabase
          .from("material_compliance_documents")
          .select("id,material_id,doc_type,status,file_path,file_name,ai_audit")
          .in("material_id", materialIds);

        if (libraryResult.error) throw new Error(libraryResult.error.message);

        for (const doc of (libraryResult.data ?? []) as ComplianceDoc[]) {
          const current = libraryDocsByMaterial.get(doc.material_id) ?? {};
          current[doc.doc_type] = doc;
          libraryDocsByMaterial.set(doc.material_id, current);
        }
      }

      const ascendingDates = Array.from(
        new Set(
          matrixInvoices
            .map((invoice) => invoice.grn_date)
            .filter((date): date is string => Boolean(date))
        )
      ).sort();
      const descendingDates = [...ascendingDates].reverse();
      const mirNumberByDate = new Map(
        ascendingDates.map((date, index) => [date, index + 1])
      );

      const rowMap = new Map<
        string,
        MatrixRow & {
          testStatuses: MatrixStatus[];
          tdsStatuses: MatrixStatus[];
          noteParts: Set<string>;
        }
      >();

      for (const invoice of matrixInvoices) {
        const grnDate = invoice.grn_date;
        if (!grnDate) continue;
        const invoiceDc = dcStatusYN(getDcRow(invoice.grn_invoice_dc));

        for (const line of invoice.grn_line_items ?? []) {
          const materialKey = line.material_id ?? line.material_name ?? line.id;
          const key = `${invoice.id}|${materialKey}`;
          const quantity = Number(line.quantity ?? 0);
          const existing =
            rowMap.get(key) ??
            {
              invoiceNo: invoice.invoice_number ?? "-",
              invoiceDate: excelDate(invoice.invoice_date),
              description: line.material_name ?? "Unmapped material",
              totalQty: 0,
              unit: line.unit ?? "-",
              qtyByDate: new Map<string, number>(),
              dc: invoiceDc,
              testCert: "N" as MatrixStatus,
              tds: "N" as MatrixStatus,
              notes: "-",
              testStatuses: [],
              tdsStatuses: [],
              noteParts: new Set<string>(),
            };

          const docsByType = lineDocsByLine.get(line.id);
          const materialDocs = line.material_id
            ? libraryDocsByMaterial.get(line.material_id)
            : undefined;
          const testDoc = docsByType?.test_certificate;
          const tdsDoc = docsByType?.tds;
          const testLibrary = toLibSlot(materialDocs?.test_certificate);
          const tdsLibrary = toLibSlot(materialDocs?.tds);

          existing.totalQty += quantity;
          existing.qtyByDate.set(
            grnDate,
            (existing.qtyByDate.get(grnDate) ?? 0) + quantity
          );
          existing.testStatuses.push(lineDocStatusYN(testDoc, testLibrary));
          existing.tdsStatuses.push(lineDocStatusYN(tdsDoc, tdsLibrary));

          for (const flag of [
            ...lineAuditFlags(testDoc),
            ...lineAuditFlags(tdsDoc),
            ...auditFlags(materialDocs?.test_certificate),
            ...auditFlags(materialDocs?.tds),
          ]) {
            existing.noteParts.add(flag);
          }

          rowMap.set(key, existing);
        }
      }

      const matrixRows = Array.from(rowMap.values()).map((row) => ({
        ...row,
        totalQty: excelQty(row.totalQty),
        testCert: combineMatrixStatuses(row.testStatuses),
        tds: combineMatrixStatuses(row.tdsStatuses),
        notes: row.noteParts.size > 0 ? Array.from(row.noteParts).join("; ") : "-",
      }));

      const fixedHeaders = ["Invoice No.", "Invoice Date", "Description", "Total Qty", "Unit"];
      const dateHeaders = descendingDates.map(
        (date) => `MIR ${mirNumberByDate.get(date)} \u2014 ${formatDate(date)}`
      );
      const tailHeaders = ["DC", "Test Cert", "TDS", "Notes"];
      const headers = [...fixedHeaders, ...dateHeaders, ...tailHeaders];
      const totalColumns = headers.length;
      const exportDate = todayIso();

      const rows = [
        [
          `MATERIAL INSPECTION REPORT \u2014 ${selectedSite.name}`,
          ...Array(totalColumns - 1).fill(""),
        ],
        [`Exported on ${formatDate(exportDate)}`, ...Array(totalColumns - 1).fill("")],
        [
          ...Array(fixedHeaders.length).fill(""),
          ...dateHeaders,
          ...Array(tailHeaders.length).fill(""),
        ],
        headers,
        ...matrixRows.map((row) => [
          row.invoiceNo,
          row.invoiceDate,
          row.description,
          row.totalQty,
          row.unit,
          ...descendingDates.map((date) => {
            const qty = row.qtyByDate.get(date) ?? 0;
            return qty === 0 ? "" : excelQty(qty);
          }),
          row.dc,
          row.testCert,
          row.tds,
          row.notes,
        ]),
      ];

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: totalColumns - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: totalColumns - 1 } },
      ];
      worksheet["!freeze"] = { xSplit: 0, ySplit: 4 } as never;
      worksheet["!cols"] = [
        { wch: 18 },
        { wch: 15 },
        { wch: 38 },
        { wch: 12 },
        { wch: 10 },
        ...descendingDates.map(() => ({ wch: 16 })),
        { wch: 8 },
        { wch: 12 },
        { wch: 8 },
        { wch: 42 },
      ];

      const border = {
        top: { style: "thin", color: { rgb: "CBD5E1" } },
        bottom: { style: "thin", color: { rgb: "CBD5E1" } },
        left: { style: "thin", color: { rgb: "CBD5E1" } },
        right: { style: "thin", color: { rgb: "CBD5E1" } },
      };

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        for (let colIndex = 0; colIndex < totalColumns; colIndex += 1) {
          const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
          const cell = worksheet[cellAddress] ?? { t: "s", v: "" };
          worksheet[cellAddress] = cell;
          cell.s = {
            font: { name: "Calibri", sz: 10, color: { rgb: "0F172A" } },
            alignment: { vertical: "center", wrapText: true },
            border,
          };

          if (rowIndex === 0) {
            cell.s = {
              ...cell.s,
              font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "334155" } },
              alignment: { horizontal: "center", vertical: "center" },
            };
          } else if (rowIndex === 1) {
            cell.s = {
              ...cell.s,
              font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "475569" } },
              alignment: { horizontal: "center", vertical: "center" },
            };
          } else if (rowIndex === 2 && colIndex >= fixedHeaders.length && colIndex < fixedHeaders.length + descendingDates.length) {
            cell.s = {
              ...cell.s,
              font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "475569" } },
              alignment: { horizontal: "center", vertical: "center", wrapText: true },
            };
          } else if (rowIndex === 3) {
            cell.s = {
              ...cell.s,
              font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "1F4E79" } },
              alignment: { horizontal: "center", vertical: "center", wrapText: true },
            };
          } else if (rowIndex >= 4) {
            const bodyRowNumber = rowIndex - 4;
            if (bodyRowNumber % 2 === 1) {
              cell.s = {
                ...cell.s,
                fill: { fgColor: { rgb: "F2F4F7" } },
              };
            }
            if (colIndex === 3 || (colIndex >= fixedHeaders.length && colIndex < fixedHeaders.length + descendingDates.length)) {
              cell.s = {
                ...cell.s,
                alignment: { horizontal: "right", vertical: "center", wrapText: true },
              };
            }
            if (
              colIndex >= fixedHeaders.length + descendingDates.length &&
              colIndex < fixedHeaders.length + descendingDates.length + 3
            ) {
              cell.s = {
                ...cell.s,
                font: { name: "Calibri", sz: 10, ...excelStatusFont(cell.v as MatrixStatus) },
                alignment: { horizontal: "center", vertical: "center" },
              };
            }
          }
        }
      }

      XLSX.utils.book_append_sheet(workbook, worksheet, "MIR Overview");
      XLSX.writeFile(
        workbook,
        `MIR_Overview_${safeSlug(selectedSite.name)}_${exportDate}.xlsx`
      );

      toast.success(`MIR matrix exported with ${matrixRows.length} material row(s).`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not generate MIR matrix."
      );
    } finally {
      setIsGeneratingMatrix(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-slate-400">
            <FileText className="size-4 text-[var(--accent)]" />
            Material inspection reporting
          </p>
          <h1 className="bg-gradient-to-r from-white via-blue-100 to-fuchsia-200 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            MIR Reports
          </h1>
        </div>
        <Badge
          variant="outline"
          className="w-fit border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-emerald-200"
        >
          <ShieldCheck className="mr-2 size-4" />
          {auditedDocCount} docs audited
        </Badge>
      </header>

      <GlassCard className="p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-200">Site</label>
            <Select
              value={selectedSiteId}
              onValueChange={(value) => setSelectedSiteId(value ?? "")}
            >
              <SelectTrigger className="h-11 w-full border-white/10 bg-black/20 text-white">
                <Building2 className="size-4 text-slate-400" />
                <SelectValue placeholder={isLoadingSites ? "Loading sites..." : "Select site"} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-200">MIR date</label>
            <Select
              value={selectedDate}
              onValueChange={(value) => setSelectedDate(value ?? "")}
              disabled={!selectedSiteId || isLoadingMir || mirOptions.length === 0}
            >
              <SelectTrigger className="h-11 w-full border-white/10 bg-black/20 text-white">
                <SelectValue
                  placeholder={
                    isLoadingMir
                      ? "Loading GRN dates..."
                      : mirOptions.length === 0
                        ? "No GRN dates"
                        : "Select MIR"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {mirOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="h-11 gap-2 bg-[var(--brand)] px-5 text-white hover:bg-blue-500"
            disabled={!selectedDate || reportRows.length === 0 || isGenerating}
            onClick={downloadPdf}
          >
            {isGenerating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Download PDF
          </Button>

          <Button
            variant="outline"
            className="h-11 gap-2 border-white/10 bg-white/[0.04] px-5 text-white hover:bg-white/[0.08]"
            disabled={!selectedSiteId || invoices.length === 0 || isGeneratingMatrix}
            onClick={downloadMatrixExcel}
          >
            {isGeneratingMatrix ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-4" />
            )}
            Download Matrix Excel
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-white/10 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Preview</h2>
            <p className="text-sm text-slate-400">
              {selectedDate && selectedSite
                ? `${selectedSite.name} - ${formatDate(selectedDate)}`
                : "Select a site and MIR date to preview report rows."}
            </p>
          </div>
          {isLoadingMir ? (
            <span className="inline-flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="size-4 animate-spin" />
              Loading
            </span>
          ) : null}
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/[0.04] hover:bg-white/[0.04]">
              <TableHead className="w-16 px-4 text-slate-400">S.No</TableHead>
              <TableHead className="px-4 text-slate-400">Material</TableHead>
              <TableHead className="px-4 text-right text-slate-400">Qty</TableHead>
              <TableHead className="px-4 text-center text-slate-400">Unit</TableHead>
              <TableHead className="px-4 text-center text-slate-400">DC</TableHead>
              <TableHead className="px-4 text-center text-slate-400">Test Cert</TableHead>
              <TableHead className="px-4 text-center text-slate-400">TDS</TableHead>
              <TableHead className="px-4 text-slate-400">Notes</TableHead>
            </TableRow>
          </TableHeader>
          {isLoadingMir ? (
            <ElectricTableSkeleton rows={5} columns={8} />
          ) : (
            <TableBody>
            {reportRows.length === 0 ? (
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableCell colSpan={8} className="px-4 py-5">
                  <EmptyState
                    title={selectedDate ? "No line items found" : "Choose a MIR date"}
                    description={
                      selectedDate
                        ? "This GRN date has no material rows yet. Try the invoice extraction flow to create GRN data."
                        : "Select a GRN date to preview the Material Inspection Report."
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              reportRows.map((row) => (
                <TableRow key={row.sno} className="border-white/10 text-slate-300 hover:bg-white/[0.04]">
                  <TableCell className="px-4 text-slate-400">{row.sno}</TableCell>
                  <TableCell className="max-w-[360px] whitespace-normal px-4 font-medium text-white">
                    {row.material}
                  </TableCell>
                  <TableCell className="px-4 text-right">{formatQty(row.qty)}</TableCell>
                  <TableCell className="px-4 text-center">{row.unit}</TableCell>
                  <TableCell className={cn("px-4 text-center font-semibold", statusClass(row.dc))}>
                    {row.dc}
                  </TableCell>
                  <TableCell className={cn("px-4 text-center font-semibold", statusClass(row.testCert))}>
                    {row.testCert}
                  </TableCell>
                  <TableCell className={cn("px-4 text-center font-semibold", statusClass(row.tds))}>
                    {row.tds}
                  </TableCell>
                  <TableCell className="max-w-[360px] whitespace-normal px-4 text-sm text-slate-400">
                    {row.notes}
                  </TableCell>
                </TableRow>
              ))
            )}
            </TableBody>
          )}
        </Table>
      </GlassCard>
    </div>
  );
}
