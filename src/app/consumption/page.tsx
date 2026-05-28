"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Camera,
  Eye,
  PackageMinus,
  Plus,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { ElectricTableSkeleton } from "@/components/electric-skeleton";
import { EmptyState } from "@/components/empty-state";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { storagePath } from "@/lib/material-compliance";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type SiteOption = { id: string; name: string };
type MasterMaterial = {
  id: string;
  category: string | null;
  name: string;
  unit: string;
};

type ExtractedIssue = {
  entry_mode?: "manual";
  voucher_number: string | null;
  consumption_date: string | null;
  issued_to: string | null;
  site_hint: string | null;
  line_items: Array<{
    description: string;
    quantity: number;
    unit: string;
    notes: string | null;
  }>;
};

type ReviewLine = {
  description: string;
  quantity: string;
  unit: string;
  notes: string;
  material_id: string;
  confidence: number;
  reasoning: string;
  suggested_new: { category: string; name: string; unit: string } | null;
};

type ConsumptionRow = {
  id: string;
  site_id: string;
  material_id: string | null;
  material_name: string;
  quantity: number;
  unit: string;
  consumption_date: string;
  issued_to: string | null;
  notes: string | null;
  source_file_path: string | null;
  ai_extracted_raw: unknown;
  ai_match_confidence: number | null;
  status: string;
  created_at: string;
};

type VoucherGroup = {
  key: string;
  ids: string[];
  date: string;
  voucherNumber: string;
  issuedTo: string;
  itemCount: number;
  totalQty: number;
  sourceFilePath: string | null;
};

const steps = ["Upload", "Extract", "Review"];

function isVoucherFile(file: File) {
  return (
    file.type === "application/pdf" ||
    file.type.startsWith("image/") ||
    /\.(pdf|png|jpe?g|webp)$/i.test(file.name)
  );
}

function fileExtension(file: File) {
  return file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() || "pdf" : "pdf";
}

function fileNameFromPath(filePath: string | null | undefined) {
  if (!filePath) return "-";
  return filePath.split("/").pop() || filePath;
}

