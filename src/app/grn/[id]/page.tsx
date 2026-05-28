"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  FileCheck,
  FileText,
  PackageCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/glass-card";
import { GrnDcDialog, type GrnDc } from "@/components/grn-dc-dialog";
import {
  GrnLineDocsDialog,
  type GrnLineDoc,
} from "@/components/grn-line-docs-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchMaterialComplianceMap,
  type MaterialComplianceMap,
} from "@/lib/material-compliance";
import { supabase } from "@/lib/supabase";

type GrnInvoice = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  grn_date: string | null;
  total_amount: number | null;
  source_file_path: string | null;
  status: string | null;
  ai_extracted_raw: unknown;
  grn_invoice_dc: GrnDc | GrnDc[] | null;
};

type GrnLine = {
  id: string;
  material_id: string | null;
  material_name: string | null;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  gst_rate: number | null;
  amount_with_gst: number | null;
  ai_match_confidence: number | null;
};

function formatAmount(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function rawText(raw: unknown, key: string) {
  if (!raw || typeof raw !== "object" || !(key in raw)) return "";
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function fileNameFromPath(filePath: string | null | undefined) {
  if (!filePath) return "";
  return filePath.split("/").pop() || filePath;
}

function fileExtension(file: File) {
  return file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() || "bin" : "bin";
}

function sourceInvoiceStoragePath(invoiceId: string, file: File) {
  return `grn-invoices/${invoiceId}/source_invoice_${Date.now()}.${fileExtension(file)}`;
}

export default function GrnDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<GrnInvoice | null>(null);
  const [lines, setLines] = useState<GrnLine[]>([]);
  const [lineDocs, setLineDocs] = useState<GrnLineDoc[]>([]);
  const [libMap, setLibMap] = useState<MaterialComplianceMap>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingSourceInvoice, setIsUploadingSourceInvoice] = useState(false);

  const vendorName = useMemo(
    () => rawText(invoice?.ai_extracted_raw, "vendor_name") || "Unknown vendor",
    [invoice?.ai_extracted_raw]
  );

  async function openSourceInvoice() {
    if (!invoice?.source_file_path) {
      toast.error("No source invoice file is attached to this GRN.");
      return;
    }

    const { data, error } = await supabase.storage
      .from("boqai-docs")
      .createSignedUrl(invoice.source_file_path, 60 * 30);

    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not open source invoice.");
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  async function uploadSourceInvoice(file: File) {
    if (!invoice) return;

    setIsUploadingSourceInvoice(true);

    try {
      const nextPath = sourceInvoiceStoragePath(invoice.id, file);
      const upload = await supabase.storage.from("boqai-docs").upload(nextPath, file, {
        contentType: file.type || undefined,
        upsert: false,
      });

      if (upload.error) throw new Error(upload.error.message);

      const previousPath = invoice.source_file_path;
      const { error } = await supabase
        .from("grn_invoices")
        .update({ source_file_path: nextPath })
        .eq("id", invoice.id);

      if (error) throw new Error(error.message);

      const { error: dcError } = await supabase.from("grn_invoice_dc").upsert(
        {
          grn_invoice_id: invoice.id,
          is_applicable: true,
          is_uploaded: true,
          file_path: nextPath,
          file_name: file.name,
          uploaded_at: new Date().toISOString(),
          document_date: invoice.invoice_date,
        },
        { onConflict: "grn_invoice_id" }
      );

      if (dcError) throw new Error(dcError.message);

      if (previousPath) {
        await supabase.storage.from("boqai-docs").remove([previousPath]);
      }

      await loadGrn();
      toast.success("Source invoice uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invoice upload failed.");
    } finally {
      setIsUploadingSourceInvoice(false);
    }
  }

  function handleSourceInvoiceInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) uploadSourceInvoice(file);
  }

  const loadGrn = useCallback(async () => {
    setIsLoading(true);
    const [invoiceResult, linesResult] = await Promise.all([
      supabase
        .from("grn_invoices")
        .select(
          "id,invoice_number,invoice_date,grn_date,total_amount,source_file_path,status,ai_extracted_raw,grn_invoice_dc(id,grn_invoice_id,is_applicable,is_uploaded,file_path,file_name,document_date,uploaded_at)"
        )
        .eq("id", params.id)
        .maybeSingle(),
      supabase
        .from("grn_line_items")
        .select(
          "id,material_id,material_name,quantity,unit,rate,gst_rate,amount_with_gst,ai_match_confidence"
        )
        .eq("grn_invoice_id", params.id)
        .order("id", { ascending: true }),
    ]);

    if (invoiceResult.error) {
      toast.error(`Could not load GRN: ${invoiceResult.error.message}`);
    } else {
      setInvoice(invoiceResult.data as GrnInvoice | null);
    }

    const lineRows = (linesResult.data ?? []) as GrnLine[];

    if (linesResult.error) {
      toast.error(`Could not load line items: ${linesResult.error.message}`);
      setLines([]);
      setLineDocs([]);
      setLibMap(new Map());
    } else {
      setLines(lineRows);

      const lineIds = lineRows.map((line) => line.id);
      const materialIds = Array.from(
        new Set(
          lineRows
            .map((line) => line.material_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      const [docsResult, nextLibMap] = await Promise.all([
        lineIds.length > 0
          ? supabase
              .from("grn_line_item_documents")
              .select(
                "id,grn_line_item_id,document_type,is_applicable,is_uploaded,file_path,file_name,document_date,uploaded_at,ai_audit"
              )
              .in("grn_line_item_id", lineIds)
          : Promise.resolve({ data: [], error: null }),
        fetchMaterialComplianceMap(supabase, materialIds),
      ]);

      if (docsResult.error) {
        toast.error(`Could not load line item documents: ${docsResult.error.message}`);
        setLineDocs([]);
      } else {
        setLineDocs((docsResult.data ?? []) as GrnLineDoc[]);
      }

      setLibMap(nextLibMap);
    }

    setIsLoading(false);
  }, [params.id]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) loadGrn();
    });
    return () => {
      mounted = false;
    };
  }, [loadGrn]);

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="outline"
          className="mb-4 gap-2 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
          onClick={() => router.push("/grn")}
        >
          <ArrowLeft className="size-4" />
          Back to GRNs
        </Button>
        <p className="mb-2 flex items-center gap-2 text-sm text-slate-400">
          <PackageCheck className="size-4 text-[var(--accent)]" />
          Read-only GRN detail
        </p>
        <h1 className="bg-gradient-to-r from-white via-blue-100 to-fuchsia-200 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
          {invoice?.invoice_number ?? "GRN Detail"}
        </h1>
      </div>

      <GlassCard className="p-5">
        {isLoading ? (
          <div className="grid gap-3">
            <div className="shimmer h-5 w-64 rounded bg-white/10" />
            <div className="shimmer h-20 rounded-xl bg-white/10" />
          </div>
        ) : invoice ? (
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 md:col-span-2">
              <p className="text-sm text-slate-500">Vendor</p>
              <p className="mt-1 font-medium text-white">{vendorName}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-slate-500">Invoice Date</p>
              <p className="mt-1 font-medium text-white">
                {invoice.invoice_date || "-"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-slate-500">Total</p>
              <p className="mt-1 font-medium text-white">
                {formatAmount(invoice.total_amount)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 md:col-span-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm text-slate-500">Delivery Challan</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Upload or mark the invoice-level DC as not applicable.
                  </p>
                </div>
                <GrnDcDialog
                  invoiceId={invoice.id}
                  invoiceNumber={invoice.invoice_number}
                  grnDate={invoice.grn_date}
                  vendorName={vendorName}
                  dc={invoice.grn_invoice_dc}
                  onChanged={loadGrn}
                  className="max-w-72"
                />
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 md:col-span-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm text-slate-500">Source invoice</p>
                  <p className="mt-1 flex items-center gap-2 text-sm font-medium">
                    {invoice.source_file_path ? (
                      <>
                        <FileCheck className="size-4 text-emerald-300" />
                        <span className="text-emerald-200">
                          Invoice Uploaded
                        </span>
                        <span className="break-all text-slate-400">
                          {fileNameFromPath(invoice.source_file_path)}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="size-4 text-slate-400" />
                        <span className="text-slate-300">Invoice Pending</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {invoice.source_file_path ? (
                    <Button
                      variant="outline"
                      className="h-9 gap-2 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                      onClick={openSourceInvoice}
                    >
                      <Eye className="size-4" />
                      View source invoice
                    </Button>
                  ) : null}
                  <label>
                    <input
                      type="file"
                      className="sr-only"
                      accept=".pdf,.png,.jpg,.jpeg,image/*"
                      onChange={handleSourceInvoiceInput}
                      disabled={isUploadingSourceInvoice}
                    />
                    <span className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10">
                      <Upload className="size-4" />
                      {isUploadingSourceInvoice
                        ? "Uploading..."
                        : invoice.source_file_path
                          ? "Replace invoice"
                          : "Upload invoice"}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-slate-400">GRN not found.</p>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white">
            <FileText className="size-5 text-blue-300" />
            Line items
          </h2>
          <Badge
            variant="outline"
            className="border-white/10 bg-white/5 text-slate-300"
          >
            {lines.length} rows
          </Badge>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Material</th>
                <th className="px-4 py-3 text-right font-medium">Docs</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 text-right font-medium">Rate</th>
                <th className="px-4 py-3 text-right font-medium">GST</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-right font-medium">AI Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {lines.map((line) => (
                <tr key={line.id} className="text-slate-300">
                  <td className="px-4 py-3 text-white">
                    {line.material_name || "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <GrnLineDocsDialog
                      line={line}
                      docs={lineDocs.filter((doc) => doc.grn_line_item_id === line.id)}
                      libMap={libMap}
                      onChanged={loadGrn}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatAmount(line.quantity)}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {line.unit || "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatAmount(line.rate)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatAmount(line.gst_rate)}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatAmount(line.amount_with_gst)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {line.ai_match_confidence !== null
                      ? `${Math.round(line.ai_match_confidence * 100)}%`
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
