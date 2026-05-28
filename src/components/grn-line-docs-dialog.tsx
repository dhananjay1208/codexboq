"use client";

import { ChangeEvent, MouseEvent, useMemo, useState } from "react";
import {
  AlertCircle,
  Ban,
  Camera,
  Eye,
  FileCheck,
  FileText,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  effectiveDocStatus,
  seedMaterialComplianceFromGrn,
  storagePath,
  type DocType,
  type LibSlot,
  type LineDocType,
  type MaterialComplianceMap,
} from "@/lib/material-compliance";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export type GrnLineDoc = {
  id: string;
  grn_line_item_id: string;
  document_type: LineDocType;
  is_applicable: boolean;
  is_uploaded: boolean;
  file_path: string | null;
  file_name: string | null;
  document_date: string | null;
  uploaded_at: string | null;
  ai_audit: ComplianceAudit | null;
};

export type GrnLineForDocs = {
  id: string;
  material_id: string | null;
  material_name: string | null;
  quantity: number | null;
  unit: string | null;
};

export type ComplianceAudit = {
  doc_type_detected?: string | null;
  doc_type_matches_expected?: boolean | null;
  material_mentioned?: string | null;
  material_matches_expected?: boolean | null;
  validity_date?: string | null;
  issue_date?: string | null;
  issuing_authority?: string | null;
  is_valid_today?: boolean | null;
  flags?: string[] | null;
  confidence?: number | null;
};

type GrnLineDocsDialogProps = {
  line: GrnLineForDocs;
  docs: GrnLineDoc[];
  libMap: MaterialComplianceMap;
  onChanged: () => void | Promise<void>;
};

const lineDocTypes: Array<{
  value: LineDocType;
  short: string;
  label: string;
  fullName: string;
}> = [
  { value: "mir", short: "M", label: "MIR", fullName: "Material Inspection Report" },
  {
    value: "test_certificate",
    short: "TC",
    label: "Test Cert",
    fullName: "Test Certificate",
  },
  { value: "tds", short: "TD", label: "TDS", fullName: "Technical Data Sheet" },
];

function isAuditedDocType(docType: LineDocType): docType is DocType {
  return docType === "test_certificate" || docType === "tds";
}

function defaultDoc(lineId: string, documentType: LineDocType): GrnLineDoc {
  return {
    id: `${lineId}-${documentType}`,
    grn_line_item_id: lineId,
    document_type: documentType,
    is_applicable: true,
    is_uploaded: false,
    file_path: null,
    file_name: null,
    document_date: null,
    uploaded_at: null,
    ai_audit: null,
  };
}

function fileExtension(file: File) {
  return file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() || "bin" : "bin";
}

function auditPassed(audit: ComplianceAudit | null | undefined) {
  if (!audit) return false;
  return Boolean(
    audit.doc_type_matches_expected &&
      audit.material_matches_expected &&
      audit.is_valid_today
  );
}

function auditFlags(audit: ComplianceAudit | null | undefined) {
  return audit?.flags?.filter(Boolean) ?? [];
}

function pillClass(status: ReturnType<typeof effectiveDocStatus>) {
  if (status === "uploaded") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "na") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }
  return "border-white/10 bg-white/5 text-slate-300";
}

function sectionClass(status: ReturnType<typeof effectiveDocStatus>, flagged: boolean) {
  if (flagged) return "border-red-400/20 bg-red-400/10";
  if (status === "uploaded") return "border-emerald-400/20 bg-emerald-400/10";
  if (status === "na") return "border-amber-400/20 bg-amber-400/10";
  return "border-white/10 bg-black/20";
}

async function openStoredDocument(filePath: string) {
  const { data, error } = await supabase.storage
    .from("boqai-docs")
    .createSignedUrl(filePath, 60 * 30);

  if (error || !data?.signedUrl) {
    toast.error(error?.message ?? "Could not open document.");
    return;
  }

  window.open(data.signedUrl, "_blank");
}

