"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Eye,
  FileCheck2,
  FileWarning,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { ElectricSkeleton } from "@/components/electric-skeleton";
import { EmptyState } from "@/components/empty-state";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DOC_TYPES,
  effectiveDocStatus,
  type DocType,
  type LegacyDocStatus,
} from "@/lib/material-compliance";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

type Material = {
  id: string;
  category: string | null;
  name: string;
  unit: string;
};

type ComplianceDoc = {
  id: string;
  material_id: string;
  doc_type: DocType;
  status: LegacyDocStatus;
  file_path: string | null;
  file_name: string | null;
  ai_audit: ComplianceAudit | null;
  validity_date: string | null;
  uploaded_at: string | null;
};

type ComplianceAudit = {
  doc_type_detected: "test_certificate" | "tds" | "other";
  doc_type_matches_expected: boolean;
  material_mentioned: string | null;
  material_matches_expected: boolean;
  validity_date: string | null;
  issue_date: string | null;
  issuing_authority: string | null;
  is_valid_today: boolean;
  flags: string[];
  confidence: number;
};

type LibraryRow = {
  material: Material;
  test_certificate?: ComplianceDoc;
  tds?: ComplianceDoc;
};

function statusBadgeClass(status: ReturnType<typeof effectiveDocStatus>) {
  if (status === "uploaded") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "flagged") {
    return "border-red-400/20 bg-red-400/10 text-red-200";
  }
  if (status === "na") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }
  return "border-slate-400/20 bg-slate-400/10 text-slate-300";
}

function statusLabel(status: ReturnType<typeof effectiveDocStatus>) {
  if (status === "na") return "N/A";
  if (status === "flagged") return "Flagged";
  if (status === "uploaded") return "Uploaded";
  return "Pending";
}

function mimeFromFile(file: File) {
  if (file.type) return file.type;
  if (file.name.toLowerCase().endsWith(".pdf")) return "application/pdf";
  if (file.name.toLowerCase().endsWith(".png")) return "image/png";
  return "image/jpeg";
}

