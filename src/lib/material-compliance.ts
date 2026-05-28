import type { SupabaseClient } from "@supabase/supabase-js";

export type DocType = "test_certificate" | "tds";
export type LineDocType = "mir" | DocType;
export type DocStatus = "pending" | "uploaded" | "not_applicable";
export type LegacyDocStatus = DocStatus | "flagged";
export type EffectiveDocStatus = "pending" | "uploaded" | "na";
export type LegacyEffectiveDocStatus = EffectiveDocStatus | "flagged";

export type LineDoc = {
  is_applicable: boolean;
  is_uploaded: boolean;
  file_path?: string | null;
  file_name?: string | null;
};

export type LibSlot =
  | {
      status: DocStatus;
      file_path?: string | null;
      file_name?: string | null;
    }
  | undefined;

export type MaterialComplianceMap = Map<
  string,
  {
    test_certificate?: LibSlot;
    tds?: LibSlot;
  }
>;

type LegacyLibraryDoc =
  | {
      status?: LegacyDocStatus | null;
      file_path?: string | null;
      file_name?: string | null;
    }
  | undefined;

type MaterialComplianceRow = {
  material_id: string;
  doc_type: DocType;
  status: DocStatus;
  file_path: string | null;
  file_name: string | null;
};

export const DOC_TYPES: Array<{ value: DocType; label: string }> = [
  { value: "test_certificate", label: "Test Cert" },
  { value: "tds", label: "TDS" },
];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  test_certificate: "Test Certificate",
  tds: "TDS",
};

function isLineDoc(doc: LineDoc | LegacyLibraryDoc): doc is LineDoc {
  if (!doc) return false;
  return "is_applicable" in doc && "is_uploaded" in doc;
}

export function effectiveDocStatus(
  doc: LineDoc,
  libSlot: LibSlot
): EffectiveDocStatus;
export function effectiveDocStatus(doc: LegacyLibraryDoc): LegacyEffectiveDocStatus;
export function effectiveDocStatus(
  doc: LineDoc | LegacyLibraryDoc,
  libSlot?: LibSlot
): EffectiveDocStatus | LegacyEffectiveDocStatus {
  if (isLineDoc(doc)) {
    if (doc.is_applicable && doc.is_uploaded) return "uploaded";
    if (libSlot?.status === "uploaded") return "uploaded";
    if (!doc.is_applicable || libSlot?.status === "not_applicable") return "na";
    return "pending";
  }

  if (!doc) return "pending";
  if (doc.status === "flagged") return "flagged";
  if (doc.status === "uploaded" || (doc.file_path && doc.file_name)) {
    return "uploaded";
  }
  if (doc.status === "not_applicable") return "na";
  return "pending";
}

export function docStatusYN(
  status: EffectiveDocStatus | LegacyEffectiveDocStatus
): "Y" | "N" | "NA" {
  if (status === "uploaded") return "Y";
  if (status === "na") return "NA";
  return "N";
}

export async function fetchMaterialComplianceMap(
  supabase: SupabaseClient,
  materialIds: string[]
): Promise<MaterialComplianceMap> {
  const map: MaterialComplianceMap = new Map();
  if (!materialIds.length) return map;

  const { data, error } = await supabase
    .from("material_compliance_documents")
    .select("material_id, doc_type, status, file_path, file_name")
    .in("material_id", materialIds);

  if (error) throw new Error(error.message);

  for (const row of (data || []) as MaterialComplianceRow[]) {
    const current = map.get(row.material_id) || {};
    current[row.doc_type] = {
      status: row.status,
      file_path: row.file_path,
      file_name: row.file_name,
    };
    map.set(row.material_id, current);
  }

  return map;
}

export async function seedMaterialComplianceFromGrn(
  supabase: SupabaseClient,
  args: {
    material_id: string;
    doc_type: DocType;
    file_path: string;
    file_name: string;
  }
) {
  const { data: existing, error: fetchError } = await supabase
    .from("material_compliance_documents")
    .select("id, status")
    .eq("material_id", args.material_id)
    .eq("doc_type", args.doc_type)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (existing && existing.status !== "pending") return;

  const { error } = await supabase
    .from("material_compliance_documents")
    .upsert(
      {
        material_id: args.material_id,
        doc_type: args.doc_type,
        status: "uploaded",
        file_path: args.file_path,
        file_name: args.file_name,
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: "material_id,doc_type" }
    );

  if (error) throw new Error(error.message);
}

export const storagePath = {
  grnDC: (invoiceId: string, ext: string) =>
    `grn-invoices/${invoiceId}/dc_${Date.now()}.${ext}`,
  grnLineDoc: (lineId: string, docType: string, ext: string) =>
    `grn-line-item/${lineId}/${docType}_${Date.now()}.${ext}`,
  libraryDoc: (materialId: string, docType: string, ext: string) =>
    `material-compliance/${materialId}/${docType}_${Date.now()}.${ext}`,
  issueVoucher: (siteId: string, ext: string) =>
    `issue-vouchers/${siteId}/${crypto.randomUUID()}.${ext}`,
};