export function GrnLineDocsDialog({
  line,
  docs,
  libMap,
  onChanged,
}: GrnLineDocsDialogProps) {
  const [open, setOpen] = useState(false);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [expandedFindings, setExpandedFindings] = useState<string | null>(null);

  const docsByType = useMemo(() => {
    const map = new Map<LineDocType, GrnLineDoc>();
    for (const doc of docs) map.set(doc.document_type, doc);
    return map;
  }, [docs]);

  const librarySlots = line.material_id ? libMap.get(line.material_id) : undefined;

  function docFor(documentType: LineDocType) {
    return docsByType.get(documentType) ?? defaultDoc(line.id, documentType);
  }

  function libSlotFor(documentType: LineDocType): LibSlot {
    if (!isAuditedDocType(documentType)) return undefined;
    return librarySlots?.[documentType];
  }

  function statusFor(documentType: LineDocType) {
    return effectiveDocStatus(docFor(documentType), libSlotFor(documentType));
  }

  function openDialog(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setOpen(true);
  }

  async function toggleApplicable(doc: GrnLineDoc) {
    setIsBusy(`${doc.document_type}-applicable`);
    try {
      const { error } = await supabase.from("grn_line_item_documents").upsert(
        {
          grn_line_item_id: line.id,
          document_type: doc.document_type,
          is_applicable: !doc.is_applicable,
        },
        { onConflict: "grn_line_item_id,document_type" }
      );

      if (error) throw new Error(error.message);
      await onChanged();
      toast.success(!doc.is_applicable ? "Marked required." : "Marked N/A.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update document.");
    } finally {
      setIsBusy(null);
    }
  }

  async function auditDocument(docType: DocType, path: string, file: File) {
    const response = await fetch("/api/ai/audit-compliance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_path: path,
        mime: file.type || "application/pdf",
        expected_doc_type: docType,
        expected_material_name: line.material_name || "Unknown material",
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Compliance audit failed.");
    }

    return payload.parsed as ComplianceAudit;
  }

  async function uploadDocument(doc: GrnLineDoc, file: File) {
    const key = `${doc.document_type}-upload`;
    setIsBusy(key);

    try {
      const path = storagePath.grnLineDoc(
        line.id,
        doc.document_type,
        fileExtension(file)
      );
      const upload = await supabase.storage.from("boqai-docs").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });

      if (upload.error) throw new Error(upload.error.message);

      let audit: ComplianceAudit | null = null;
      let ok = true;
      if (isAuditedDocType(doc.document_type)) {
        audit = await auditDocument(doc.document_type, path, file);
        ok = auditPassed(audit);
      }

      const { error } = await supabase.from("grn_line_item_documents").upsert(
        {
          grn_line_item_id: line.id,
          document_type: doc.document_type,
          is_applicable: true,
          is_uploaded: true,
          file_path: path,
          file_name: file.name,
          uploaded_at: new Date().toISOString(),
          ai_audit: audit,
        },
        { onConflict: "grn_line_item_id,document_type" }
      );

      if (error) throw new Error(error.message);

      if (ok && isAuditedDocType(doc.document_type) && line.material_id) {
        await seedMaterialComplianceFromGrn(supabase, {
          material_id: line.material_id,
          doc_type: doc.document_type,
          file_path: path,
          file_name: file.name,
        });
      }

      await onChanged();
      toast.success(
        audit && !ok ? "Document uploaded but flagged by AI." : "Document uploaded."
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsBusy(null);
    }
  }

  function handleFileInput(doc: GrnLineDoc, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) uploadDocument(doc, file);
  }

  async function deleteDocument(doc: GrnLineDoc) {
    if (!doc.file_path) {
      toast.error("No document is attached.");
      return;
    }

    setIsBusy(`${doc.document_type}-delete`);

    try {
      const remove = await supabase.storage.from("boqai-docs").remove([doc.file_path]);
      if (remove.error) throw new Error(remove.error.message);

      const { error } = await supabase.from("grn_line_item_documents").upsert(
        {
          grn_line_item_id: line.id,
          document_type: doc.document_type,
          is_applicable: doc.is_applicable,
          is_uploaded: false,
          file_path: null,
          file_name: null,
          uploaded_at: null,
          document_date: null,
          ai_audit: null,
        },
        { onConflict: "grn_line_item_id,document_type" }
      );

      if (error) throw new Error(error.message);
      await onChanged();
      toast.success("Document deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete document.");
    } finally {
      setIsBusy(null);
    }
  }

  return (
    <>
      <div className="flex justify-end gap-1">
        {lineDocTypes.map((docType) => {
          const status = statusFor(docType.value);
          return (
            <Button
              key={docType.value}
              variant="outline"
              size="xs"
              className={cn("h-6 min-w-7 px-1.5", pillClass(status))}
              onClick={openDialog}
              title={docType.fullName}
            >
              {docType.short}
            </Button>
          );
        })}
        <Button
          variant="outline"
          size="xs"
          className="h-6 border-white/10 bg-white/5 px-2 text-slate-200"
          onClick={openDialog}
        >
          Docs
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0b0d14] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <FileText className="size-5 text-blue-300" />
              Compliance Documents
            </DialogTitle>
            <DialogDescription>
              Material: <strong>{line.material_name || "Unmapped material"}</strong>
              <br />
              <span className="text-xs">
                {line.quantity ?? "-"} {line.unit ?? ""}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            {lineDocTypes.map((docType) => {
              const doc = docFor(docType.value);
              const libSlot = libSlotFor(docType.value);
              const status = effectiveDocStatus(doc, libSlot);
              const flags = auditFlags(doc.ai_audit);
              const flagged = Boolean(doc.ai_audit && !auditPassed(doc.ai_audit));
              const busy = Boolean(isBusy?.startsWith(docType.value));

              return (
                <section
                  key={docType.value}
                  className={cn(
                    "rounded-xl border p-3",
                    sectionClass(status, flagged)
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-medium text-white">{docType.label}</h4>
                        <span className="text-xs text-slate-500">{docType.fullName}</span>
                        {doc.ai_audit ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
                              flagged
                                ? "border-red-400/20 bg-red-400/10 text-red-100"
                                : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                            )}
                          >
                            {flagged ? (
                              <ShieldAlert className="size-3" />
                            ) : (
                              <ShieldCheck className="size-3" />
                            )}
                            {flagged ? "Flagged by AI" : "AI"}
                          </span>
                        ) : null}
                      </div>

                      {!doc.is_applicable ? (
                        <p className="mt-2 flex items-center gap-1 text-xs text-amber-200">
                          <Ban className="size-3" />
                          Not Applicable
                        </p>
                      ) : doc.is_uploaded && doc.file_name ? (
                        <button
                          className="mt-2 flex max-w-full items-center gap-1 text-left text-xs text-blue-200 hover:underline"
                          onClick={() => doc.file_path && openStoredDocument(doc.file_path)}
                        >
                          <FileCheck className="size-3 shrink-0 text-emerald-300" />
                          <span className="truncate">{doc.file_name}</span>
                        </button>
                      ) : libSlot?.status === "uploaded" && libSlot.file_path ? (
                        <button
                          className="mt-2 flex max-w-full items-center gap-1 text-left text-xs text-blue-200 hover:underline"
                          onClick={() => openStoredDocument(libSlot.file_path!)}
                        >
                          <FileCheck className="size-3 shrink-0 text-blue-300" />
                          <span>From compliance library:</span>
                          <span className="truncate">{libSlot.file_name}</span>
                        </button>
                      ) : libSlot?.status === "not_applicable" ? (
                        <p className="mt-2 flex items-center gap-1 text-xs text-amber-200">
                          <Ban className="size-3" />
                          N/A from compliance library
                        </p>
                      ) : (
                        <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                          <AlertCircle className="size-3" />
                          Pending
                        </p>
                      )}

                      {doc.ai_audit ? (
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            size="xs"
                            className={cn(
                              "border-white/10 bg-white/5 text-xs text-slate-200",
                              flagged && "border-red-400/20 bg-red-400/10 text-red-100"
                            )}
                            onClick={() =>
                              setExpandedFindings(
                                expandedFindings === docType.value ? null : docType.value
                              )
                            }
                          >
                            View AI findings
                          </Button>
                          {expandedFindings === docType.value ? (
                            <div className="mt-2 rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-slate-200">
                              <p>Detected: {doc.ai_audit.doc_type_detected || "-"}</p>
                              <p>Material: {doc.ai_audit.material_mentioned || "-"}</p>
                              <p>
                                Confidence:{" "}
                                {doc.ai_audit.confidence !== null &&
                                doc.ai_audit.confidence !== undefined
                                  ? `${Math.round(doc.ai_audit.confidence * 100)}%`
                                  : "-"}
                              </p>
                              <ul className="mt-2 list-disc space-y-1 pl-4">
                                {flags.length > 0 ? (
                                  flags.map((flag) => <li key={flag}>{flag}</li>)
                                ) : (
                                  <li>No specific flags returned.</li>
                                )}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-white/10 bg-white/5 text-slate-200"
                        disabled={busy}
                        onClick={() => toggleApplicable(doc)}
                      >
                        {doc.is_applicable ? "NA" : "Required"}
                      </Button>

                      {doc.is_applicable && doc.is_uploaded && doc.file_path ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 border-white/10 bg-white/5 text-slate-200"
                            disabled={busy}
                            onClick={() => openStoredDocument(doc.file_path!)}
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          <label>
                            <input
                              type="file"
                              className="sr-only"
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                              onChange={(event) => handleFileInput(doc, event)}
                              disabled={busy}
                            />
                            <span
                              className={cn(
                                "inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2.5 text-slate-200 transition hover:bg-white/10",
                                busy && "pointer-events-none opacity-50"
                              )}
                            >
                              <Upload className="size-3.5" />
                            </span>
                          </label>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 border-red-400/20 bg-red-400/10 text-red-100"
                            disabled={busy}
                            onClick={() => deleteDocument(doc)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      ) : doc.is_applicable && status !== "uploaded" ? (
                        <>
                          <label>
                            <input
                              type="file"
                              className="sr-only"
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                              onChange={(event) => handleFileInput(doc, event)}
                              disabled={busy}
                            />
                            <span
                              className={cn(
                                "inline-flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg bg-[var(--brand)] px-2.5 text-xs font-medium text-white transition hover:bg-blue-500",
                                busy && "pointer-events-none opacity-50"
                              )}
                            >
                              <Upload className="size-3.5" />
                              {busy ? "Uploading..." : "Upload"}
                            </span>
                          </label>
                          <label>
                            <input
                              type="file"
                              className="sr-only"
                              accept="image/*"
                              capture="environment"
                              onChange={(event) => handleFileInput(doc, event)}
                              disabled={busy}
                            />
                            <span
                              className={cn(
                                "inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10",
                                busy && "pointer-events-none opacity-50"
                              )}
                              title="Capture document"
                            >
                              <Camera className="size-3.5" />
                            </span>
                          </label>
                        </>
                      ) : null}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          <DialogFooter className="border-white/10 bg-white/[0.03]">
            <Button
              variant="outline"
              className="border-white/10 bg-white/5 text-slate-200"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
