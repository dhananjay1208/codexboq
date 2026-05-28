"use client";

import { ChangeEvent, MouseEvent, useState } from "react";
import {
  AlertCircle,
  Ban,
  Camera,
  Eye,
  FileCheck,
  FileText,
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
import { storagePath } from "@/lib/material-compliance";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export type GrnDc = {
  id?: string;
  grn_invoice_id?: string;
  is_applicable: boolean;
  is_uploaded: boolean;
  file_path: string | null;
  file_name: string | null;
  document_date: string | null;
  uploaded_at: string | null;
};

type GrnDcDialogProps = {
  invoiceId: string;
  invoiceNumber: string | null;
  grnDate?: string | null;
  vendorName?: string | null;
  dc?: GrnDc | GrnDc[] | null;
  onChanged?: () => void | Promise<void>;
  className?: string;
};

const acceptedDocumentTypes = ".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx";

function normalizeDc(dc: GrnDc | GrnDc[] | null | undefined): GrnDc {
  const row = Array.isArray(dc) ? dc[0] : dc;

  return {
    id: row?.id,
    grn_invoice_id: row?.grn_invoice_id,
    is_applicable: row?.is_applicable ?? true,
    is_uploaded: row?.is_uploaded ?? false,
    file_path: row?.file_path ?? null,
    file_name: row?.file_name ?? null,
    document_date: row?.document_date ?? null,
    uploaded_at: row?.uploaded_at ?? null,
  };
}

function fileExtension(file: File) {
  return file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() || "bin" : "bin";
}

function formatDate(date: string | null | undefined) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export function GrnDcDialog({
  invoiceId,
  invoiceNumber,
  grnDate,
  vendorName,
  dc,
  onChanged,
  className,
}: GrnDcDialogProps) {
  const [open, setOpen] = useState(false);
  const [localDc, setLocalDc] = useState<GrnDc | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const dcState = localDc ?? normalizeDc(dc);

  const status = !dcState.is_applicable
    ? "na"
    : dcState.is_uploaded
      ? "uploaded"
      : "pending";

  async function refreshAfterChange(nextDc: GrnDc) {
    setLocalDc(nextDc);
    await onChanged?.();
  }

  async function handleUpload(file: File) {
    setIsBusy(true);

    try {
      const path = storagePath.grnDC(invoiceId, fileExtension(file));
      const upload = await supabase.storage.from("boqai-docs").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });

      if (upload.error) throw new Error(upload.error.message);

      const payload = {
        grn_invoice_id: invoiceId,
        is_applicable: true,
        is_uploaded: true,
        file_path: path,
        file_name: file.name,
        uploaded_at: new Date().toISOString(),
        document_date: null,
      };
      const { data, error } = await supabase
        .from("grn_invoice_dc")
        .upsert(payload, { onConflict: "grn_invoice_id" })
        .select(
          "id,grn_invoice_id,is_applicable,is_uploaded,file_path,file_name,document_date,uploaded_at"
        )
        .single();

      if (error) throw new Error(error.message);

      await refreshAfterChange(normalizeDc(data as GrnDc));
      toast.success("DC uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "DC upload failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await handleUpload(file);
  }

  async function setApplicable(isApplicable: boolean) {
    setIsBusy(true);

    try {
      const { data, error } = await supabase
        .from("grn_invoice_dc")
        .upsert(
          {
            grn_invoice_id: invoiceId,
            is_applicable: isApplicable,
          },
          { onConflict: "grn_invoice_id" }
        )
        .select(
          "id,grn_invoice_id,is_applicable,is_uploaded,file_path,file_name,document_date,uploaded_at"
        )
        .single();

      if (error) throw new Error(error.message);

      await refreshAfterChange(normalizeDc(data as GrnDc));
      toast.success(isApplicable ? "DC marked required." : "DC marked N/A.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update DC status.");
    } finally {
      setIsBusy(false);
    }
  }

  async function viewDocument() {
    if (!dcState.file_path) {
      toast.error("No DC file is attached.");
      return;
    }

    const { data, error } = await supabase.storage
      .from("boqai-docs")
      .createSignedUrl(dcState.file_path, 60 * 30);

    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not open DC.");
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  async function deleteDocument() {
    if (!dcState.file_path) {
      toast.error("No DC file is attached.");
      return;
    }

    setIsBusy(true);

    try {
      const remove = await supabase.storage.from("boqai-docs").remove([dcState.file_path]);
      if (remove.error) throw new Error(remove.error.message);

      const { data, error } = await supabase
        .from("grn_invoice_dc")
        .upsert(
          {
            grn_invoice_id: invoiceId,
            is_applicable: dcState.is_applicable,
            is_uploaded: false,
            file_path: null,
            file_name: null,
            uploaded_at: null,
            document_date: null,
          },
          { onConflict: "grn_invoice_id" }
        )
        .select(
          "id,grn_invoice_id,is_applicable,is_uploaded,file_path,file_name,document_date,uploaded_at"
        )
        .single();

      if (error) throw new Error(error.message);

      await refreshAfterChange(normalizeDc(data as GrnDc));
      toast.success("DC deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete DC.");
    } finally {
      setIsBusy(false);
    }
  }

  function openDialog(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setOpen(true);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "h-8 max-w-full gap-1.5 border-white/10 bg-white/5 text-xs hover:bg-white/10",
          status === "uploaded" && "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
          status === "pending" && "text-slate-300",
          status === "na" && "border-amber-400/20 bg-amber-400/10 text-amber-200",
          className
        )}
        onClick={openDialog}
      >
        {status === "uploaded" ? (
          <FileCheck className="size-3.5" />
        ) : status === "na" ? (
          <Ban className="size-3.5" />
        ) : (
          <Upload className="size-3.5" />
        )}
        <span className="truncate">
          {status === "uploaded"
            ? `DC Uploaded${dcState.file_name ? ` - ${dcState.file_name}` : ""}`
            : status === "na"
              ? "DC N/A"
              : "DC Pending"}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-white/10 bg-[#0b0d14] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <FileText className="size-5 text-blue-300" />
              Delivery Challan (DC)
            </DialogTitle>
            <DialogDescription>
              Invoice: <strong>{invoiceNumber || "Draft"}</strong>
              {vendorName ? (
                <>
                  <br />
                  <span className="text-xs">{vendorName}</span>
                </>
              ) : null}
              {grnDate ? (
                <>
                  <br />
                  <span className="text-xs">GRN date: {formatDate(grnDate)}</span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <section
              className={cn(
                "rounded-xl border p-4",
                status === "uploaded" && "border-emerald-400/20 bg-emerald-400/10",
                status === "pending" && "border-white/10 bg-black/20",
                status === "na" && "border-amber-400/20 bg-amber-400/10"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-medium text-white">Applicable</h4>
                  {!dcState.is_applicable ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-amber-200">
                      <Ban className="size-3" />
                      Not applicable for this invoice.
                    </p>
                  ) : dcState.is_uploaded ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-emerald-200">
                      <FileCheck className="size-3" />
                      {dcState.file_name}
                    </p>
                  ) : (
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                      <AlertCircle className="size-3" />
                      Pending upload.
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 bg-white/5 text-slate-200"
                  disabled={isBusy}
                  onClick={() => setApplicable(!dcState.is_applicable)}
                >
                  {dcState.is_applicable ? "NA" : "Required"}
                </Button>
              </div>
            </section>

            {dcState.is_applicable ? (
              <section className="rounded-xl border border-white/10 bg-black/20 p-4">
                {dcState.is_uploaded ? (
                  <div className="grid gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">Uploaded file</p>
                      <p className="mt-1 break-all text-xs text-slate-400">
                        {dcState.file_name}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 bg-white/5 text-slate-200"
                        onClick={viewDocument}
                        disabled={isBusy}
                      >
                        <Eye className="size-3.5" />
                        View
                      </Button>
                      <label>
                        <input
                          type="file"
                          className="sr-only"
                          accept={acceptedDocumentTypes}
                          onChange={handleFileInput}
                          disabled={isBusy}
                        />
                        <span
                          className={cn(
                            "inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 text-[0.8rem] font-medium text-slate-200 transition hover:bg-white/10",
                            isBusy && "pointer-events-none opacity-50"
                          )}
                        >
                          <Upload className="size-3.5" />
                          Replace
                        </span>
                      </label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-400/20 bg-red-400/10 text-red-100 hover:bg-red-400/20"
                        onClick={deleteDocument}
                        disabled={isBusy}
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <label className="min-w-40 flex-1">
                      <input
                        type="file"
                        className="sr-only"
                        accept={acceptedDocumentTypes}
                        onChange={handleFileInput}
                        disabled={isBusy}
                      />
                      <span
                        className={cn(
                          "inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 text-sm font-medium text-white transition hover:bg-blue-500",
                          isBusy && "pointer-events-none opacity-50"
                        )}
                      >
                        <Upload className="size-4" />
                        {isBusy ? "Uploading..." : "Upload DC"}
                      </span>
                    </label>
                    <label>
                      <input
                        type="file"
                        className="sr-only"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileInput}
                        disabled={isBusy}
                      />
                      <span
                        className={cn(
                          "inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10",
                          isBusy && "pointer-events-none opacity-50"
                        )}
                        title="Capture DC"
                      >
                        <Camera className="size-4" />
                      </span>
                    </label>
                  </div>
                )}
              </section>
            ) : null}
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
