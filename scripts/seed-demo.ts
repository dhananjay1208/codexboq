import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import jsPDF from "jspdf";

type Env = Record<string, string>;
type CountMap = Record<string, number>;

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const siteTowerId = "11111111-1111-4111-8111-111111111111";
const siteMetroId = "22222222-2222-4222-8222-222222222222";
const packageId = "55555555-5555-4555-8555-555555555501";

function readEnvFile(filePath: string) {
  if (!existsSync(filePath)) return {};

  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );
}

function loadEnv() {
  const processEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
  const env: Env = {
    ...readEnvFile(path.join(process.cwd(), ".env")),
    ...readEnvFile(path.join(process.cwd(), ".env.local")),
    ...processEnv,
  };

  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    if (!env[key]) throw new Error(`Missing ${key} in .env.local`);
  }

  return env;
}

function id(prefix: string, index: number) {
  return `${prefix}${String(index).padStart(12, "0")}`;
}

function isoDate(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function amount(quantity: number, rate: number) {
  return Number((quantity * rate).toFixed(2));
}

function withGst(quantity: number, rate: number, gstRate = 18) {
  return Number((quantity * rate * (1 + gstRate / 100)).toFixed(2));
}

function auditOk(docType: "test_certificate" | "tds", material: string) {
  return {
    doc_type_detected: docType,
    doc_type_matches_expected: true,
    material_mentioned: material,
    material_matches_expected: true,
    validity_date: "2027-03-31",
    issue_date: "2026-01-15",
    issuing_authority: "National Construction Test Laboratory",
    is_valid_today: true,
    flags: [],
    confidence: 0.94,
  };
}

function auditFlag(
  detected: "test_certificate" | "tds" | "other",
  expected: "test_certificate" | "tds",
  material: string,
  flags: string[]
) {
  return {
    doc_type_detected: detected,
    doc_type_matches_expected: detected === expected,
    material_mentioned: material,
    material_matches_expected: false,
    validity_date: detected === "other" ? null : "2025-08-31",
    issue_date: "2024-02-10",
    issuing_authority: "Vendor Uploaded Document",
    is_valid_today: false,
    flags,
    confidence: 0.82,
  };
}

const sites = [
  {
    id: siteTowerId,
    name: "Hackathon Demo Tower",
    location: "Bengaluru, Karnataka",
    client_name: "Outskill Realty",
    status: "active",
  },
  {
    id: siteMetroId,
    name: "Metro Station Phase II",
    location: "Mumbai, Maharashtra",
    client_name: "Metro Infra JV",
    status: "active",
  },
];

const suppliers = [
  {
    id: id("33333333-3333-4333-8333-", 1),
    supplier_name: "Shree Cement Distributors Pvt Ltd",
    gstin: "29AAECS1234F1Z5",
    address: "Peenya Industrial Area, Bengaluru, Karnataka",
    contact: "+91 98765 11001",
  },
  {
    id: id("33333333-3333-4333-8333-", 2),
    supplier_name: "Tata Tiscon Steel Traders",
    gstin: "27AAACT2727Q1ZW",
    address: "Kalamboli Steel Market, Navi Mumbai, Maharashtra",
    contact: "+91 98765 11002",
  },
  {
    id: id("33333333-3333-4333-8333-", 3),
    supplier_name: "BlueMetal Aggregates Co",
    gstin: "33AABCB5678M1Z2",
    address: "Oragadam Quarry Road, Chennai, Tamil Nadu",
    contact: "+91 98765 11003",
  },
  {
    id: id("33333333-3333-4333-8333-", 4),
    supplier_name: "ElectraBuild Solutions LLP",
    gstin: "07AAEFE4321L1Z8",
    address: "Okhla Industrial Estate, New Delhi",
    contact: "+91 98765 11004",
  },
  {
    id: id("33333333-3333-4333-8333-", 5),
    supplier_name: "Jain Plumbing & Sanitary Mart",
    gstin: "24AAAFJ9012K1Z6",
    address: "GIDC Vatva, Ahmedabad, Gujarat",
    contact: "+91 98765 11005",
  },
];

const materialSeed = [
  ["Cement", "OPC 53 Grade Cement", "bag"],
  ["Cement", "PPC Cement", "bag"],
  ["Cement", "Ready Mix Concrete M25", "cum"],
  ["Cement", "Ready Mix Concrete M30", "cum"],
  ["Cement", "Micro Silica Admixture", "kg"],
  ["Steel", "TMT Bar Fe500D 8 mm", "kg"],
  ["Steel", "TMT Bar Fe500D 12 mm", "kg"],
  ["Steel", "TMT Bar Fe500D 16 mm", "kg"],
  ["Steel", "TMT Bar Fe500D 20 mm", "kg"],
  ["Steel", "Binding Wire 18 Gauge", "kg"],
  ["Aggregates", "Crushed Stone Aggregate 20 mm", "cum"],
  ["Aggregates", "Crushed Stone Aggregate 10 mm", "cum"],
  ["Aggregates", "River Sand", "cum"],
  ["Aggregates", "Manufactured Sand", "cum"],
  ["Aggregates", "Granite Chips 6 mm", "cum"],
  ["Electrical", "FRLS Copper Wire 1.5 sqmm", "m"],
  ["Electrical", "FRLS Copper Wire 2.5 sqmm", "m"],
  ["Electrical", "PVC Conduit 25 mm", "m"],
  ["Electrical", "MCB Distribution Board 12 Way", "nos"],
  ["Electrical", "LED Panel Light 36W", "nos"],
  ["Plumbing", "CPVC Pipe 25 mm", "m"],
  ["Plumbing", "UPVC Soil Pipe 110 mm", "m"],
  ["Plumbing", "GI Pipe 40 mm Medium Class", "m"],
  ["Plumbing", "Ball Valve 25 mm Brass", "nos"],
  ["Plumbing", "Floor Trap 110 mm SS Grating", "nos"],
  ["Bricks", "Red Clay Brick Class 10", "nos"],
  ["Bricks", "AAC Block 600x200x100 mm", "nos"],
  ["Bricks", "Fly Ash Brick", "nos"],
  ["Bricks", "Concrete Solid Block 200 mm", "nos"],
  ["Finishes", "Vitrified Floor Tile 600x600 mm", "sqm"],
] as const;

const materials = materialSeed.map(([category, name, unit], index) => ({
  id: id("44444444-4444-4444-8444-", index + 1),
  category,
  name,
  unit,
  is_active: true,
}));

const headlineTitles = [
  "Earthwork and Substructure",
  "Concrete Works",
  "Reinforcement Steel",
  "Masonry Works",
  "Internal Plaster and Finishes",
  "Flooring",
  "Electrical Works",
  "Plumbing and Sanitary Works",
];

const headlines = headlineTitles.map((title, index) => ({
  id: id("66666666-6666-4666-8666-", index + 1),
  package_id: packageId,
  sl_no: String(index + 1),
  title,
  sort_order: index + 1,
}));

const boqDescriptions = [
  ["Excavation in foundation trenches including disposal", "cum", 420, 280],
  ["Anti-termite treatment below foundation", "sqm", 680, 48],
  ["PCC 1:4:8 below footing", "cum", 72, 5100],
  ["Backfilling with selected excavated earth", "cum", 330, 180],
  ["Soling with 40 mm aggregate", "cum", 58, 1450],
  ["RCC M25 for footings and pedestals", "cum", 155, 7300],
  ["RCC M30 for columns and shear walls", "cum", 210, 7850],
  ["RCC M25 for slabs and beams", "cum", 265, 7550],
  ["Formwork to columns, walls and beams", "sqm", 1650, 620],
  ["Waterproofing admixture for concrete", "kg", 820, 92],
  ["TMT steel Fe500D 8 mm bars", "kg", 6200, 68],
  ["TMT steel Fe500D 12 mm bars", "kg", 12800, 66],
  ["TMT steel Fe500D 16 mm bars", "kg", 9400, 65],
  ["Binding wire for reinforcement", "kg", 550, 82],
  ["Mechanical couplers for 20 mm bars", "nos", 480, 145],
  ["AAC block masonry 100 mm thick", "sqm", 1420, 840],
  ["Fly ash brick masonry 230 mm thick", "cum", 130, 6100],
  ["Concrete block masonry 200 mm thick", "sqm", 760, 980],
  ["Lintel bands over openings", "m", 520, 420],
  ["Raking out joints and surface preparation", "sqm", 1900, 32],
  ["Internal plaster 12 mm thick", "sqm", 5200, 180],
  ["External plaster 18 mm thick", "sqm", 3100, 240],
  ["Wall putty two coats", "sqm", 5100, 92],
  ["Acrylic emulsion paint two coats", "sqm", 5100, 115],
  ["Exterior weatherproof paint", "sqm", 2900, 155],
  ["Vitrified tile flooring 600x600 mm", "sqm", 2100, 980],
  ["Ceramic tile dado in toilets", "sqm", 870, 760],
  ["Granite threshold and sill", "m", 440, 690],
  ["Skirting with matching vitrified tile", "m", 1880, 125],
  ["Floor hardener in service areas", "sqm", 520, 210],
  ["FRLS copper wiring 1.5 sqmm", "m", 8400, 34],
  ["FRLS copper wiring 2.5 sqmm", "m", 6200, 52],
  ["PVC conduit concealed 25 mm", "m", 4100, 46],
  ["12 way MCB distribution board", "nos", 42, 3850],
  ["LED panel lights 36W", "nos", 360, 1180],
  ["CPVC pipe 25 mm hot and cold water", "m", 2300, 145],
  ["UPVC soil pipe 110 mm", "m", 860, 420],
  ["GI pipe 40 mm medium class", "m", 520, 690],
  ["Brass ball valves 25 mm", "nos", 155, 640],
  ["Floor trap with SS grating", "nos", 210, 380],
] as const;

const boqLineItems = boqDescriptions.map(([description, unit, quantity, rate], index) => {
  const headline = headlines[Math.floor(index / 5)];
  return {
    id: id("77777777-7777-4777-8777-", index + 1),
    headline_id: headline.id,
    sl_no: `${headline.sl_no}.${(index % 5) + 1}`,
    description,
    unit,
    quantity,
    rate,
    amount: amount(quantity, rate),
  };
});

const grnDates = [2, 8, 15, 24, 37].map(isoDate);
const invoiceSeeds = [
  {
    id: id("88888888-8888-4888-8888-", 1),
    supplier_id: suppliers[0].id,
    invoice_number: "SC/BOQ/2026/041",
    invoice_date: isoDate(3),
    grn_date: grnDates[0],
    source_file_path: "demo/grn/SC_BOQ_2026_041.pdf",
    materialIndexes: [0, 1, 2],
  },
  {
    id: id("88888888-8888-4888-8888-", 2),
    supplier_id: suppliers[1].id,
    invoice_number: "TTS/INV/1187",
    invoice_date: isoDate(9),
    grn_date: grnDates[1],
    source_file_path: "demo/grn/TTS_INV_1187.pdf",
    materialIndexes: [5, 6, 9],
  },
  {
    id: id("88888888-8888-4888-8888-", 3),
    supplier_id: suppliers[2].id,
    invoice_number: "BMA/2026/308",
    invoice_date: isoDate(16),
    grn_date: grnDates[2],
    source_file_path: "demo/grn/BMA_2026_308.pdf",
    materialIndexes: [10, 11, 13],
  },
  {
    id: id("88888888-8888-4888-8888-", 4),
    supplier_id: suppliers[3].id,
    invoice_number: "EBS/DEL/772",
    invoice_date: isoDate(25),
    grn_date: grnDates[3],
    source_file_path: "demo/grn/EBS_DEL_772.pdf",
    materialIndexes: [15, 16, 17, 19],
  },
  {
    id: id("88888888-8888-4888-8888-", 5),
    supplier_id: suppliers[4].id,
    invoice_number: "JPSM/5591",
    invoice_date: isoDate(38),
    grn_date: grnDates[4],
    source_file_path: "demo/grn/JPSM_5591.pdf",
    materialIndexes: [20, 21, 23],
  },
];

const grnInvoices = invoiceSeeds.map((invoice) => {
  const total = invoice.materialIndexes.reduce((sum, materialIndex, itemIndex) => {
    const quantity = [120, 95, 68, 42][itemIndex] ?? 30;
    const rate = [360, 72, 5450, 1180, 145][itemIndex] ?? 100;
    return sum + withGst(quantity, rate);
  }, 0);

  return {
    id: invoice.id,
    site_id: siteTowerId,
    supplier_id: invoice.supplier_id,
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    grn_date: invoice.grn_date,
    total_amount: Number(total.toFixed(2)),
    source_file_path: invoice.source_file_path,
    status: "committed",
    ai_extracted_raw: {
      agent: "Invoice Vision",
      vendor_hint: suppliers.find((supplier) => supplier.id === invoice.supplier_id)?.supplier_name,
      confidence: 0.91,
      extracted_at: new Date().toISOString(),
    },
  };
});

const grnLineItems = invoiceSeeds.flatMap((invoice, invoiceIndex) =>
  invoice.materialIndexes.map((materialIndex, itemIndex) => {
    const material = materials[materialIndex];
    const quantity = [120, 95, 68, 42][itemIndex] ?? 30;
    const rate = [360, 72, 5450, 1180, 145][itemIndex] ?? 100;

    return {
      id: id("99999999-9999-4999-8999-", invoiceIndex * 10 + itemIndex + 1),
      grn_invoice_id: invoice.id,
      material_id: material.id,
      material_name: material.name,
      quantity,
      unit: material.unit,
      rate,
      gst_rate: 18,
      amount_without_gst: amount(quantity, rate),
      amount_with_gst: withGst(quantity, rate),
      ai_match_confidence: itemIndex === 2 ? 0.76 : 0.93,
    };
  })
);

const materialConsumption = [
  {
    id: id("aaaaaaaa-aaaa-4aaa-8aaa-", 1),
    site_id: siteTowerId,
    material_id: materials[0].id,
    material_name: materials[0].name,
    quantity: 26,
    unit: materials[0].unit,
    consumption_date: isoDate(1),
    issued_to: "Tower A - slab pour crew",
    notes: "Issued against pour card PC-17.",
    source_file_path: "demo/issues/tower-miv-001.pdf",
    ai_extracted_raw: {
      voucher_number: "MIV-TWR-001",
      consumption_date: isoDate(1),
      issued_to: "Tower A - slab pour crew",
      line_items: [{ description: materials[0].name, quantity: 26, unit: materials[0].unit }],
    },
    ai_match_confidence: 0.94,
    status: "committed",
  },
  {
    id: id("aaaaaaaa-aaaa-4aaa-8aaa-", 2),
    site_id: siteTowerId,
    material_id: materials[5].id,
    material_name: materials[5].name,
    quantity: 1450,
    unit: materials[5].unit,
    consumption_date: isoDate(3),
    issued_to: "Basement reinforcement yard",
    notes: "Bar bending schedule BBS-08.",
    source_file_path: "demo/issues/tower-miv-002.pdf",
    ai_extracted_raw: {
      voucher_number: "MIV-TWR-002",
      consumption_date: isoDate(3),
      issued_to: "Basement reinforcement yard",
      line_items: [{ description: materials[5].name, quantity: 1450, unit: materials[5].unit }],
    },
    ai_match_confidence: 0.91,
    status: "committed",
  },
  {
    id: id("aaaaaaaa-aaaa-4aaa-8aaa-", 3),
    site_id: siteTowerId,
    material_id: materials[10].id,
    material_name: materials[10].name,
    quantity: 18,
    unit: materials[10].unit,
    consumption_date: isoDate(5),
    issued_to: "Podium concrete batching",
    notes: "Consumed for ramp base layer.",
    source_file_path: "demo/issues/tower-miv-003.pdf",
    ai_extracted_raw: {
      voucher_number: "MIV-TWR-003",
      consumption_date: isoDate(5),
      issued_to: "Podium concrete batching",
      line_items: [{ description: materials[10].name, quantity: 18, unit: materials[10].unit }],
    },
    ai_match_confidence: 0.88,
    status: "committed",
  },
  {
    id: id("aaaaaaaa-aaaa-4aaa-8aaa-", 4),
    site_id: siteTowerId,
    material_id: materials[20].id,
    material_name: materials[20].name,
    quantity: 180,
    unit: materials[20].unit,
    consumption_date: isoDate(8),
    issued_to: "Plumbing shaft team",
    notes: "Level 5 and 6 riser work.",
    source_file_path: "demo/issues/tower-miv-004.pdf",
    ai_extracted_raw: {
      voucher_number: "MIV-TWR-004",
      consumption_date: isoDate(8),
      issued_to: "Plumbing shaft team",
      line_items: [{ description: materials[20].name, quantity: 180, unit: materials[20].unit }],
    },
    ai_match_confidence: 0.9,
    status: "committed",
  },
  {
    id: id("aaaaaaaa-aaaa-4aaa-8aaa-", 5),
    site_id: siteMetroId,
    material_id: materials[1].id,
    material_name: materials[1].name,
    quantity: 42,
    unit: materials[1].unit,
    consumption_date: isoDate(2),
    issued_to: "Concourse masonry team",
    notes: "Trial issue for metro demo site.",
    source_file_path: "demo/issues/metro-miv-001.pdf",
    ai_extracted_raw: {
      voucher_number: "MIV-MET-001",
      consumption_date: isoDate(2),
      issued_to: "Concourse masonry team",
      line_items: [{ description: materials[1].name, quantity: 42, unit: materials[1].unit }],
    },
    ai_match_confidence: 0.89,
    status: "committed",
  },
  {
    id: id("aaaaaaaa-aaaa-4aaa-8aaa-", 6),
    site_id: siteMetroId,
    material_id: materials[6].id,
    material_name: materials[6].name,
    quantity: 920,
    unit: materials[6].unit,
    consumption_date: isoDate(6),
    issued_to: "Platform reinforcement bay",
    notes: "Issued for starter bars.",
    source_file_path: "demo/issues/metro-miv-002.pdf",
    ai_extracted_raw: {
      voucher_number: "MIV-MET-002",
      consumption_date: isoDate(6),
      issued_to: "Platform reinforcement bay",
      line_items: [{ description: materials[6].name, quantity: 920, unit: materials[6].unit }],
    },
    ai_match_confidence: 0.93,
    status: "committed",
  },
  {
    id: id("aaaaaaaa-aaaa-4aaa-8aaa-", 7),
    site_id: siteMetroId,
    material_id: materials[15].id,
    material_name: materials[15].name,
    quantity: 260,
    unit: materials[15].unit,
    consumption_date: isoDate(10),
    issued_to: "Electrical first-fix crew",
    notes: "Ticket references lighting zone E-12.",
    source_file_path: "demo/issues/metro-miv-003.pdf",
    ai_extracted_raw: {
      voucher_number: "MIV-MET-003",
      consumption_date: isoDate(10),
      issued_to: "Electrical first-fix crew",
      line_items: [{ description: materials[15].name, quantity: 260, unit: materials[15].unit }],
    },
    ai_match_confidence: 0.87,
    status: "committed",
  },
  {
    id: id("aaaaaaaa-aaaa-4aaa-8aaa-", 8),
    site_id: siteMetroId,
    material_id: materials[22].id,
    material_name: materials[22].name,
    quantity: 64,
    unit: materials[22].unit,
    consumption_date: isoDate(13),
    issued_to: "MEP service corridor",
    notes: "Medium class GI pipe issue.",
    source_file_path: "demo/issues/metro-miv-004.pdf",
    ai_extracted_raw: {
      voucher_number: "MIV-MET-004",
      consumption_date: isoDate(13),
      issued_to: "MEP service corridor",
      line_items: [{ description: materials[22].name, quantity: 64, unit: materials[22].unit }],
    },
    ai_match_confidence: 0.86,
    status: "committed",
  },
] as const;

const complianceDocs = [
  {
    material_id: materials[0].id,
    doc_type: "test_certificate",
    status: "uploaded",
    file_path: "demo/compliance/opc53_test_certificate.pdf",
    file_name: "OPC53_Test_Certificate.pdf",
    validity_date: "2027-03-31",
    uploaded_at: new Date().toISOString(),
    ai_audit: auditOk("test_certificate", materials[0].name),
  },
  {
    material_id: materials[0].id,
    doc_type: "tds",
    status: "uploaded",
    file_path: "demo/compliance/opc53_tds.pdf",
    file_name: "OPC53_TDS.pdf",
    validity_date: "2027-03-31",
    uploaded_at: new Date().toISOString(),
    ai_audit: auditOk("tds", materials[0].name),
  },
  {
    material_id: materials[5].id,
    doc_type: "test_certificate",
    status: "uploaded",
    file_path: "demo/compliance/tmt8_test_certificate.pdf",
    file_name: "TMT8_Test_Certificate.pdf",
    validity_date: "2027-03-31",
    uploaded_at: new Date().toISOString(),
    ai_audit: auditOk("test_certificate", materials[5].name),
  },
  {
    material_id: materials[6].id,
    doc_type: "tds",
    status: "flagged",
    file_path: "demo/compliance/tmt12_wrong_doc.pdf",
    file_name: "TMT12_Wrong_Document.pdf",
    validity_date: null,
    uploaded_at: new Date().toISOString(),
    ai_audit: auditFlag("other", "tds", "MS plate", [
      "Document type is not TDS",
      "Material does not match expected TMT Bar Fe500D 12 mm",
    ]),
  },
  {
    material_id: materials[10].id,
    doc_type: "test_certificate",
    status: "uploaded",
    file_path: "demo/compliance/aggregate20_test_certificate.pdf",
    file_name: "Aggregate20_Test_Certificate.pdf",
    validity_date: "2027-03-31",
    uploaded_at: new Date().toISOString(),
    ai_audit: auditOk("test_certificate", materials[10].name),
  },
  {
    material_id: materials[11].id,
    doc_type: "tds",
    status: "flagged",
    file_path: "demo/compliance/aggregate10_expired_tds.pdf",
    file_name: "Aggregate10_Expired_TDS.pdf",
    validity_date: "2025-08-31",
    uploaded_at: new Date().toISOString(),
    ai_audit: auditFlag("tds", "tds", materials[11].name, [
      "Document validity date has expired",
      "Issuer seal is partially unreadable",
    ]),
  },
  {
    material_id: materials[15].id,
    doc_type: "test_certificate",
    status: "pending",
    file_path: null,
    file_name: null,
    validity_date: null,
    uploaded_at: null,
    ai_audit: null,
  },
  {
    material_id: materials[15].id,
    doc_type: "tds",
    status: "uploaded",
    file_path: "demo/compliance/frls15_tds.pdf",
    file_name: "FRLS15_TDS.pdf",
    validity_date: "2027-03-31",
    uploaded_at: new Date().toISOString(),
    ai_audit: auditOk("tds", materials[15].name),
  },
  {
    material_id: materials[20].id,
    doc_type: "test_certificate",
    status: "pending",
    file_path: null,
    file_name: null,
    validity_date: null,
    uploaded_at: null,
    ai_audit: null,
  },
  {
    material_id: materials[20].id,
    doc_type: "tds",
    status: "uploaded",
    file_path: "demo/compliance/cpvc25_tds.pdf",
    file_name: "CPVC25_TDS.pdf",
    validity_date: "2027-03-31",
    uploaded_at: new Date().toISOString(),
    ai_audit: auditOk("tds", materials[20].name),
  },
] as const;

type ComplianceSeedDoc = (typeof complianceDocs)[number];

function sampleDocumentPdf(doc: ComplianceSeedDoc) {
  const pdf = new jsPDF();
  const audit = doc.ai_audit;
  const docType =
    doc.doc_type === "test_certificate" ? "TEST CERTIFICATE" : "TECHNICAL DATA SHEET";
  const title = doc.status === "flagged" ? "FLAGGED SAMPLE DOCUMENT" : docType;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("BOQ.ai Demo Compliance Document", 20, 22);
  pdf.setFontSize(14);
  pdf.text(title, 20, 34);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(`File: ${doc.file_name ?? "sample.pdf"}`, 20, 50);
  pdf.text(`Expected slot: ${docType}`, 20, 58);
  pdf.text(`Material: ${audit?.material_mentioned ?? "Sample material"}`, 20, 66);
  pdf.text(`Issuing authority: ${audit?.issuing_authority ?? "Demo Laboratory"}`, 20, 74);
  pdf.text(`Issue date: ${audit?.issue_date ?? "2026-01-15"}`, 20, 82);
  pdf.text(`Validity date: ${doc.validity_date ?? audit?.validity_date ?? "N/A"}`, 20, 90);
  pdf.text(`AI audit status: ${doc.status.toUpperCase()}`, 20, 104);

  const flags = audit?.flags ?? [];
  if (flags.length > 0) {
    pdf.setTextColor(180, 35, 35);
    pdf.setFont("helvetica", "bold");
    pdf.text("AI Findings", 20, 120);
    pdf.setFont("helvetica", "normal");
    flags.forEach((flag, index) => {
      pdf.text(`- ${flag}`, 24, 132 + index * 8);
    });
    pdf.setTextColor(0, 0, 0);
  } else {
    pdf.setTextColor(20, 120, 80);
    pdf.setFont("helvetica", "bold");
    pdf.text("AI Findings: Document matches expected type, material, and validity.", 20, 120);
    pdf.setTextColor(0, 0, 0);
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(
    "Generated by scripts/seed-demo.ts for hackathon demo viewing. Replace with real vendor PDFs during live use.",
    20,
    280
  );

  return Buffer.from(pdf.output("arraybuffer"));
}

type GrnSeedInvoice = (typeof grnInvoices)[number];
type LineDocSeedType = "mir" | "test_certificate" | "tds";

function sampleInvoicePdf(invoice: GrnSeedInvoice) {
  const pdf = new jsPDF();
  const supplier = suppliers.find((item) => item.id === invoice.supplier_id);
  const lines = grnLineItems.filter((line) => line.grn_invoice_id === invoice.id);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("BOQ.ai Demo Supplier Invoice", 20, 22);
  pdf.setFontSize(13);
  pdf.text(invoice.invoice_number ?? "Invoice", 20, 34);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(`Supplier: ${supplier?.supplier_name ?? "Demo Supplier"}`, 20, 50);
  pdf.text(`GSTIN: ${supplier?.gstin ?? "N/A"}`, 20, 58);
  pdf.text(`Invoice date: ${invoice.invoice_date}`, 20, 66);
  pdf.text(`GRN date: ${invoice.grn_date}`, 20, 74);
  pdf.text(`Total with GST: INR ${invoice.total_amount.toLocaleString("en-IN")}`, 20, 82);

  pdf.setFont("helvetica", "bold");
  pdf.text("Line Items", 20, 102);
  pdf.setFont("helvetica", "normal");
  lines.forEach((line, index) => {
    const y = 116 + index * 10;
    pdf.text(
      `${index + 1}. ${line.material_name} | Qty ${line.quantity} ${line.unit} | Rate ${line.rate} | Amount ${line.amount_with_gst}`,
      20,
      y,
      { maxWidth: 170 }
    );
  });

  pdf.setFontSize(9);
  pdf.text(
    "Generated by scripts/seed-demo.ts for MIR supporting-page demonstration.",
    20,
    280
  );

  return Buffer.from(pdf.output("arraybuffer"));
}

function seededLineAudit(
  line: (typeof grnLineItems)[number],
  docType: "test_certificate" | "tds",
  flagged: boolean
) {
  if (!flagged) return auditOk(docType, line.material_name);

  return auditFlag(
    docType === "test_certificate" ? "tds" : "test_certificate",
    docType,
    line.material_name,
    [
      `Uploaded document appears to be for a different ${docType === "test_certificate" ? "document type" : "material data sheet"}`,
      `Material name was read as ${line.material_name.split(" ").slice(0, 2).join(" ")} variant, review before approval`,
    ]
  );
}

async function main() {
  const env = loadEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );

  async function run<T>(label: string, promise: PromiseLike<{ data: T; error: unknown }>) {
    const { data, error } = await promise;
    if (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      throw new Error(`${label}: ${message}`);
    }
    return data;
  }

  async function deleteAll(table: string) {
    await run(`delete ${table}`, supabase.from(table).delete().neq("id", ZERO_UUID));
  }

  for (const table of [
    "material_consumption",
    "grn_line_item_documents",
    "grn_invoice_dc",
    "grn_line_items",
    "grn_invoices",
    "material_compliance_documents",
    "boq_line_items",
    "boq_headlines",
    "packages",
    "master_materials",
    "suppliers",
    "sites",
  ]) {
    await deleteAll(table);
  }

  await run("insert sites", supabase.from("sites").insert(sites));
  await run("insert suppliers", supabase.from("suppliers").insert(suppliers));
  await run("insert materials", supabase.from("master_materials").insert(materials));
  await run(
    "insert package",
    supabase.from("packages").insert({
      id: packageId,
      site_id: siteTowerId,
      name: "Tower A Civil and MEP Package",
    })
  );
  await run("insert headlines", supabase.from("boq_headlines").insert(headlines));
  await run("insert BOQ line items", supabase.from("boq_line_items").insert(boqLineItems));

  for (const invoice of grnInvoices) {
    if (!invoice.source_file_path) continue;

    const { error } = await supabase.storage
      .from("boqai-docs")
      .upload(invoice.source_file_path, sampleInvoicePdf(invoice), {
        contentType: "application/pdf",
        upsert: true,
      });

    if (error) throw new Error(`upload ${invoice.source_file_path}: ${error.message}`);
  }

  await run("insert GRN invoices", supabase.from("grn_invoices").insert(grnInvoices));
  await run("insert GRN line items", supabase.from("grn_line_items").insert(grnLineItems));

  for (const [index, invoice] of grnInvoices.entries()) {
    const state = index % 5;
    const isUploaded = state < 3;
    const isApplicable = state < 4;

    await run(
      `seed DC slot ${invoice.invoice_number}`,
      supabase
        .from("grn_invoice_dc")
        .update({
          is_applicable: isApplicable,
          is_uploaded: isUploaded,
          file_path: isUploaded ? `demo/dc/seed-${index + 1}.pdf` : null,
          file_name: isUploaded ? `seed-${index + 1}.pdf` : null,
          uploaded_at: isUploaded ? new Date().toISOString() : null,
          document_date: isUploaded ? invoice.grn_date : null,
        })
        .eq("grn_invoice_id", invoice.id)
    );
  }

  for (const [index, line] of grnLineItems.entries()) {
    const slotStates: Array<{
      document_type: LineDocSeedType;
      uploaded: boolean;
      audit: ReturnType<typeof auditOk> | ReturnType<typeof auditFlag> | null;
    }> = [
      {
        document_type: "mir",
        uploaded: index % 10 === 0,
        audit: null,
      },
      {
        document_type: "test_certificate",
        uploaded: index % 5 < 3,
        audit:
          index % 5 < 3
            ? seededLineAudit(line, "test_certificate", index === 6)
            : null,
      },
      {
        document_type: "tds",
        uploaded: index % 5 === 0,
        audit: index % 5 === 0 ? seededLineAudit(line, "tds", index === 10) : null,
      },
    ];

    for (const slot of slotStates) {
      await run(
        `seed ${slot.document_type} slot ${line.material_name}`,
        supabase
          .from("grn_line_item_documents")
          .update({
            is_applicable: true,
            is_uploaded: slot.uploaded,
            file_path: slot.uploaded
              ? `demo/grn-line-docs/${line.id}/${slot.document_type}.pdf`
              : null,
            file_name: slot.uploaded
              ? `${line.material_name.replace(/[^a-z0-9]+/gi, "_")}_${slot.document_type}.pdf`
              : null,
            uploaded_at: slot.uploaded ? new Date().toISOString() : null,
            document_date: slot.uploaded ? isoDate((index % 14) + 1) : null,
            ai_audit: slot.audit,
          })
          .eq("grn_line_item_id", line.id)
          .eq("document_type", slot.document_type)
      );
    }
  }

  for (const doc of complianceDocs) {
    if (!doc.file_path) continue;

    const { error } = await supabase.storage
      .from("boqai-docs")
      .upload(doc.file_path, sampleDocumentPdf(doc), {
        contentType: "application/pdf",
        upsert: true,
      });

    if (error) throw new Error(`upload ${doc.file_path}: ${error.message}`);
  }

  await run(
    "insert compliance docs",
    supabase.from("material_compliance_documents").insert(complianceDocs)
  );
  await run(
    "insert material consumption",
    supabase.from("material_consumption").insert(materialConsumption)
  );

  const tables = [
    "sites",
    "suppliers",
    "master_materials",
    "packages",
    "boq_headlines",
    "boq_line_items",
    "grn_invoices",
    "grn_line_items",
    "grn_invoice_dc",
    "grn_line_item_documents",
    "material_compliance_documents",
    "material_consumption",
  ];

  const counts: CountMap = {};
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true });

    if (error) throw new Error(`count ${table}: ${error.message}`);
    counts[table] = count ?? 0;
  }

  console.log("Demo data ready");
  console.table(counts);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