function formatQty(value: number | string | null | undefined) {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (parsed === null || parsed === undefined || Number.isNaN(parsed)) return "-";
  return parsed.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

function normalizeUuid(value: string | null | undefined) {
  if (!value || value.toLowerCase() === "null") return null;
  return value;
}

function rawValue(raw: unknown, key: string) {
  if (!raw || typeof raw !== "object" || !(key in raw)) return "";
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function materialConfidenceClass(confidence: number) {
  if (confidence >= 0.85) return "bg-emerald-400";
  if (confidence >= 0.6) return "bg-amber-400";
  return "bg-red-400";
}

export default function ConsumptionPage() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [materials, setMaterials] = useState<MasterMaterial[]>([]);
  const [inventoryMaterialIds, setInventoryMaterialIds] = useState<Set<string>>(new Set());
  const [consumptions, setConsumptions] = useState<ConsumptionRow[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [filePath, setFilePath] = useState("");
  const [signedUrl, setSignedUrl] = useState("");
  const [mime, setMime] = useState("");
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const [isRunningAgents, setIsRunningAgents] = useState(false);
  const [issueForm, setIssueForm] = useState({
    voucher_number: "",
    consumption_date: new Date().toISOString().slice(0, 10),
    issued_to: "",
  });
  const [rawExtraction, setRawExtraction] = useState<ExtractedIssue | null>(null);
  const [reviewLines, setReviewLines] = useState<ReviewLine[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const [newMaterialLine, setNewMaterialLine] = useState<number | null>(null);
  const [newMaterial, setNewMaterial] = useState({
    category: "",
    name: "",
    unit: "",
  });

  const materialById = useMemo(
    () => new Map(materials.map((material) => [material.id, material])),
    [materials]
  );

  const inventoryMaterials = useMemo(
    () => materials.filter((material) => inventoryMaterialIds.has(material.id)),
    [inventoryMaterialIds, materials]
  );

  const voucherGroups = useMemo<VoucherGroup[]>(() => {
    const groups = new Map<string, VoucherGroup>();

    for (const row of consumptions) {
      const voucherNumber =
        rawValue(row.ai_extracted_raw, "voucher_number") ||
        fileNameFromPath(row.source_file_path);
      const key = `${row.source_file_path ?? "manual"}|${row.consumption_date}|${voucherNumber}|${row.issued_to ?? ""}`;
      const existing =
        groups.get(key) ??
        {
          key,
          ids: [],
          date: row.consumption_date,
          voucherNumber,
          issuedTo: row.issued_to || "-",
          itemCount: 0,
          totalQty: 0,
          sourceFilePath: row.source_file_path,
        };

      existing.ids.push(row.id);
      existing.itemCount += 1;
      existing.totalQty += Number(row.quantity) || 0;
      groups.set(key, existing);
    }

    return Array.from(groups.values());
  }, [consumptions]);

  const loadData = useCallback(async () => {
    setIsLoadingData(true);

    const [sitesResult, materialsResult] = await Promise.all([
      supabase
        .from("sites")
        .select("id,name")
        .order("created_at", { ascending: false }),
      supabase
        .from("master_materials")
        .select("id,category,name,unit")
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

    if (sitesResult.error) toast.error(sitesResult.error.message);
    else {
      setSites(sitesResult.data ?? []);
      setSelectedSiteId((current) => current || sitesResult.data?.[0]?.id || "");
    }

    if (materialsResult.error) toast.error(materialsResult.error.message);
    else setMaterials(materialsResult.data ?? []);

    const siteId = selectedSiteId || sitesResult.data?.[0]?.id;
    if (!siteId) {
      setConsumptions([]);
      setInventoryMaterialIds(new Set());
      setIsLoadingData(false);
      return;
    }

    const { data: siteInvoices, error: invoiceError } = await supabase
      .from("grn_invoices")
      .select("id")
      .eq("site_id", siteId);

    if (invoiceError) {
      toast.error(invoiceError.message);
      setInventoryMaterialIds(new Set());
    } else {
      const invoiceIds = (siteInvoices ?? []).map((invoice) => invoice.id as string);
      if (invoiceIds.length === 0) {
        setInventoryMaterialIds(new Set());
      } else {
        const { data: grnLines, error: lineError } = await supabase
          .from("grn_line_items")
          .select("material_id")
          .in("grn_invoice_id", invoiceIds)
          .not("material_id", "is", null);

        if (lineError) {
          toast.error(lineError.message);
          setInventoryMaterialIds(new Set());
        } else {
          setInventoryMaterialIds(
            new Set((grnLines ?? []).map((line) => line.material_id as string))
          );
        }
      }
    }

    const { data, error } = await supabase
      .from("material_consumption")
      .select(
        "id,site_id,material_id,material_name,quantity,unit,consumption_date,issued_to,notes,source_file_path,ai_extracted_raw,ai_match_confidence,status,created_at"
      )
      .eq("site_id", siteId)
      .order("consumption_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) toast.error(error.message);
    else setConsumptions((data ?? []) as ConsumptionRow[]);

    setIsLoadingData(false);
  }, [selectedSiteId]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) loadData();
    });
    return () => {
      mounted = false;
    };
  }, [loadData]);

  function resetWizard() {
    setStep(0);
    setIsDragging(false);
    setUploadedFile(null);
    setFilePath("");
    setSignedUrl("");
    setMime("");
    setAgentLogs([]);
    setIsRunningAgents(false);
    setIssueForm({
      voucher_number: "",
      consumption_date: new Date().toISOString().slice(0, 10),
      issued_to: "",
    });
    setRawExtraction(null);
    setReviewLines([]);
  }

  function openWizard() {
    resetWizard();
    setWizardOpen(true);
  }

  function openManualIssue() {
    resetWizard();
    setRawExtraction({
      entry_mode: "manual",
      voucher_number: null,
      consumption_date: new Date().toISOString().slice(0, 10),
      issued_to: null,
      site_hint: null,
      line_items: [],
    });
    setReviewLines([
      {
        description: "",
        quantity: "",
        unit: "",
        notes: "",
        material_id: "",
        confidence: 1,
        reasoning: "Manual entry.",
        suggested_new: null,
      },
    ]);
    setStep(2);
    setWizardOpen(true);
  }

  function appendLog(message: string) {
    setAgentLogs((current) => [...current, message]);
  }

  async function uploadVoucher(file: File) {
    if (!selectedSiteId) {
      toast.error("Select a site first.");
      return;
    }

    if (!isVoucherFile(file)) {
      toast.error("Upload a PDF, PNG, or JPG issue voucher.");
      return;
    }

    setUploadedFile(file);
    const nextMime =
      file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png");
    const nextPath = storagePath.issueVoucher(selectedSiteId, fileExtension(file));
    const upload = await supabase.storage.from("boqai-docs").upload(nextPath, file, {
      contentType: nextMime,
      upsert: false,
    });

    if (upload.error) {
      toast.error(`Upload failed: ${upload.error.message}`);
      return;
    }

    const signed = await supabase.storage
      .from("boqai-docs")
      .createSignedUrl(nextPath, 60 * 30);

    if (signed.error) {
      toast.error(`Preview failed: ${signed.error.message}`);
      return;
    }

    setFilePath(nextPath);
    setSignedUrl(signed.data.signedUrl);
    setMime(nextMime);
    setStep(1);
    await runAgents(nextPath, nextMime);
  }

  async function runAgents(nextPath: string, nextMime: string) {
    setIsRunningAgents(true);
    setAgentLogs([]);
    appendLog("Issue Vision agent reading voucher...");

    try {
      const extractionResponse = await fetch("/api/ai/extract-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: nextPath, mime: nextMime }),
      });
      const extractionPayload = await extractionResponse.json();
      if (!extractionResponse.ok) {
        throw new Error(extractionPayload.error ?? "Issue voucher extraction failed.");
      }

      const extracted = extractionPayload.parsed as ExtractedIssue;
      setRawExtraction(extracted);
      setIssueForm({
        voucher_number: extracted.voucher_number ?? "",
        consumption_date:
          extracted.consumption_date || new Date().toISOString().slice(0, 10),
        issued_to: extracted.issued_to ?? "",
      });
      appendLog(`Date: ${extracted.consumption_date || "not found"}`);
      appendLog(`Issued to: ${extracted.issued_to || "not found"}`);
      appendLog(`Found ${extracted.line_items.length} items`);
      appendLog("Matching materials...");

      const matchResponse = await fetch("/api/ai/match-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidates: extracted.line_items.map((item) => ({
            description: item.description,
            unit: item.unit,
          })),
        }),
      });
      const matchPayload = await matchResponse.json();
      if (!matchResponse.ok) {
        throw new Error(matchPayload.error ?? "Material matching failed.");
      }

      const matches = matchPayload.parsed.matches as Array<{
        candidate_index: number;
        material_id: string | null;
        suggested_new: { category: string; name: string; unit: string } | null;
        confidence: number;
        reasoning: string;
      }>;
      const lines = extracted.line_items.map((item, index) => {
        const match = matches.find((candidate) => candidate.candidate_index === index);
        return {
          description: item.description,
          quantity: String(item.quantity ?? ""),
          unit: item.unit,
          notes: item.notes ?? "",
          material_id: normalizeUuid(match?.material_id) ?? "",
          confidence: match?.confidence ?? 0,
          reasoning: match?.reasoning ?? "",
          suggested_new: match?.suggested_new ?? null,
        };
      });
      const matched = lines.filter((line) => line.material_id).length;
      setReviewLines(lines);
      appendLog(`Matched ${matched} - Suggested ${lines.length - matched} new`);
      setStep(2);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Material issue wizard failed.");
    } finally {
      setIsRunningAgents(false);
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) uploadVoucher(file);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) uploadVoucher(file);
  }

  function updateLine(index: number, field: keyof ReviewLine, value: string) {
    setReviewLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line
      )
    );
  }

  function addManualLine() {
    setReviewLines((current) => [
      ...current,
      {
        description: "",
        quantity: "",
        unit: "",
        notes: "",
        material_id: "",
        confidence: 1,
        reasoning: "Manual entry.",
        suggested_new: null,
      },
    ]);
  }

  function removeLine(index: number) {
    setReviewLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  function openNewMaterialDialog(index: number) {
    const line = reviewLines[index];
    setNewMaterialLine(index);
    setNewMaterial({
      category: line.suggested_new?.category ?? "Unmapped",
      name: line.suggested_new?.name ?? line.description,
      unit: line.suggested_new?.unit ?? line.unit,
    });
  }

  async function saveNewMaterial() {
    if (newMaterialLine === null) return;

    const { data, error } = await supabase
      .from("master_materials")
      .insert({
        category: newMaterial.category,
        name: newMaterial.name,
        unit: newMaterial.unit,
      })
      .select("id,category,name,unit")
      .single();

    if (error || !data) {
      toast.error(error?.message ?? "Could not create material.");
      return;
    }

    setMaterials((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
    setReviewLines((current) =>
      current.map((line, index) =>
        index === newMaterialLine
          ? {
              ...line,
              material_id: data.id,
              confidence: 1,
              reasoning: "Created as new material.",
              suggested_new: null,
            }
          : line
      )
    );
    setNewMaterialLine(null);
    toast.success("Material created and bound.");
  }

  async function commitConsumption() {
    if (!selectedSiteId) {
      toast.error("Missing site.");
      return;
    }

    setIsCommitting(true);
    try {
      const rows = reviewLines.map((line) => {
        const material = materialById.get(line.material_id);
        return {
          site_id: selectedSiteId,
          material_id: normalizeUuid(line.material_id),
          material_name: material?.name ?? line.description,
          quantity: Number(line.quantity) || 0,
          unit: line.unit,
          consumption_date: issueForm.consumption_date || new Date().toISOString().slice(0, 10),
          issued_to: issueForm.issued_to || null,
          notes: line.notes || null,
          source_file_path: filePath || null,
          ai_extracted_raw: {
            ...(rawExtraction ?? {}),
            voucher_number: issueForm.voucher_number || rawExtraction?.voucher_number || null,
            consumption_date: issueForm.consumption_date,
            issued_to: issueForm.issued_to || null,
          },
          ai_match_confidence: line.confidence,
          status: "committed",
        };
      });

      if (rows.length > 0) {
        const { error } = await supabase.from("material_consumption").insert(rows);
        if (error) throw new Error(error.message);
      }

      toast.success(`Consumption recorded - ${rows.length} entries`);
      setWizardOpen(false);
      resetWizard();
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Commit failed.");
    } finally {
      setIsCommitting(false);
    }
  }

  async function viewSource(filePathToOpen: string | null) {
    if (!filePathToOpen) {
      toast.error("No source file is attached.");
      return;
    }

    const { data, error } = await supabase.storage
      .from("boqai-docs")
      .createSignedUrl(filePathToOpen, 60 * 30);

    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not open source voucher.");
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  async function deleteVoucher(group: VoucherGroup) {
    const confirmed = window.confirm("Delete this material issue and source voucher?");
    if (!confirmed) return;

    try {
      if (group.sourceFilePath) {
        const remove = await supabase.storage
          .from("boqai-docs")
          .remove([group.sourceFilePath]);
        if (remove.error) throw new Error(remove.error.message);
      }

      const { error } = await supabase
        .from("material_consumption")
        .delete()
        .in("id", group.ids);

      if (error) throw new Error(error.message);

      toast.success("Material issue deleted.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete issue.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-slate-400">
            <PackageMinus className="size-4 text-[var(--accent)]" />
            Material issue voucher intake
          </p>
          <h1 className="bg-gradient-to-r from-white via-blue-100 to-fuchsia-200 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            Consumption
          </h1>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl sm:flex-row sm:items-center">
          <select
            value={selectedSiteId}
            onChange={(event) => setSelectedSiteId(event.target.value)}
            className="h-10 min-w-72 rounded-xl border border-white/10 bg-[#0b0d14] px-3 text-sm text-white outline-none focus:border-blue-400/60"
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <Button
            className="h-10 gap-2 bg-[var(--brand)] text-white hover:bg-blue-500"
            onClick={openWizard}
            disabled={!selectedSiteId}
          >
            <Plus className="size-4" />
            Upload Voucher
          </Button>
          <Button
            variant="outline"
            className="h-10 gap-2 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            onClick={openManualIssue}
            disabled={!selectedSiteId || inventoryMaterials.length === 0}
          >
            <PackageMinus className="size-4" />
            Manual Issue
          </Button>
        </div>
      </header>

      <GlassCard className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-white">
            Material issues
          </h2>
          <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">
            {voucherGroups.length} vouchers
          </Badge>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Voucher#</th>
                <th className="px-4 py-3 font-medium">Issued To</th>
                <th className="px-4 py-3 text-right font-medium">Items</th>
                <th className="px-4 py-3 text-right font-medium">Total Qty</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            {isLoadingData ? (
              <ElectricTableSkeleton rows={5} columns={7} />
            ) : (
              <tbody className="divide-y divide-white/10">
                {voucherGroups.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-5">
                      <EmptyState
                        title="No material issues yet"
                        description="Upload a voucher and let Material Issue Vision capture consumption."
                        ctaHref="/consumption"
                        ctaLabel="New Material Issue"
                      />
                    </td>
                  </tr>
                ) : (
                  voucherGroups.map((group) => (
                    <tr key={group.key} className="text-slate-300 hover:bg-white/[0.04]">
                      <td className="px-4 py-3">{group.date}</td>
                      <td className="px-4 py-3 font-medium text-white">{group.voucherNumber}</td>
                      <td className="px-4 py-3 text-slate-400">{group.issuedTo}</td>
                      <td className="px-4 py-3 text-right">{group.itemCount}</td>
                      <td className="px-4 py-3 text-right">{formatQty(group.totalQty)}</td>
                      <td className="max-w-64 truncate px-4 py-3 text-slate-400">
                        {fileNameFromPath(group.sourceFilePath)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-white/10 bg-white/5 text-slate-200"
                            disabled={!group.sourceFilePath}
                            onClick={() => viewSource(group.sourceFilePath)}
                          >
                            <Eye className="size-3.5" />
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-400/20 bg-red-400/10 text-red-100"
                            onClick={() => deleteVoucher(group)}
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            )}
          </table>
        </div>
      </GlassCard>

      <Sheet open={wizardOpen} onOpenChange={setWizardOpen}>
        <SheetContent
          className="w-full max-w-none border-white/10 bg-[#080a10]/95 p-0 backdrop-blur-xl data-[side=right]:w-full data-[side=right]:sm:w-[720px] data-[side=right]:sm:max-w-none data-[side=right]:lg:w-[900px]"
          showCloseButton
        >
          <SheetHeader className="border-b border-white/10 p-5">
            <SheetTitle className="text-xl text-white">
              New Material Issue
            </SheetTitle>
            <SheetDescription>
              Upload voucher {"->"} AI extracts {"->"} AI matches materials {"->"} commit.
              {uploadedFile ? ` Current file: ${uploadedFile.name}.` : ""}
              {step === 2 && !filePath ? " Manual issue: select materials already present in inventory." : ""}
            </SheetDescription>
            <div className="mt-4 flex gap-2">
              {steps.map((label, index) => (
                <div
                  key={label}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    index === step
                      ? "border-blue-400/40 bg-blue-500/15 text-blue-200"
                      : "border-white/10 bg-white/5 text-slate-500"
                  )}
                >
                  {index + 1}. {label}
                </div>
              ))}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5">
            {step === 0 ? (
              <label
                className={cn(
                  "flex min-h-[70vh] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center transition",
                  isDragging && "border-[var(--accent)] bg-fuchsia-500/10"
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
                  accept=".pdf,.png,.jpg,.jpeg,image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={handleFileInput}
                />
                <div className="mb-5 flex items-center gap-3 text-blue-300">
                  <UploadCloud className="size-12" />
                  <Camera className="size-10" />
                </div>
                <p className="text-2xl font-semibold text-white">
                  Scan or upload issue voucher
                </p>
                <p className="mt-2 text-slate-400">
                  Mobile users can take a photo. Desktop users can upload PDF, PNG, or JPG.
                </p>
              </label>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <GlassCard className="min-h-[72vh] overflow-hidden p-0">
                  {mime.includes("pdf") ? (
                    <iframe src={signedUrl} className="h-[72vh] w-full" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={signedUrl} alt="Uploaded voucher" className="h-[72vh] w-full object-contain" />
                  )}
                </GlassCard>
                <div className="space-y-4">
                  <GlassCard className="p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="ai-status-dot" />
                      <h3 className="font-semibold text-white">Agent log</h3>
                    </div>
                    <div className="grid gap-2 font-mono text-sm text-blue-200">
                      {agentLogs.map((log) => (
                        <p key={log} className="typewriter-line">
                          {log}
                        </p>
                      ))}
                      {isRunningAgents ? (
                        <p className="shimmer h-4 w-3/4 rounded bg-white/10" />
                      ) : null}
                    </div>
                  </GlassCard>
                  <GlassCard className="p-5">
                    <h3 className="mb-4 font-semibold text-white">
                      Extracted fields
                    </h3>
                    <div className="grid gap-3">
                      {Object.entries(issueForm).map(([key, value]) => (
                        <label key={key} className="grid gap-1">
                          <span className="flex items-center gap-2 text-xs uppercase text-slate-500">
                            {key.replaceAll("_", " ")}
                            <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] text-fuchsia-200">
                              AI
                            </span>
                          </span>
                          <Input
                            value={value}
                            onChange={(event) =>
                              setIssueForm((current) => ({
                                ...current,
                                [key]: event.target.value,
                              }))
                            }
                            className="h-10 border-white/10 bg-white/5 text-white"
                          />
                        </label>
                      ))}
                    </div>
                    <Button
                      className="mt-5 w-full bg-[var(--brand)] text-white hover:bg-blue-500"
                      disabled={isRunningAgents || reviewLines.length === 0}
                      onClick={() => setStep(2)}
                    >
                      Continue to Review
                    </Button>
                  </GlassCard>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="mb-4">
                    <h3 className="font-semibold text-white">Issue details</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Capture who used the material and when it left inventory.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {Object.entries(issueForm).map(([key, value]) => (
                      <label key={key} className="grid gap-1.5">
                        <span className="text-xs font-medium uppercase text-slate-500">
                          {key.replaceAll("_", " ")}
                        </span>
                        <Input
                          value={value}
                          onChange={(event) =>
                            setIssueForm((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          className="h-10 border-white/10 bg-white/5 text-white"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-white">Materials issued</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Manual issue only allows materials already received into this site.
                      </p>
                    </div>
                    <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">
                      {reviewLines.length} line{reviewLines.length === 1 ? "" : "s"}
                    </Badge>
                  </div>

                  {reviewLines.map((line, index) => (
                    <div
                      key={`${line.description}-${index}`}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">Issue line {index + 1}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Select material, quantity, and reason for consumption.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-400/20 bg-red-400/10 text-red-100"
                          disabled={reviewLines.length === 1}
                          onClick={() => removeLine(index)}
                        >
                          <Trash2 className="size-3.5" />
                          Remove
                        </Button>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[1.2fr_1.2fr]">
                        <label className="grid gap-1.5">
                          <span className="text-xs font-medium uppercase text-slate-500">
                            Description
                          </span>
                          <Input
                            value={line.description}
                            onChange={(event) => updateLine(index, "description", event.target.value)}
                            className="h-10 border-white/10 bg-white/5 text-white"
                          />
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-xs font-medium uppercase text-slate-500">
                            Inventory material
                          </span>
                          <select
                            value={line.material_id}
                            onChange={(event) => updateLine(index, "material_id", event.target.value)}
                            className="h-10 rounded-lg border border-white/10 bg-[#0b0d14] px-3 text-sm text-white outline-none"
                          >
                            <option value="">Select material</option>
                            {(filePath ? materials : inventoryMaterials).map((material) => (
                              <option key={material.id} value={material.id}>
                                {material.name} ({material.unit})
                              </option>
                            ))}
                          </select>
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div
                              className={cn("h-full", materialConfidenceClass(line.confidence))}
                              style={{ width: `${Math.max(8, line.confidence * 100)}%` }}
                            />
                          </div>
                          {!line.material_id && filePath ? (
                            <Button
                              variant="outline"
                              className="h-8 justify-start border-white/10 bg-white/5 text-xs text-slate-200"
                              onClick={() => openNewMaterialDialog(index)}
                            >
                              Create as new material
                            </Button>
                          ) : null}
                        </label>
                      </div>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[0.8fr_0.8fr_1.4fr]">
                        <label className="grid gap-1.5">
                          <span className="text-xs font-medium uppercase text-slate-500">Qty</span>
                          <Input
                            value={line.quantity}
                            onChange={(event) => updateLine(index, "quantity", event.target.value)}
                            className="h-10 border-white/10 bg-white/5 text-right text-white"
                          />
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-xs font-medium uppercase text-slate-500">Unit</span>
                          <Input
                            value={line.unit}
                            onChange={(event) => updateLine(index, "unit", event.target.value)}
                            className="h-10 border-white/10 bg-white/5 text-white"
                          />
                        </label>
                        <label className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
                          <span className="text-xs font-medium uppercase text-slate-500">Reason / notes</span>
                          <Input
                            value={line.notes}
                            onChange={(event) => updateLine(index, "notes", event.target.value)}
                            className="h-10 border-white/10 bg-white/5 text-white"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap justify-between gap-3">
                  <Button
                    variant="outline"
                    className="h-11 gap-2 border-white/10 bg-white/5 text-slate-200"
                    onClick={addManualLine}
                  >
                    <Plus className="size-4" />
                    Add material line
                  </Button>
                  <Button
                    className="h-11 gap-2 bg-[var(--brand)] px-6 text-white hover:bg-blue-500"
                    disabled={isCommitting || reviewLines.length === 0}
                    onClick={commitConsumption}
                  >
                    <CheckCircle2 className="size-4" />
                    {isCommitting ? "Committing..." : "Commit Consumption"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={newMaterialLine !== null} onOpenChange={(open) => !open && setNewMaterialLine(null)}>
        <DialogContent className="border-white/10 bg-[#0b0d14] text-white">
          <DialogHeader>
            <DialogTitle>Create material</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Input
              value={newMaterial.category}
              onChange={(event) => setNewMaterial((current) => ({ ...current, category: event.target.value }))}
              placeholder="Category"
              className="border-white/10 bg-white/5 text-white"
            />
            <Input
              value={newMaterial.name}
              onChange={(event) => setNewMaterial((current) => ({ ...current, name: event.target.value }))}
              placeholder="Name"
              className="border-white/10 bg-white/5 text-white"
            />
            <Input
              value={newMaterial.unit}
              onChange={(event) => setNewMaterial((current) => ({ ...current, unit: event.target.value }))}
              placeholder="Unit"
              className="border-white/10 bg-white/5 text-white"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/10 bg-white/5 text-slate-200"
              onClick={() => setNewMaterialLine(null)}
            >
              Cancel
            </Button>
            <Button className="bg-[var(--brand)] text-white" onClick={saveNewMaterial}>
              Save material
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