function mimeFromName(fileName: string | null) {
  const lower = fileName?.toLowerCase() ?? "";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function storagePath(materialId: string, docType: DocType, file: File) {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  return `compliance/${materialId}/${docType}_${file.lastModified}_${crypto.randomUUID()}.${ext}`;
}

function isPassingAudit(audit: ComplianceAudit) {
  return (
    audit.doc_type_matches_expected &&
    audit.material_matches_expected &&
    audit.is_valid_today
  );
}

export default function CompliancePage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [docs, setDocs] = useState<ComplianceDoc[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const [expandedFindings, setExpandedFindings] = useState<string | null>(null);

  const docsByMaterial = useMemo(() => {
    const map = new Map<string, Partial<Record<DocType, ComplianceDoc>>>();

    for (const doc of docs) {
      const row = map.get(doc.material_id) ?? {};
      row[doc.doc_type] = doc;
      map.set(doc.material_id, row);
    }

    return map;
  }, [docs]);

  const libraryRows = useMemo<LibraryRow[]>(() => {
    const enrolledMaterialIds = new Set(docs.map((doc) => doc.material_id));
    return materials
      .filter((material) => enrolledMaterialIds.has(material.id))
      .map((material) => ({
        material,
        test_certificate: docsByMaterial.get(material.id)?.test_certificate,
        tds: docsByMaterial.get(material.id)?.tds,
      }));
  }, [docs, docsByMaterial, materials]);

  const groupedRows = useMemo(() => {
    return libraryRows.reduce<Record<string, LibraryRow[]>>((acc, row) => {
      const category = row.material.category || "Uncategorized";
      acc[category] = [...(acc[category] ?? []), row];
      return acc;
    }, {});
  }, [libraryRows]);

  const addableMaterials = useMemo(() => {
    const enrolled = new Set(docs.map((doc) => doc.material_id));
    const normalized = query.toLowerCase();
    return materials.filter(
      (material) =>
        !enrolled.has(material.id) &&
        (material.name.toLowerCase().includes(normalized) ||
          (material.category ?? "").toLowerCase().includes(normalized))
    );
  }, [docs, materials, query]);

  const complianceSummary = useMemo(() => {
    const total = libraryRows.length * DOC_TYPES.length;
    const uploaded = libraryRows.reduce((sum, row) => {
      return (
        sum +
        DOC_TYPES.filter((docType) => effectiveDocStatus(row[docType.value]) === "uploaded")
          .length
      );
    }, 0);
    const completed = libraryRows.reduce((sum, row) => {
      return (
        sum +
        DOC_TYPES.filter((docType) => {
          const status = effectiveDocStatus(row[docType.value]);
          return status === "uploaded" || status === "na";
        }).length
      );
    }, 0);

    return {
      materialTypes: libraryRows.length,
      total,
      uploaded,
      pending: Math.max(0, total - completed),
    };
  }, [libraryRows]);

  async function loadData() {
    setIsLoadingData(true);
    const [materialsResult, docsResult, grnMaterialsResult] = await Promise.all([
      supabase
        .from("master_materials")
        .select("id,category,name,unit")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("material_compliance_documents")
        .select(
          "id,material_id,doc_type,status,file_path,file_name,ai_audit,validity_date,uploaded_at"
        ),
      supabase.from("grn_line_items").select("material_id").not("material_id", "is", null),
    ]);

    if (materialsResult.error) toast.error(materialsResult.error.message);
    else setMaterials(materialsResult.data ?? []);

    if (docsResult.error) {
      toast.error(docsResult.error.message);
      setDocs([]);
    } else {
      let nextDocs = (docsResult.data ?? []) as ComplianceDoc[];
      if (grnMaterialsResult.error) {
        toast.error(grnMaterialsResult.error.message);
      } else {
        const receivedMaterialIds = Array.from(
          new Set((grnMaterialsResult.data ?? []).map((row) => row.material_id as string))
        );
        const existing = new Set(nextDocs.map((doc) => `${doc.material_id}:${doc.doc_type}`));
        const missingRows = receivedMaterialIds.flatMap((materialId) =>
          DOC_TYPES.filter((docType) => !existing.has(`${materialId}:${docType.value}`)).map(
            (docType) => ({
              material_id: materialId,
              doc_type: docType.value,
              status: "pending" as const,
            })
          )
        );

        if (missingRows.length > 0) {
          const { error } = await supabase
            .from("material_compliance_documents")
            .upsert(missingRows, {
              onConflict: "material_id,doc_type",
              ignoreDuplicates: true,
            });

          if (error) {
            toast.error(error.message);
          } else {
            const refreshed = await supabase
              .from("material_compliance_documents")
              .select(
                "id,material_id,doc_type,status,file_path,file_name,ai_audit,validity_date,uploaded_at"
              );
            if (refreshed.error) toast.error(refreshed.error.message);
            else nextDocs = (refreshed.data ?? []) as ComplianceDoc[];
          }
        }
      }
      setDocs(nextDocs);
    }
    setIsLoadingData(false);
  }

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) loadData();
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function addMaterialsToLibrary() {
    if (selectedMaterialIds.length === 0) {
      toast.error("Select at least one material.");
      return;
    }

    const rows = selectedMaterialIds.flatMap((materialId) =>
      DOC_TYPES.map((docType) => ({
        material_id: materialId,
        doc_type: docType.value,
        status: "pending" as const,
      }))
    );
    const { error } = await supabase
      .from("material_compliance_documents")
      .upsert(rows, { onConflict: "material_id,doc_type", ignoreDuplicates: true });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Materials added to compliance library.");
    setSelectedMaterialIds([]);
    setIsAddOpen(false);
    await loadData();
  }

  async function auditAndSave(
    material: Material,
    docType: DocType,
    filePath: string,
    fileName: string,
    mime: string
  ) {
    const response = await fetch("/api/ai/audit-compliance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_path: filePath,
        mime,
        expected_doc_type: docType,
        expected_material_name: material.name,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Compliance audit failed.");
    }

    const audit = payload.parsed as ComplianceAudit;
    const status: LegacyDocStatus = isPassingAudit(audit) ? "uploaded" : "flagged";
    const { error } = await supabase
      .from("material_compliance_documents")
      .upsert(
        {
          material_id: material.id,
          doc_type: docType,
          status,
          file_path: filePath,
          file_name: fileName,
          ai_audit: audit,
          validity_date: audit.validity_date,
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: "material_id,doc_type" }
      );

    if (error) throw new Error(error.message);

    toast.success(status === "uploaded" ? "Document uploaded." : "Document flagged by AI.");
  }

  async function handleUpload(material: Material, docType: DocType, file: File) {
    const key = `${material.id}-${docType}`;
    setIsUploading(key);

    try {
      const path = storagePath(material.id, docType, file);
      const upload = await supabase.storage.from("boqai-docs").upload(path, file, {
        contentType: mimeFromFile(file),
        upsert: false,
      });

      if (upload.error) throw new Error(upload.error.message);

      await auditAndSave(material, docType, path, file.name, mimeFromFile(file));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(null);
    }
  }

  async function reAudit(material: Material, doc: ComplianceDoc) {
    if (!doc.file_path) {
      toast.error("No file found for this slot.");
      return;
    }

    const key = `${material.id}-${doc.doc_type}`;
    setIsUploading(key);

    try {
      await auditAndSave(
        material,
        doc.doc_type,
        doc.file_path,
        doc.file_name ?? "document",
        mimeFromName(doc.file_name)
      );
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Re-audit failed.");
    } finally {
      setIsUploading(null);
    }
  }

  async function openDocument(path: string) {
    const { data, error } = await supabase.storage
      .from("boqai-docs")
      .createSignedUrl(path, 60 * 30);

    if (error || !data) {
      toast.error(error?.message ?? "Could not open document.");
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  async function setNotApplicable(materialId: string, docType: DocType) {
    const { error } = await supabase
      .from("material_compliance_documents")
      .upsert(
        {
          material_id: materialId,
          doc_type: docType,
          status: "not_applicable",
          file_path: null,
          file_name: null,
          ai_audit: null,
          validity_date: null,
          uploaded_at: null,
        },
        { onConflict: "material_id,doc_type" }
      );

    if (error) toast.error(error.message);
    else {
      toast.success("Marked N/A.");
      await loadData();
    }
  }

  function toggleSelectedMaterial(id: string) {
    setSelectedMaterialIds((current) =>
      current.includes(id)
        ? current.filter((materialId) => materialId !== id)
        : [...current, id]
    );
  }

  function renderDocCell(material: Material, docType: DocType, doc?: ComplianceDoc) {
    const status = effectiveDocStatus(doc);
    const key = `${material.id}-${docType}`;
    const audit = doc?.ai_audit;

    return (
      <td className="min-w-[310px] px-4 py-3 align-top">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="outline" className={statusBadgeClass(status)}>
              {statusLabel(status)}
            </Badge>
            {status === "flagged" && audit?.flags?.[0] ? (
              <span className="max-w-40 truncate text-xs text-red-200">
                {audit.flags[0]}
              </span>
            ) : null}
          </div>

          {status === "uploaded" && doc?.file_name ? (
            <div className="mt-3 text-sm text-slate-300">
              <p className="truncate">{doc.file_name}</p>
              {doc.validity_date ? (
                <p className="mt-1 text-xs text-slate-500">
                  Valid until {doc.validity_date}
                </p>
              ) : null}
            </div>
          ) : null}

          {status === "flagged" && audit ? (
            <div className="mt-3">
              <Button
                variant="outline"
                className="h-8 border-red-400/20 bg-red-400/10 text-xs text-red-100 hover:bg-red-400/20"
                onClick={() =>
                  setExpandedFindings(expandedFindings === key ? null : key)
                }
              >
                <AlertTriangle className="size-3" />
                View AI findings
              </Button>
              {expandedFindings === key ? (
                <div className="mt-3 rounded-lg border border-red-400/20 bg-red-950/30 p-3 text-xs text-red-100">
                  <p>Detected: {audit.doc_type_detected}</p>
                  <p>Material: {audit.material_mentioned ?? "not found"}</p>
                  <p>Authority: {audit.issuing_authority ?? "not found"}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {audit.flags.length > 0 ? (
                      audit.flags.map((flag) => <li key={flag}>{flag}</li>)
                    ) : (
                      <li>No specific flags returned.</li>
                    )}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {doc?.file_path ? (
              <Button
                variant="outline"
                className="h-8 border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
                onClick={() => openDocument(doc.file_path!)}
              >
                <Eye className="size-3" />
                View
              </Button>
            ) : null}
            <label>
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.png,.jpg,.jpeg,image/*"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) handleUpload(material, docType, file);
                }}
              />
              <span
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition",
                  status === "pending"
                    ? "border-transparent bg-[var(--brand)] text-white hover:bg-blue-500"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                  isUploading === key && "pointer-events-none opacity-50"
                )}
              >
                <Upload className="size-3" />
                {status === "pending" ? "Upload" : "Replace"}
              </span>
            </label>
            {doc?.file_path ? (
              <Button
                variant="outline"
                className="h-8 border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
                disabled={isUploading === key}
                onClick={() => reAudit(material, doc)}
              >
                <RefreshCw className="size-3" />
                Re-audit
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="h-8 border-amber-400/20 bg-amber-400/10 text-xs text-amber-100 hover:bg-amber-400/20"
              onClick={() => setNotApplicable(material.id, docType)}
            >
              N/A
            </Button>
          </div>
        </div>
      </td>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-slate-400">
            <ShieldCheck className="size-4 text-[var(--accent)]" />
            Material document compliance
          </p>
          <h1 className="bg-gradient-to-r from-white via-blue-100 to-fuchsia-200 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            Compliance Auditor
          </h1>
        </div>
        <Button
          className="h-10 gap-2 bg-[var(--brand)] text-white hover:bg-blue-500"
          onClick={() => setIsAddOpen(true)}
        >
          <Plus className="size-4" />
          Add materials to library
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <GlassCard className="p-5">
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/10">
            <ShieldCheck className="size-5 text-blue-300" />
          </div>
          <p className="text-sm text-slate-400">Material Types</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {complianceSummary.materialTypes}
          </p>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10">
            <FileCheck2 className="size-5 text-emerald-300" />
          </div>
          <p className="text-sm text-slate-400">Docs Uploaded</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {complianceSummary.uploaded}/{complianceSummary.total}
          </p>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10">
            <FileWarning className="size-5 text-amber-300" />
          </div>
          <p className="text-sm text-slate-400">Pending Required</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {complianceSummary.pending}
          </p>
        </GlassCard>
      </section>

      <GlassCard className="p-5">
        {isLoadingData ? (
          <ElectricSkeleton rows={4} />
        ) : Object.keys(groupedRows).length === 0 ? (
          <EmptyState
            title="No compliance library rows yet"
            description="Add materials to create Test Certificate and TDS placeholders, then audit them with the Compliance Auditor."
          />
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedRows).map(([category, rows]) => (
              <section key={category}>
                <h2 className="mb-3 text-lg font-semibold text-white">
                  {category}
                </h2>
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="bg-white/[0.03] text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Material</th>
                        <th className="px-4 py-3 font-medium">Test Cert</th>
                        <th className="px-4 py-3 font-medium">TDS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {rows.map((row) => (
                        <tr key={row.material.id} className="text-slate-300">
                          <td className="w-72 px-4 py-3 align-top">
                            <p className="font-medium text-white">
                              {row.material.name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Unit: {row.material.unit}
                            </p>
                          </td>
                          {renderDocCell(
                            row.material,
                            "test_certificate",
                            row.test_certificate
                          )}
                          {renderDocCell(row.material, "tds", row.tds)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </GlassCard>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="border-white/10 bg-[#0b0d14] text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add materials to library</DialogTitle>
            <DialogDescription>
              Select materials that need reusable Test Certificate and TDS slots.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search materials..."
              className="h-10 border-white/10 bg-white/5 pl-10 text-white"
            />
          </div>
          <div className="max-h-96 overflow-y-auto rounded-2xl border border-white/10">
            {addableMaterials.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">
                No available materials match this search.
              </p>
            ) : (
              addableMaterials.map((material) => (
                <label
                  key={material.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-white/10 p-3 last:border-b-0 hover:bg-white/[0.04]"
                >
                  <input
                    type="checkbox"
                    checked={selectedMaterialIds.includes(material.id)}
                    onChange={() => toggleSelectedMaterial(material.id)}
                    className="size-4"
                  />
                  <span>
                    <span className="block font-medium text-white">
                      {material.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {material.category || "Uncategorized"} · {material.unit}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/10 bg-white/5 text-slate-200"
              onClick={() => setIsAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-[var(--brand)] text-white"
              onClick={addMaterialsToLibrary}
            >
              Add selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
