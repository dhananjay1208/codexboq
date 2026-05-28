import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import jsPDF from "jspdf";

const rootDir = "C:\\Users\\DK\\Desktop\\Projects\\Codex BOQ";
const sourceInvoiceDir = path.join(rootDir, "Sample Invoices");
const demoDir = path.join(rootDir, "Demo Documents");

const folders = {
  invoices: path.join(demoDir, "01-ai-grn-invoices"),
  complianceGood: path.join(demoDir, "02-compliance-good"),
  complianceMismatch: path.join(demoDir, "03-compliance-mismatch"),
  consumption: path.join(demoDir, "04-ai-consumption-notes"),
};

function ensureFolders() {
  mkdirSync(demoDir, { recursive: true });
  Object.values(folders).forEach((folder) => mkdirSync(folder, { recursive: true }));
}

function writePdf(filePath: string, title: string, rows: string[], options?: { warning?: boolean }) {
  const pdf = new jsPDF();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text(title, 18, 24);
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  rows.forEach((row, index) => {
    pdf.text(row, 18, 42 + index * 8, { maxWidth: 175 });
  });

  if (options?.warning) {
    pdf.setTextColor(180, 40, 40);
    pdf.setFont("helvetica", "bold");
    pdf.text("DEMO MISMATCH DOCUMENT", 18, 260);
    pdf.setTextColor(0, 0, 0);
  }

  writeFileSync(filePath, Buffer.from(pdf.output("arraybuffer")));
}

function issueVoucherPng(filePath: string, args: {
  voucher: string;
  date: string;
  issuedTo: string;
  site: string;
  lines: Array<{ material: string; qty: string; unit: string; notes: string }>;
}) {
  const canvas = createCanvas(1400, 1800);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 3;
  ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);

  ctx.fillStyle = "#111827";
  ctx.font = "bold 58px Arial";
  ctx.fillText("MATERIAL ISSUE VOUCHER", 100, 140);
  ctx.font = "34px Arial";
  ctx.fillText(`Voucher No: ${args.voucher}`, 100, 230);
  ctx.fillText(`Issue Date: ${args.date}`, 100, 290);
  ctx.fillText(`Issued To: ${args.issuedTo}`, 100, 350);
  ctx.fillText(`Site: ${args.site}`, 100, 410);

  ctx.font = "bold 38px Arial";
  ctx.fillText("Material", 100, 560);
  ctx.fillText("Qty", 850, 560);
  ctx.fillText("Unit", 1030, 560);

  ctx.font = "32px Arial";
  args.lines.forEach((line, index) => {
    const y = 640 + index * 160;
    ctx.fillText(`${index + 1}. ${line.material}`, 100, y);
    ctx.fillText(line.qty, 850, y);
    ctx.fillText(line.unit, 1030, y);
    ctx.font = "28px Arial";
    ctx.fillText(`Reason: ${line.notes}`, 130, y + 54);
    ctx.font = "32px Arial";
  });

  writeFileSync(filePath, canvas.toBuffer("image/png"));
}

function copyInvoices() {
  if (!existsSync(sourceInvoiceDir)) return [];

  const copied = readdirSync(sourceInvoiceDir)
    .filter((fileName) => /\.(pdf|png|jpe?g|webp)$/i.test(fileName))
    .sort()
    .map((fileName) => {
      const target = path.join(folders.invoices, fileName);
      copyFileSync(path.join(sourceInvoiceDir, fileName), target);
      return target;
    });

  return copied;
}

