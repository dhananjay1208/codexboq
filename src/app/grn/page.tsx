"use client";

import {
  ChangeEvent,
  DragEvent,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Camera,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  PackageCheck,
  Pencil,
  Plus,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { ElectricTableSkeleton } from "@/components/electric-skeleton";
import { GlassCard } from "@/components/glass-card";
import { GrnDcDialog, type GrnDc } from "@/components/grn-dc-dialog";
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
import { effectiveDocStatus } from "@/lib/material-compliance";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type SiteOption = { id: string; name: string };
type SupplierOption = {
  id: string;
  supplier_name: string;
  gstin: string | null;
};
type MasterMaterial = {
  id: string;
  category: string | null;
  name: string;
  unit: string;
};

type ExtractedInvoice = {
  vendor_name: string;
  vendor_gstin: string | null;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  line_items: Array<{
    description: string;
    hsn_code: string | null;
    quantity: number;
    unit: string;
    rate: number;
    gst_rate: number;
    amount_with_gst: number;
  }>;
};

type ReviewLine = {
  description: string;
  hsn_code: string | null;
  quantity: string;
  unit: string;
  rate: string;
  gst_rate: string;
  amount_with_gst: string;
  material_id: string;
  confidence: number;
  reasoning: string;
  suggested_new: { category: string; name: string; unit: string } | null;
};

type GrnLine = {
  id: string;
  grn_invoice_id: string;
  material_id: string | null;
  material_name: string | null;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  gst_rate: number | null;
  amount_with_gst: number | null;
  ai_match_confidence: number | null;
};

type GrnLineDoc = {
  grn_line_item_id: string;
  document_type: string;
  is_applicable: boolean;
  is_uploaded: boolean;
  file_path: string | null;
  file_name: string | null;
};

type MaterialComplianceDoc = {
  material_id: string;
  doc_type: "test_certificate" | "tds";
  status: "pending" | "uploaded" | "not_applicable" | "flagged";
  file_path: string | null;
  file_name: string | null;
};

type SupplierJoin = {
  id: string;
  supplier_name: string;
} | null;

type RecentGrn = {
  id: string;
  site_id: string | null;
  supplier_id: string | null;
  suppliers: SupplierJoin | SupplierJoin[] | null;
  invoice_number: string | null;
  invoice_date: string | null;
  grn_date: string | null;
  total_amount: number | null;
  status: string | null;
  ai_extracted_raw: unknown;
  grn_invoice_dc: GrnDc | GrnDc[] | null;
  grn_line_items: GrnLine[] | null;
};

type EditGrn = {
  id: string;
  site_id: string | null;
  supplier_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  grn_date: string | null;
  total_amount: number | null;
  source_file_path: string | null;
  ai_extracted_raw: unknown;
  grn_line_items: GrnLine[] | null;
};

type ComplianceCounts = {
  completed: number;
  total: number;
  pending: number;
};

type InvoiceGroup = {
  key: string;
  invoiceNumber: string;
  supplierName: string;
  invoices: RecentGrn[];
  totalAmount: number;
  itemCount: number;
  compliance: ComplianceCounts;
};

const steps = ["Upload", "Extract", "Review"];

function formatAmount(value: number | string | null | undefined) {
  const parsed = typeof value === "string" ? Number(value) : value;

  if (parsed === null || parsed === undefined || Number.isNaN(parsed)) {
    return "-";
  }

  return parsed.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function isInvoiceFile(file: File) {
  return (
    file.type === "application/pdf" ||
    file.type.startsWith("image/") ||
    /\.(pdf|png|jpe?g|webp)$/i.test(file.name)
  );
}

function makeGrnStoragePath(siteId: string, file: File) {
  const ext = file.name.split(".").pop() || "pdf";
  return `grn/${siteId}/${crypto.randomUUID()}.${ext}`;
}

function materialConfidenceClass(confidence: number) {
  if (confidence >= 0.85) return "bg-emerald-400";
  if (confidence >= 0.6) return "bg-amber-400";
  return "bg-red-400";
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

function fileNameFromPath(filePath: string) {
  return filePath.split("/").pop() || filePath;
}

function uniquePaths(paths: Array<string | null | undefined>) {
  return Array.from(new Set(paths.filter((path): path is string => Boolean(path))));
}

function supplierFromJoin(join: RecentGrn["suppliers"]) {
  return Array.isArray(join) ? join[0] ?? null : join;
}

function dcFromJoin(dc: RecentGrn["grn_invoice_dc"]) {
  return Array.isArray(dc) ? dc[0] ?? null : dc;
}

function complianceBadgeClass(counts: ComplianceCounts) {
  if (counts.total > 0 && counts.completed === counts.total) {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }
  return "border-amber-400/20 bg-amber-400/10 text-amber-200";
}

function librarySlot(doc: MaterialComplianceDoc | undefined) {
  if (!doc) return undefined;
  return {
    status: doc.status === "flagged" ? "pending" : doc.status,
    file_path: doc.file_path,
    file_name: doc.file_name,
  } as const;
}

function calculateLineCompliance(
  docs: GrnLineDoc[],
  libraryDocs?: Partial<Record<"test_certificate" | "tds", MaterialComplianceDoc>>
) {
  return docs.reduce<ComplianceCounts>(
    (acc, doc) => {
      const library =
        doc.document_type === "test_certificate" || doc.document_type === "tds"
          ? librarySlot(libraryDocs?.[doc.document_type])
          : undefined;
      const status = effectiveDocStatus(
        {
          is_applicable: doc.is_applicable,
          is_uploaded: doc.is_uploaded,
          file_path: doc.file_path,
          file_name: doc.file_name,
        },
        library
      );
      acc.total += 1;
      if (status === "pending") acc.pending += 1;
      else acc.completed += 1;
      return acc;
    },
    { completed: 0, total: 0, pending: 0 }
  );
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Math.round(Number(value) * 100)}%`;
}

export default function GrnPage() {
  const router = useRouter();
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [materials, setMaterials] = useState<MasterMaterial[]>([]);
  const [recentGrns, setRecentGrns] = useState<RecentGrn[]>([]);
  const [lineDocs, setLineDocs] = useState<GrnLineDoc[]>([]);
  const [materialComplianceDocs, setMaterialComplianceDocs] = useState<MaterialComplianceDoc[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editGrnId, setEditGrnId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [filePath, setFilePath] = useState("");
  const [signedUrl, setSignedUrl] = useState("");
  const [mime, setMime] = useState("");
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const [isRunningAgents, setIsRunningAgents] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    supplier_id: "",
    vendor_name: "",
    vendor_gstin: "",
    invoice_number: "",
    invoice_date: "",
    grn_date: new Date().toISOString().slice(0, 10),
    total_amount: "",
  });
  const [partialDelivery, setPartialDelivery] = useState<{
    id: string;
    invoice_date: string | null;
  } | null>(null);
  const [rawExtraction, setRawExtraction] = useState<unknown>(null);
  const [reviewLines, setReviewLines] = useState<ReviewLine[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
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

  const docsByLineId = useMemo(() => {
    const map = new Map<string, GrnLineDoc[]>();
    for (const doc of lineDocs) {
      map.set(doc.grn_line_item_id, [...(map.get(doc.grn_line_item_id) ?? []), doc]);
    }
    return map;
  }, [lineDocs]);

  const complianceDocsByMaterialId = useMemo(() => {
    const map = new Map<
      string,
      Partial<Record<"test_certificate" | "tds", MaterialComplianceDoc>>
    >();
    for (const doc of materialComplianceDocs) {
      const current = map.get(doc.material_id) ?? {};
      current[doc.doc_type] = doc;
      map.set(doc.material_id, current);
    }
    return map;
  }, [materialComplianceDocs]);

  const lineComplianceCounts = useCallback(
    (line: GrnLine) =>
      calculateLineCompliance(
        docsByLineId.get(line.id) ?? [],
        line.material_id ? complianceDocsByMaterialId.get(line.material_id) : undefined
      ),
    [complianceDocsByMaterialId, docsByLineId]
  );

  const invoiceComplianceCounts = useCallback(
    (grn: RecentGrn) =>
      (grn.grn_line_items ?? []).reduce<ComplianceCounts>(
        (acc, line) => {
          const lineCounts = lineComplianceCounts(line);
          acc.completed += lineCounts.completed;
          acc.total += lineCounts.total;
          acc.pending += lineCounts.pending;
          return acc;
        },
        { completed: 0, total: 0, pending: 0 }
      ),
    [lineComplianceCounts]
  );

  const invoiceGroups = useMemo<InvoiceGroup[]>(() => {
    const groups = new Map<string, InvoiceGroup>();

    for (const grn of recentGrns) {
      const supplier = supplierFromJoin(grn.suppliers);
      const supplierName =
        supplier?.supplier_name ||
        rawValue(grn.ai_extracted_raw, "vendor_name") ||
        "Unknown vendor";
      const invoiceNumber = grn.invoice_number || "Draft";
      const key = `${grn.supplier_id ?? supplierName}|${invoiceNumber}`;
      const existing =
        groups.get(key) ??
        {
          key,
          invoiceNumber,
          supplierName,
          invoices: [],
          totalAmount: 0,
          itemCount: 0,
          compliance: { completed: 0, total: 0, pending: 0 },
        };

      const lines = grn.grn_line_items ?? [];
      const amount =
        lines.length > 0
          ? lines.reduce((sum, line) => sum + (Number(line.amount_with_gst) || 0), 0)
          : Number(grn.total_amount) || 0;
      const compliance = invoiceComplianceCounts(grn);

      existing.invoices.push(grn);
      existing.totalAmount += amount;
      existing.itemCount += lines.length;
      existing.compliance.completed += compliance.completed;
      existing.compliance.total += compliance.total;
      existing.compliance.pending += compliance.pending;
      groups.set(key, existing);
    }

    return Array.from(groups.values());
  }, [invoiceComplianceCounts, recentGrns]);

  function inferSupplierId(vendorName: string, vendorGstin: string | null) {
    const gstin = vendorGstin?.trim().toLowerCase();
    if (gstin) {
      const exact = suppliers.find(
        (supplier) => supplier.gstin?.trim().toLowerCase() === gstin
      );
      if (exact) return exact.id;
    }

    const vendor = vendorName.trim().toLowerCase();
    if (!vendor) return "";

    return (
      suppliers.find((supplier) =>
        vendor.includes(supplier.supplier_name.toLowerCase())
      )?.id ||
      suppliers.find((supplier) =>
        supplier.supplier_name.toLowerCase().includes(vendor)
      )?.id ||
      ""
    );
  }

  const loadData = useCallback(async () => {
    setIsLoadingData(true);
    const [sitesResult, suppliersResult, materialsResult] = await Promise.all([
      supabase
        .from("sites")
        .select("id,name")
        .order("created_at", { ascending: false }),
      supabase
        .from("suppliers")
        .select("id,supplier_name,gstin")
        .order("supplier_name", { ascending: true }),
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

    if (suppliersResult.error) toast.error(suppliersResult.error.message);
    else setSuppliers(suppliersResult.data ?? []);

    if (materialsResult.error) toast.error(materialsResult.error.message);
    else setMaterials(materialsResult.data ?? []);

    if (!selectedSiteId && !sitesResult.data?.[0]?.id) {
      setRecentGrns([]);
      setLineDocs([]);
      setIsLoadingData(false);
      return;
    }

    const siteId = selectedSiteId || sitesResult.data?.[0]?.id;
    let query = supabase
      .from("grn_invoices")
      .select(
        "id,site_id,supplier_id,suppliers(id,supplier_name),invoice_number,invoice_date,grn_date,total_amount,status,ai_extracted_raw,grn_invoice_dc(id,grn_invoice_id,is_applicable,is_uploaded,file_path,file_name,document_date,uploaded_at),grn_line_items(id,grn_invoice_id,material_id,material_name,quantity,unit,rate,gst_rate,amount_with_gst,ai_match_confidence)"
      )
      .order("created_at", { ascending: false });

    if (siteId) query = query.eq("site_id", siteId);
    if (selectedSupplierId !== "all") query = query.eq("supplier_id", selectedSupplierId);

    const grnsResult = await query;

    if (grnsResult.error) {
      toast.error(grnsResult.error.message);
      setRecentGrns([]);
      setLineDocs([]);
      setMaterialComplianceDocs([]);
      setIsLoadingData(false);
      return;
    }

    const grns = (grnsResult.data ?? []) as unknown as RecentGrn[];
    setRecentGrns(grns);

    const lineIds = grns.flatMap((grn) =>
      (grn.grn_line_items ?? []).map((line) => line.id)
    );

    if (lineIds.length === 0) {
      setLineDocs([]);
    } else {
      const docsResult = await supabase
        .from("grn_line_item_documents")
        .select(
          "grn_line_item_id,document_type,is_applicable,is_uploaded,file_path,file_name"
        )
        .in("grn_line_item_id", lineIds);

      if (docsResult.error) {
        toast.error(docsResult.error.message);
        setLineDocs([]);
      } else {
        setLineDocs((docsResult.data ?? []) as GrnLineDoc[]);
      }
    }

    const materialIds = Array.from(
      new Set(
        grns
          .flatMap((grn) => grn.grn_line_items ?? [])
          .map((line) => line.material_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (materialIds.length === 0) {
      setMaterialComplianceDocs([]);
    } else {
      const materialDocsResult = await supabase
        .from("material_compliance_documents")
        .select("material_id,doc_type,status,file_path,file_name")
        .in("material_id", materialIds);

      if (materialDocsResult.error) {
        toast.error(materialDocsResult.error.message);
        setMaterialComplianceDocs([]);
      } else {
        setMaterialComplianceDocs((materialDocsResult.data ?? []) as MaterialComplianceDoc[]);
      }
    }

    setIsLoadingData(false);
  }, [selectedSiteId, selectedSupplierId]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) loadData();
    });
    return () => {
      mounted = false;
    };
  }, [loadData]);

  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (editId) {
      openEditWizard(editId);
    }
    // The direct-link bootstrapping should only happen once on page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;

    async function checkPartialDelivery() {
      if (
        editGrnId ||
        step < 1 ||
        !selectedSiteId ||
        !invoiceForm.supplier_id ||
        !invoiceForm.invoice_number.trim()
      ) {
        setPartialDelivery(null);
        return;
      }

      const { data, error } = await supabase
        .from("grn_invoices")
        .select("id,invoice_date")
        .eq("site_id", selectedSiteId)
        .eq("supplier_id", invoiceForm.supplier_id)
        .eq("invoice_number", invoiceForm.invoice_number.trim())
        .limit(1)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        setPartialDelivery(null);
      } else {
        setPartialDelivery(data);
      }
    }

    checkPartialDelivery();
    return () => {
      mounted = false;
    };
  }, [editGrnId, invoiceForm.invoice_number, invoiceForm.supplier_id, selectedSiteId, step]);

  function resetWizard() {
    setEditGrnId(null);
    setStep(0);
    setIsDragging(false);
    setUploadedFile(null);
    setFilePath("");
    setSignedUrl("");
    setMime("");
    setAgentLogs([]);
    setIsRunningAgents(false);
    setInvoiceForm({
      supplier_id: "",
      vendor_name: "",
      vendor_gstin: "",
      invoice_number: "",
      invoice_date: "",
      grn_date: new Date().toISOString().slice(0, 10),
      total_amount: "",
    });
    setPartialDelivery(null);
    setRawExtraction(null);
    setReviewLines([]);
  }

  function closeWizard() {
    setWizardOpen(false);
    resetWizard();
    router.replace("/grn");
  }

  function openWizard() {
    resetWizard();
    router.replace("/grn");
    setWizardOpen(true);
  }

  function openManualGrn() {
    resetWizard();
    router.replace("/grn");
    setRawExtraction({ entry_mode: "manual" });
    setReviewLines([
      {
        description: "",
        hsn_code: null,
        quantity: "",
        unit: "",
        rate: "",
        gst_rate: "18",
        amount_with_gst: "",
        material_id: "",
        confidence: 1,
        reasoning: "Manual entry.",
        suggested_new: null,
      },
    ]);
    setStep(2);
    setWizardOpen(true);
  }

  async function loadEditGrn(grnId: string) {
    setIsLoadingEdit(true);

    try {
      const { data, error } = await supabase
        .from("grn_invoices")
        .select(
          "id,site_id,supplier_id,invoice_number,invoice_date,grn_date,total_amount,source_file_path,ai_extracted_raw,grn_line_items(id,grn_invoice_id,material_id,material_name,quantity,unit,rate,gst_rate,amount_with_gst,ai_match_confidence)"
        )
        .eq("id", grnId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("GRN not found.");

      const grn = data as unknown as EditGrn;
      setEditGrnId(grn.id);
      setSelectedSiteId(grn.site_id ?? selectedSiteId);
      setFilePath(grn.source_file_path ?? "");
      setSignedUrl("");
      setMime("");
      setUploadedFile(null);
      setAgentLogs([]);
      setRawExtraction(grn.ai_extracted_raw);
      setInvoiceForm({
        supplier_id: grn.supplier_id ?? "",
        vendor_name: rawValue(grn.ai_extracted_raw, "vendor_name"),
        vendor_gstin: rawValue(grn.ai_extracted_raw, "vendor_gstin"),
        invoice_number: grn.invoice_number ?? "",
        invoice_date: grn.invoice_date ?? "",
        grn_date: grn.grn_date ?? new Date().toISOString().slice(0, 10),
        total_amount: String(grn.total_amount ?? ""),
      });
      setReviewLines(
        (grn.grn_line_items ?? []).map((line) => ({
          description: line.material_name ?? "",
          hsn_code: null,
          quantity: String(line.quantity ?? ""),
          unit: line.unit ?? "",
          rate: String(line.rate ?? ""),
          gst_rate: String(line.gst_rate ?? ""),
          amount_with_gst: String(line.amount_with_gst ?? ""),
          material_id: line.material_id ?? "",
          confidence: line.ai_match_confidence ?? 1,
          reasoning: "Loaded from existing GRN.",
          suggested_new: null,
        }))
      );
      setPartialDelivery(null);
      setStep(2);
      setWizardOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load GRN for edit.");
      setEditGrnId(null);
    } finally {
      setIsLoadingEdit(false);
    }
  }

  function openEditWizard(grnId: string) {
    resetWizard();
    router.push(`/grn?edit=${grnId}`);
    loadEditGrn(grnId);
  }

  function appendLog(message: string) {
    setAgentLogs((current) => [...current, message]);
  }

  async function uploadInvoice(file: File) {
    if (!selectedSiteId) {
      toast.error("Select a site first.");
      return;
    }

    if (!isInvoiceFile(file)) {
      toast.error("Upload a PDF, PNG, or JPG invoice.");
      return;
    }

    setUploadedFile(file);
    const nextMime =
      file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png");
    const nextPath = makeGrnStoragePath(selectedSiteId, file);
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
    appendLog("Vision agent reading invoice...");

    try {
      const extractionResponse = await fetch("/api/ai/extract-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: nextPath, mime: nextMime }),
      });
      const extractionPayload = await extractionResponse.json();
      if (!extractionResponse.ok) {
        throw new Error(extractionPayload.error ?? "Invoice extraction failed.");
      }

      const extracted = extractionPayload.parsed as ExtractedInvoice;
      const supplierId = inferSupplierId(extracted.vendor_name, extracted.vendor_gstin);
      setRawExtraction(extracted);
      setInvoiceForm({
        supplier_id: supplierId,
        vendor_name: extracted.vendor_name,
        vendor_gstin: extracted.vendor_gstin ?? "",
        invoice_number: extracted.invoice_number,
        invoice_date: extracted.invoice_date,
        grn_date: new Date().toISOString().slice(0, 10),
        total_amount: String(extracted.total_amount ?? ""),
      });
      appendLog(`Parsed vendor: ${extracted.vendor_name}`);
      appendLog(`Found ${extracted.line_items.length} line items`);
      appendLog("Matching materials against master library...");

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
          hsn_code: item.hsn_code,
          quantity: String(item.quantity ?? ""),
          unit: item.unit,
          rate: String(item.rate ?? ""),
          gst_rate: String(item.gst_rate ?? ""),
          amount_with_gst: String(item.amount_with_gst ?? ""),
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
      toast.error(error instanceof Error ? error.message : "GRN wizard failed.");
    } finally {
      setIsRunningAgents(false);
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) uploadInvoice(file);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) uploadInvoice(file);
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
        hsn_code: null,
        quantity: "",
        unit: "",
        rate: "",
        gst_rate: "18",
        amount_with_gst: "",
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

  function buildLineRows(grnInvoiceId: string) {
    return reviewLines.map((line) => {
      const material = materialById.get(line.material_id);
      return {
        grn_invoice_id: grnInvoiceId,
        material_id: normalizeUuid(line.material_id),
        material_name: material?.name ?? line.description,
        quantity: Number(line.quantity) || null,
        unit: line.unit,
        rate: Number(line.rate) || null,
        gst_rate: Number(line.gst_rate) || null,
        amount_with_gst: Number(line.amount_with_gst) || null,
        ai_match_confidence: line.confidence,
      };
    });
  }

  async function ensureComplianceSlotsForReviewLines() {
    const materialIds = Array.from(
      new Set(
        reviewLines
          .map((line) => normalizeUuid(line.material_id))
          .filter((id): id is string => Boolean(id))
      )
    );
    if (materialIds.length === 0) return;

    const rows = materialIds.flatMap((materialId) => [
      { material_id: materialId, doc_type: "test_certificate", status: "pending" },
      { material_id: materialId, doc_type: "tds", status: "pending" },
    ]);

    const { error } = await supabase
      .from("material_compliance_documents")
      .upsert(rows, { onConflict: "material_id,doc_type", ignoreDuplicates: true });

    if (error) throw new Error(error.message);
  }

  async function removeStorageFiles(paths: string[]) {
    for (let index = 0; index < paths.length; index += 100) {
      const chunk = paths.slice(index, index + 100);
      if (chunk.length === 0) continue;
      const { error } = await supabase.storage.from("boqai-docs").remove(chunk);
      if (error) throw new Error(error.message);
    }
  }

  async function cleanupLineItemDocumentFiles(grnId: string) {
    const { data: lines, error: linesError } = await supabase
      .from("grn_line_items")
      .select("id")
      .eq("grn_invoice_id", grnId);

    if (linesError) throw new Error(linesError.message);

    const lineIds = (lines ?? []).map((line) => line.id as string);
    if (lineIds.length === 0) return 0;

    const { data: docs, error: docsError } = await supabase
      .from("grn_line_item_documents")
      .select("file_path")
      .in("grn_line_item_id", lineIds)
      .not("file_path", "is", null);

    if (docsError) throw new Error(docsError.message);

    const paths = uniquePaths((docs ?? []).map((doc) => doc.file_path as string | null));
    await removeStorageFiles(paths);
    return paths.length;
  }

  async function commitGrn() {
    if (!selectedSiteId) {
      toast.error("Missing site.");
      return;
    }

    setIsCommitting(true);
    try {
      if (editGrnId) {
        const confirmed = window.confirm(
          "Editing replaces all line items. Uploaded line-item docs (Test Cert, TDS, MIR) will be cleared."
        );
        if (!confirmed) return;

        await cleanupLineItemDocumentFiles(editGrnId);

        const { error: invoiceError } = await supabase
          .from("grn_invoices")
          .update({
            site_id: selectedSiteId,
            supplier_id: normalizeUuid(invoiceForm.supplier_id),
            invoice_number: invoiceForm.invoice_number,
            invoice_date: invoiceForm.invoice_date || null,
            grn_date: invoiceForm.grn_date || new Date().toISOString().slice(0, 10),
            total_amount: Number(invoiceForm.total_amount) || null,
            source_file_path: filePath || null,
            ai_extracted_raw: rawExtraction,
            status: "committed",
          })
          .eq("id", editGrnId);

        if (invoiceError) throw new Error(invoiceError.message);

        const { error: deleteLinesError } = await supabase
          .from("grn_line_items")
          .delete()
          .eq("grn_invoice_id", editGrnId);

        if (deleteLinesError) throw new Error(deleteLinesError.message);

        const rows = buildLineRows(editGrnId);
        if (rows.length > 0) {
          const { error: lineError } = await supabase.from("grn_line_items").insert(rows);
          if (lineError) throw new Error(lineError.message);
        }

        await ensureComplianceSlotsForReviewLines();

        toast.success("GRN updated.");
        closeWizard();
        await loadData();
        return;
      }

      const { data: invoice, error: invoiceError } = await supabase
        .from("grn_invoices")
        .insert({
          site_id: selectedSiteId,
          supplier_id: normalizeUuid(invoiceForm.supplier_id),
          invoice_number: invoiceForm.invoice_number,
          invoice_date: invoiceForm.invoice_date || null,
          grn_date: invoiceForm.grn_date || new Date().toISOString().slice(0, 10),
          total_amount: Number(invoiceForm.total_amount) || null,
          source_file_path: filePath || null,
          ai_extracted_raw: rawExtraction ?? { entry_mode: "manual" },
          status: "committed",
        })
        .select("id")
        .single();

      if (invoiceError || !invoice) {
        throw new Error(invoiceError?.message ?? "Could not create GRN.");
      }

      if (filePath) {
        const { error: dcError } = await supabase.from("grn_invoice_dc").upsert(
          {
            grn_invoice_id: invoice.id,
            is_applicable: true,
            is_uploaded: true,
            file_path: filePath,
            file_name: uploadedFile?.name ?? fileNameFromPath(filePath),
            uploaded_at: new Date().toISOString(),
            document_date: invoiceForm.invoice_date || null,
          },
          { onConflict: "grn_invoice_id" }
        );

        if (dcError) {
          throw new Error(dcError.message);
        }
      }

      const rows = buildLineRows(invoice.id);

      if (rows.length > 0) {
        const { error: lineError } = await supabase.from("grn_line_items").insert(rows);
        if (lineError) throw new Error(lineError.message);
      }

      await ensureComplianceSlotsForReviewLines();

      toast.success(partialDelivery ? "Partial delivery GRN created" : "GRN created");
      closeWizard();
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? `Commit failed: ${error.message}` : "Commit failed.");
    } finally {
      setIsCommitting(false);
    }
  }

  function toggleGroup(key: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function deleteGrn(grn: RecentGrn) {
    const confirmed = window.confirm(
      "Delete GRN and all attachments? This cannot be undone."
    );
    if (!confirmed) return;

    try {
      const [invoiceResult, dcResult, linesResult] = await Promise.all([
        supabase
          .from("grn_invoices")
          .select("source_file_path")
          .eq("id", grn.id)
          .maybeSingle(),
        supabase
          .from("grn_invoice_dc")
          .select("file_path")
          .eq("grn_invoice_id", grn.id)
          .not("file_path", "is", null),
        supabase
          .from("grn_line_items")
          .select("id")
          .eq("grn_invoice_id", grn.id),
      ]);

      if (invoiceResult.error) throw new Error(invoiceResult.error.message);
      if (dcResult.error) throw new Error(dcResult.error.message);
      if (linesResult.error) throw new Error(linesResult.error.message);

      const lineIds = (linesResult.data ?? []).map((line) => line.id as string);
      let docPaths: string[] = [];
      if (lineIds.length > 0) {
        const { data, error } = await supabase
          .from("grn_line_item_documents")
          .select("file_path")
          .in("grn_line_item_id", lineIds)
          .not("file_path", "is", null);

        if (error) throw new Error(error.message);
        docPaths = (data ?? []).map((doc) => doc.file_path as string);
      }

      const paths = uniquePaths([
        invoiceResult.data?.source_file_path,
        ...(dcResult.data ?? []).map((dc) => dc.file_path as string | null),
        ...docPaths,
      ]);

      await removeStorageFiles(paths);

      const { error } = await supabase.from("grn_invoices").delete().eq("id", grn.id);
      if (error) throw new Error(error.message);

      toast.success(`GRN deleted - ${paths.length} files removed.`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete GRN.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-slate-400">
            <PackageCheck className="size-4 text-[var(--accent)]" />
            Goods receipt invoice intake
          </p>
          <h1 className="bg-gradient-to-r from-white via-blue-100 to-fuchsia-200 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            GRN
          </h1>
        </div>
        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl md:grid-cols-[1fr_1fr_auto_auto] md:items-center">
          <select
            value={selectedSiteId}
            onChange={(event) => setSelectedSiteId(event.target.value)}
            className="h-10 min-w-64 rounded-xl border border-white/10 bg-[#0b0d14] px-3 text-sm text-white outline-none focus:border-blue-400/60"
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <select
            value={selectedSupplierId}
            onChange={(event) => setSelectedSupplierId(event.target.value)}
            className="h-10 min-w-64 rounded-xl border border-white/10 bg-[#0b0d14] px-3 text-sm text-white outline-none focus:border-blue-400/60"
          >
            <option value="all">All suppliers</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.supplier_name}
              </option>
            ))}
          </select>
          <Button
            className="h-10 gap-2 bg-[var(--brand)] text-white hover:bg-blue-500"
            onClick={openWizard}
            disabled={!selectedSiteId}
          >
            <Plus className="size-4" />
            AI Scan
          </Button>
          <Button
            variant="outline"
            className="h-10 gap-2 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            onClick={openManualGrn}
            disabled={!selectedSiteId}
          >
            <Pencil className="size-4" />
            Manual GRN
          </Button>
        </div>
      </header>

      <GlassCard className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-white">
            GRNs grouped by invoice
          </h2>
          <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">
            {invoiceGroups.length} groups
          </Badge>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 text-right font-medium">GRNs</th>
                <th className="px-4 py-3 text-right font-medium">Items</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">DC</th>
                <th className="px-4 py-3 text-right font-medium">Docs</th>
              </tr>
            </thead>
            {isLoadingData ? (
              <ElectricTableSkeleton rows={5} columns={7} />
            ) : (
              <tbody className="divide-y divide-white/10">
                {invoiceGroups.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center">
                      <p className="text-lg font-semibold text-white">No GRNs yet</p>
                      <p className="mt-2 text-sm text-slate-400">
                        Try the AI Invoice Extraction flow to create the first GRN.
                      </p>
                      <Button
                        className="mt-5 bg-[var(--brand)] text-white hover:bg-blue-500"
                        onClick={openWizard}
                      >
                        AI Invoice Extraction
                      </Button>
                    </td>
                  </tr>
                ) : (
                  invoiceGroups.map((group) => {
                    const expanded = expandedGroups.has(group.key);
                    const firstInvoice = group.invoices[0];

                    return (
                      <Fragment key={group.key}>
                        <tr
                          className="cursor-pointer bg-white/[0.02] text-slate-300 transition hover:bg-white/[0.05]"
                          onClick={() => toggleGroup(group.key)}
                        >
                          <td className="px-4 py-3 font-medium text-white">
                            <span className="inline-flex items-center gap-2">
                              {expanded ? (
                                <ChevronDown className="size-4 text-slate-400" />
                              ) : (
                                <ChevronRight className="size-4 text-slate-400" />
                              )}
                              {group.invoiceNumber}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            <span className="inline-flex items-center gap-2">
                              <Building2 className="size-4 text-slate-500" />
                              {group.supplierName}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">{group.invoices.length}</td>
                          <td className="px-4 py-3 text-right">{group.itemCount}</td>
                          <td className="px-4 py-3 text-right">
                            {formatAmount(group.totalAmount)}
                          </td>
                          <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                            <GrnDcDialog
                              invoiceId={firstInvoice.id}
                              invoiceNumber={firstInvoice.invoice_number}
                              grnDate={firstInvoice.grn_date}
                              vendorName={group.supplierName}
                              dc={firstInvoice.grn_invoice_dc}
                              onChanged={loadData}
                              className="max-w-52"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Badge
                              variant="outline"
                              className={complianceBadgeClass(group.compliance)}
                            >
                              {group.compliance.completed}/{group.compliance.total}
                            </Badge>
                          </td>
                        </tr>
                        {expanded
                          ? group.invoices.map((grn) => {
                              const lines = grn.grn_line_items ?? [];
                              const amount =
                                lines.reduce(
                                  (sum, line) => sum + (Number(line.amount_with_gst) || 0),
                                  0
                                ) ||
                                Number(grn.total_amount) ||
                                0;
                              const compliance = invoiceComplianceCounts(grn);
                              const dc = dcFromJoin(grn.grn_invoice_dc);

                              return (
                                <tr
                                  key={grn.id}
                                  className="bg-black/20 text-slate-300"
                                >
                                  <td colSpan={7} className="px-4 py-3">
                                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                                      <div className="grid gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                                          <span className="inline-flex items-center gap-2 font-medium text-white">
                                            <Calendar className="size-4 text-blue-300" />
                                            GRN: {grn.grn_date || "-"}
                                          </span>
                                          <span className="text-slate-400">
                                            {lines.length} item{lines.length === 1 ? "" : "s"}
                                          </span>
                                          <span className="font-medium text-slate-200">
                                            {formatAmount(amount)}
                                          </span>
                                          <span className="text-slate-500">
                                            DC inherited
                                            {dc?.is_uploaded
                                              ? " - uploaded"
                                              : dc?.is_applicable === false
                                                ? " - N/A"
                                                : " - pending"}
                                          </span>
                                        </div>
                                        <Badge
                                          variant="outline"
                                          className={cn("w-fit", complianceBadgeClass(compliance))}
                                        >
                                          Docs {compliance.completed}/{compliance.total}
                                        </Badge>
                                        <div className="flex justify-end gap-2">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-white/10 bg-white/5 text-slate-200"
                                            onClick={() => openEditWizard(grn.id)}
                                          >
                                            <Pencil className="size-3.5" />
                                            Edit
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-red-400/20 bg-red-400/10 text-red-100"
                                            onClick={() => deleteGrn(grn)}
                                          >
                                            <Trash2 className="size-3.5" />
                                            Delete
                                          </Button>
                                        </div>
                                      </div>

                                      {lines.length === 0 ? (
                                        <div className="px-4 py-4 text-sm text-slate-500">
                                          No material line items found for this GRN.
                                        </div>
                                      ) : (
                                        <div className="divide-y divide-white/10">
                                          {lines.map((line) => {
                                            const lineCompliance = lineComplianceCounts(line);

                                            return (
                                              <div
                                                key={line.id}
                                                className="grid gap-3 px-4 py-3 transition hover:bg-white/[0.03] lg:grid-cols-[1fr_auto_auto]"
                                              >
                                                <div>
                                                  <p className="font-medium text-white">
                                                    {line.material_name || "Unmapped material"}
                                                  </p>
                                                  <p className="mt-1 text-xs text-slate-500">
                                                    {formatAmount(line.quantity)} {line.unit || "-"}
                                                    {" @ "}
                                                    {formatAmount(line.rate)}
                                                    {"  GST: "}
                                                    {formatAmount(line.gst_rate)}%
                                                  </p>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                                  <Badge
                                                    variant="outline"
                                                    className="border-blue-400/20 bg-blue-400/10 text-blue-200"
                                                  >
                                                    AI {formatPercent(line.ai_match_confidence)}
                                                  </Badge>
                                                  <Badge
                                                    variant="outline"
                                                    className={complianceBadgeClass(lineCompliance)}
                                                  >
                                                    Docs {lineCompliance.completed}/{lineCompliance.total}
                                                  </Badge>
                                                </div>
                                                <div className="text-left font-semibold text-slate-100 lg:text-right">
                                                  {formatAmount(line.amount_with_gst)}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          : null}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            )}
          </table>
        </div>
      </GlassCard>

      <Sheet
        open={wizardOpen}
        onOpenChange={(open) => {
          if (open) setWizardOpen(true);
          else closeWizard();
        }}
      >
        <SheetContent
          className="w-full max-w-none border-white/10 bg-[#080a10]/95 p-0 backdrop-blur-xl data-[side=right]:w-full data-[side=right]:sm:w-[720px] data-[side=right]:sm:max-w-none data-[side=right]:lg:w-[960px] data-[side=right]:xl:w-[1120px]"
          showCloseButton
        >
          <SheetHeader className="border-b border-white/10 p-5">
            <SheetTitle className="text-xl text-white">
              {editGrnId ? "Edit GRN" : "New GRN from Invoice"}
            </SheetTitle>
            <SheetDescription>
              {editGrnId
                ? "Review and update the existing GRN. Extraction is skipped."
                : step === 2 && !filePath
                  ? "Manually enter invoice and material receipt details, then commit."
                  : "Upload invoice -> AI extracts -> AI matches materials -> commit."}
              {uploadedFile ? ` Current file: ${uploadedFile.name}.` : ""}
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
                  Scan or upload invoice
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
                    <img src={signedUrl} alt="Uploaded invoice" className="h-[72vh] w-full object-contain" />
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
                      <label className="grid gap-1">
                        <span className="flex items-center gap-2 text-xs uppercase text-slate-500">
                          supplier
                          <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] text-fuchsia-200">
                            AI
                          </span>
                        </span>
                        <select
                          value={invoiceForm.supplier_id}
                          onChange={(event) =>
                            setInvoiceForm((current) => ({
                              ...current,
                              supplier_id: event.target.value,
                            }))
                          }
                          className="h-10 rounded-lg border border-white/10 bg-[#0b0d14] px-3 text-sm text-white outline-none"
                        >
                          <option value="">Unknown / no supplier</option>
                          {suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.supplier_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {[
                        "vendor_name",
                        "vendor_gstin",
                        "invoice_number",
                        "invoice_date",
                        "grn_date",
                        "total_amount",
                      ].map((key) => (
                        <label key={key} className="grid gap-1">
                          <span className="flex items-center gap-2 text-xs uppercase text-slate-500">
                            {key.replaceAll("_", " ")}
                            <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] text-fuchsia-200">
                              AI
                            </span>
                          </span>
                          <Input
                            value={invoiceForm[key as keyof typeof invoiceForm]}
                            onChange={(event) =>
                              setInvoiceForm((current) => ({
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
                    <h3 className="font-semibold text-white">Invoice details</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Enter the receipt header once, then add one or more material lines below.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="grid gap-1.5 sm:col-span-2">
                      <span className="text-xs font-medium uppercase text-slate-500">Supplier</span>
                      <select
                        value={invoiceForm.supplier_id}
                        onChange={(event) =>
                          setInvoiceForm((current) => ({
                            ...current,
                            supplier_id: event.target.value,
                          }))
                        }
                        className="h-10 rounded-lg border border-white/10 bg-[#0b0d14] px-3 text-sm text-white outline-none"
                      >
                        <option value="">Unknown / no supplier</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.supplier_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {[ 
                      ["invoice_number", "Invoice No."],
                      ["invoice_date", "Invoice Date"],
                      ["grn_date", "GRN Date"],
                      ["total_amount", "Total Amount"],
                    ].map(([key, label]) => (
                      <label key={key} className="grid gap-1.5">
                        <span className="text-xs font-medium uppercase text-slate-500">{label}</span>
                        <Input
                          value={invoiceForm[key as keyof typeof invoiceForm]}
                          onChange={(event) =>
                            setInvoiceForm((current) => ({
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
                {isLoadingEdit ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    Loading GRN for edit...
                  </div>
                ) : null}
                {editGrnId ? (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                    Editing replaces all line items. Uploaded line-item docs (Test Cert, TDS, MIR) will be cleared.
                  </div>
                ) : null}
                {partialDelivery ? (
                  <div className="rounded-xl border border-blue-400/20 bg-blue-500/10 p-4 text-sm text-blue-100">
                    Partial delivery detected - adding new GRN entry for existing invoice{" "}
                    <strong>{invoiceForm.invoice_number}</strong>
                    {partialDelivery.invoice_date
                      ? ` (invoice date ${partialDelivery.invoice_date}).`
                      : "."}
                  </div>
                ) : null}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-white">Material received</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Each card becomes one inventory receipt line.
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
                          <p className="text-sm font-semibold text-white">Material line {index + 1}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Select the master material and capture invoice quantity/value.
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

                      <div className="grid gap-4 xl:grid-cols-[1.2fr_1.2fr]">
                        <label className="grid gap-1.5">
                          <span className="text-xs font-medium uppercase text-slate-500">
                            Invoice description
                          </span>
                          <Input
                            value={line.description}
                            onChange={(event) => updateLine(index, "description", event.target.value)}
                            className="h-10 border-white/10 bg-white/5 text-white"
                          />
                        </label>

                        <label className="grid gap-1.5">
                          <span className="text-xs font-medium uppercase text-slate-500">
                            Master material
                          </span>
                          <select
                            value={line.material_id}
                            onChange={(event) => updateLine(index, "material_id", event.target.value)}
                            className="h-10 rounded-lg border border-white/10 bg-[#0b0d14] px-3 text-sm text-white outline-none"
                          >
                            <option value="">Unmapped / create new</option>
                            {materials.map((material) => (
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
                          {!line.material_id ? (
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

                      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                        <label className="grid gap-1.5">
                          <span className="text-xs font-medium uppercase text-slate-500">Rate</span>
                          <Input
                            value={line.rate}
                            onChange={(event) => updateLine(index, "rate", event.target.value)}
                            className="h-10 border-white/10 bg-white/5 text-right text-white"
                          />
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-xs font-medium uppercase text-slate-500">Amount with GST</span>
                          <Input
                            value={line.amount_with_gst}
                            onChange={(event) => updateLine(index, "amount_with_gst", event.target.value)}
                            className="h-10 border-white/10 bg-white/5 text-right text-white"
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
                    onClick={commitGrn}
                  >
                    <CheckCircle2 className="size-4" />
                    {isCommitting ? "Committing..." : "Commit GRN"}
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