function createComplianceDocs() {
  const docs = [
    {
      folder: folders.complianceGood,
      file: "PPC_Cement_Test_Certificate_VALID.pdf",
      title: "TEST CERTIFICATE",
      rows: [
        "Material: PPC Cement",
        "Batch No: PPC-DEMO-042",
        "Compressive strength: 43 MPa at 28 days",
        "Issue Date: 2026-01-15",
        "Validity Date: 2027-03-31",
        "Issuing Authority: National Construction Test Laboratory",
      ],
    },
    {
      folder: folders.complianceGood,
      file: "PPC_Cement_TDS_VALID.pdf",
      title: "TECHNICAL DATA SHEET",
      rows: [
        "Material: PPC Cement",
        "Use: Masonry mortar, plaster, RCC where specified",
        "Packaging: 50 kg bag",
        "Shelf Life: 90 days under dry storage",
        "Issue Date: 2026-01-15",
        "Validity Date: 2027-03-31",
      ],
    },
    {
      folder: folders.complianceGood,
      file: "TMT_Bar_Fe500D_Test_Certificate_VALID.pdf",
      title: "TEST CERTIFICATE",
      rows: [
        "Material: TMT Bar Fe500D 12 mm",
        "Heat No: TMT-DEMO-1187",
        "Yield strength: 545 MPa",
        "Elongation: 18 percent",
        "Issue Date: 2026-02-10",
        "Validity Date: 2027-02-10",
      ],
    },
    {
      folder: folders.complianceMismatch,
      file: "PPC_Cement_WRONG_TDS_for_Test_Cert_SLOT.pdf",
      title: "TECHNICAL DATA SHEET",
      rows: [
        "Material: PPC Cement",
        "This is a TDS document intentionally uploaded into a Test Certificate slot.",
        "Expected demo result: AI should flag document type mismatch.",
      ],
      warning: true,
    },
    {
      folder: folders.complianceMismatch,
      file: "TMT_Bar_WRONG_MATERIAL_Test_Certificate.pdf",
      title: "TEST CERTIFICATE",
      rows: [
        "Material: Mild Steel Plate 8 mm",
        "Expected Material: TMT Bar Fe500D 12 mm",
        "This document intentionally names the wrong material.",
        "Expected demo result: AI should flag material mismatch.",
      ],
      warning: true,
    },
  ];

  docs.forEach((doc) =>
    writePdf(path.join(doc.folder, doc.file), doc.title, doc.rows, {
      warning: doc.warning,
    })
  );

  return docs.map((doc) => path.join(doc.folder, doc.file));
}

function createIssueVouchers() {
  const vouchers = [
    {
      file: "MIV_DEMO_001_Tower_A_Masonry.png",
      voucher: "MIV-DEMO-001",
      date: "2026-05-28",
      issuedTo: "Tower A - Masonry Workstation",
      site: "Hackathon Demo Tower",
      lines: [
        { material: "PPC Cement", qty: "12", unit: "bag", notes: "Blockwork mortar" },
        { material: "River Sand", qty: "2.5", unit: "cum", notes: "Masonry mortar" },
        { material: "TMT Bar Fe500D 8 mm", qty: "150", unit: "kg", notes: "Lintel cages" },
      ],
    },
    {
      file: "MIV_DEMO_002_Podium_Concrete.png",
      voucher: "MIV-DEMO-002",
      date: "2026-05-27",
      issuedTo: "Podium concrete crew",
      site: "Hackathon Demo Tower",
      lines: [
        { material: "OPC 53 Grade Cement", qty: "18", unit: "bag", notes: "PCC repair pour" },
        { material: "Crushed Stone Aggregate 20 mm", qty: "4", unit: "cum", notes: "Base concrete" },
      ],
    },
  ];

  vouchers.forEach((voucher) => issueVoucherPng(path.join(folders.consumption, voucher.file), voucher));
  return vouchers.map((voucher) => path.join(folders.consumption, voucher.file));
}

function createReadme(files: { invoices: string[]; compliance: string[]; consumption: string[] }) {
  const readme = `# BOQ.ai Demo Documents

Generated by \`npx tsx scripts/generate-demo-documents.ts\`.

## Folder Structure

- \`01-ai-grn-invoices\`: Sample invoices copied from \`${sourceInvoiceDir}\`. Use these in GRN -> AI Scan.
- \`02-compliance-good\`: Valid Test Certificate / TDS files. Use these for successful Compliance Auditor demos.
- \`03-compliance-mismatch\`: Intentional bad uploads. Use these to show AI flags for document type or material mismatch.
- \`04-ai-consumption-notes\`: AI-readable material issue vouchers. Use these in Consumption -> Upload Voucher.
- \`extraction-results\`: Created by \`npx tsx scripts/test-sample-invoices.ts\`. Use \`latest-sample-invoice-extraction.json\` for the latest all-invoice verification.

## Demo Flow

1. Open GRN and use AI Scan with an invoice from \`01-ai-grn-invoices\`.
2. Confirm supplier, invoice number/date, and material quantity rows.
3. Check Inventory for received quantity and value.
4. Open Compliance and upload good or mismatch docs for the received material type.
5. Open Consumption and upload a voucher from \`04-ai-consumption-notes\`.
6. Check Inventory again to see usage reduce available stock.
`;

  writeFileSync(path.join(demoDir, "README.md"), readme);
  writeFileSync(
    path.join(demoDir, "manifest.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        root: demoDir,
        files,
      },
      null,
      2
    )
  );
}

function main() {
  ensureFolders();
  const invoices = copyInvoices();
  const compliance = createComplianceDocs();
  const consumption = createIssueVouchers();
  createReadme({ invoices, compliance, consumption });

  console.log(`Demo documents ready at ${demoDir}`);
  console.table({
    invoices: invoices.length,
    compliance: compliance.length,
    consumption: consumption.length,
  });
}

main();
