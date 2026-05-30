"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FileText,
  PackageCheck,
  PackageMinus,
  ShieldCheck,
  Warehouse,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FlowStep = {
  title: string;
  route: string;
  cta: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: string;
  whatHappens: string;
  aiAgent?: string;
  proof: string;
};

type SampleDoc = {
  label: string;
  fileName: string;
  href: string;
  helper: string;
  recommended?: boolean;
};

const flowSteps: FlowStep[] = [
  {
    title: "1. Capture invoice or DC",
    route: "/grn",
    cta: "Open GRN",
    Icon: Camera,
    accent: "blue",
    whatHappens:
      "Site user uploads a supplier invoice from desktop or takes a photo from mobile. Manual GRN is available when no document is ready.",
    aiAgent: "Invoice Vision reads invoice number, date, supplier, material rows, quantity and unit.",
    proof: "A committed GRN is created from the extracted material receipt.",
  },
  {
    title: "2. Match material and commit GRN",
    route: "/grn",
    cta: "Review GRNs",
    Icon: PackageCheck,
    accent: "green",
    whatHappens:
      "Material Matcher maps messy invoice descriptions to the master material library before the user commits.",
    aiAgent: "Material Matcher reduces manual lookup and inconsistent material naming.",
    proof: "Inventory receives the material automatically after GRN commit.",
  },
  {
    title: "3. Watch inventory update",
    route: "/inventory",
    cta: "View Inventory",
    Icon: Warehouse,
    accent: "emerald",
    whatHappens:
      "Inventory is calculated from GRN inflows minus material issue outflows, with value based on invoice amount.",
    proof: "The same receipt now appears as stock, value, last activity and available balance.",
  },
  {
    title: "4. Close compliance gaps",
    route: "/compliance",
    cta: "Open Compliance",
    Icon: ShieldCheck,
    accent: "amber",
    whatHappens:
      "Received material types automatically enter compliance tracking for Test Certificate and TDS upload.",
    aiAgent: "Compliance Auditor checks document type, material match and validity, then flags bad uploads.",
    proof: "A document uploaded once can satisfy that material type across future GRNs.",
  },
  {
    title: "5. Record consumption",
    route: "/consumption",
    cta: "Open Consumption",
    Icon: PackageMinus,
    accent: "fuchsia",
    whatHappens:
      "Upload a material issue voucher or manually select inventory material, quantity and reason.",
    aiAgent: "Issue Vision extracts voucher date, issued-to location and material consumption rows.",
    proof: "Inventory available quantity reduces without spreadsheet reconciliation.",
  },
  {
    title: "6. Generate reports",
    route: "/reports/mir",
    cta: "Open MIR Reports",
    Icon: FileText,
    accent: "sky",
    whatHappens:
      "MIR reporting uses GRN, invoice, DC and compliance status to prepare customer-ready evidence.",
    proof: "Users can export MIR PDF and a styled Excel matrix for submission support.",
  },
];

const agents = [
  ["Invoice Vision", "Reads supplier invoices and material lines", PackageCheck],
  ["Material Matcher", "Maps invoice text to master materials", ClipboardCheck],
  ["Compliance Auditor", "Flags wrong TC/TDS documents", ShieldCheck],
  ["Issue Vision", "Reads material issue vouchers", PackageMinus],
  ["BOQ Normalizer", "Next phase: structures BOQ imports", FileSpreadsheet],
] as const;

const sampleDocs: Array<{
  title: string;
  description: string;
  docs: SampleDoc[];
}> = [
  {
    title: "GRN invoice samples",
    description: "Use these in GRN -> AI Scan to demo invoice extraction.",
    docs: [
      {
        label: "PPC cement invoice",
        fileName: "UDBM-3444-25-26.pdf",
        href: "/demo-documents/01-ai-grn-invoices/UDBM-3444-25-26.pdf",
        helper: "Good first test for material and quantity extraction.",
        recommended: true,
      },
      {
        label: "Steel / construction invoice",
        fileName: "FY25-26-2245.pdf",
        href: "/demo-documents/01-ai-grn-invoices/FY25-26-2245.pdf",
        helper: "Use to show different supplier invoice format.",
      },
      {
        label: "Additional invoice",
        fileName: "2025-26-3116.pdf",
        href: "/demo-documents/01-ai-grn-invoices/2025-26-3116.pdf",
        helper: "Useful for repeat testing.",
      },
    ],
  },
  {
    title: "Compliance documents",
    description: "Use valid docs for success and mismatch docs to show AI flags.",
    docs: [
      {
        label: "Valid PPC Test Certificate",
        fileName: "PPC_Cement_Test_Certificate_VALID.pdf",
        href: "/demo-documents/02-compliance-good/PPC_Cement_Test_Certificate_VALID.pdf",
        helper: "Upload to Test Certificate slot.",
        recommended: true,
      },
      {
        label: "Valid PPC TDS",
        fileName: "PPC_Cement_TDS_VALID.pdf",
        href: "/demo-documents/02-compliance-good/PPC_Cement_TDS_VALID.pdf",
        helper: "Upload to TDS slot.",
      },
      {
        label: "Mismatch demo",
        fileName: "PPC_Cement_WRONG_TDS_for_Test_Cert_SLOT.pdf",
        href: "/demo-documents/03-compliance-mismatch/PPC_Cement_WRONG_TDS_for_Test_Cert_SLOT.pdf",
        helper: "Upload into Test Certificate slot to trigger mismatch.",
      },
    ],
  },
  {
    title: "Consumption vouchers",
    description: "Use these in Consumption -> New Material Issue -> Upload.",
    docs: [
      {
        label: "Tower A masonry issue",
        fileName: "MIV_DEMO_001_Tower_A_Masonry.png",
        href: "/demo-documents/04-ai-consumption-notes/MIV_DEMO_001_Tower_A_Masonry.png",
        helper: "Issue voucher with multiple material lines.",
        recommended: true,
      },
      {
        label: "Podium concrete issue",
        fileName: "MIV_DEMO_002_Podium_Concrete.png",
        href: "/demo-documents/04-ai-consumption-notes/MIV_DEMO_002_Podium_Concrete.png",
        helper: "Use to show inventory deduction after commit.",
      },
    ],
  },
  {
    title: "BOQ next-phase sample",
    description: "Use this to preview BOQ import and Normalizer agent behavior.",
    docs: [
      {
        label: "BOQ demo template",
        fileName: "BOQ_Demo_Template.xlsx",
        href: "/demo-documents/05-boq-template/BOQ_Demo_Template.xlsx",
        helper: "Excel template for the BOQ module in progress.",
        recommended: true,
      },
    ],
  },
];

const accentClass: Record<string, string> = {
  blue: "border-blue-400/35 bg-blue-500/10 text-blue-200",
  green: "border-green-400/35 bg-green-500/10 text-green-200",
  emerald: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
  amber: "border-amber-400/35 bg-amber-500/10 text-amber-200",
  fuchsia: "border-fuchsia-400/35 bg-fuchsia-500/10 text-fuchsia-200",
  sky: "border-sky-400/35 bg-sky-500/10 text-sky-200",
};

export default function GuidePage() {
  return (
    <div className="space-y-6">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
          <div className="space-y-6">
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-fuchsia-200">
                <Bot className="size-4" />
                Demo guide for judges and first-time users
              </div>
              <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                BOQ.ai turns construction paperwork into one AI-assisted site
                operations flow.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
                Start with a supplier invoice or delivery challan. BOQ.ai creates
                the GRN, updates inventory, prompts compliance documents, audits
                certificates, records material issues, and prepares MIR evidence.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/grn"
                className={cn(
                  buttonVariants(),
                  "h-10 bg-blue-500 px-4 text-white hover:bg-blue-400"
                )}
              >
                Start with GRN
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="#sample-documents"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-10 border-white/10 bg-white/5 px-4 text-slate-100 hover:bg-white/10"
                )}
              >
                Download sample docs
                <Download className="size-4" />
              </a>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-medium text-slate-300">Problem solved</div>
            {[
              "Manual invoice entry delays GRN creation.",
              "Inventory is updated separately and becomes unreliable.",
              "Test Certificates, TDS and MIR reports are chased at the last minute.",
              "Consumption and BOQ progress are disconnected from billing evidence.",
            ].map((item) => (
              <div key={item} className="flex gap-3 rounded-xl bg-white/[0.04] p-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-300" />
                <span className="text-sm leading-6 text-slate-300">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <GlassCard className="p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-200">Complete flow experience</p>
              <h2 className="text-2xl font-semibold text-white">Run the demo in six steps</h2>
            </div>
            <p className="max-w-xl text-sm text-slate-400">
              Use the sample documents below. Each step creates data used by the next module.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {flowSteps.map((step) => {
              const Icon = step.Icon;

              return (
                <div
                  key={step.title}
                  className={cn(
                    "rounded-2xl border p-4",
                    accentClass[step.accent] ?? accentClass.blue
                  )}
                >
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-current/30 bg-black/25">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white">{step.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-300">{step.whatHappens}</p>
                    </div>
                  </div>
                  {step.aiAgent ? (
                    <div className="mb-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-300">
                      <span className="font-semibold text-fuchsia-200">AI agent: </span>
                      {step.aiAgent}
                    </div>
                  ) : null}
                  <p className="mb-3 text-xs leading-5 text-slate-400">{step.proof}</p>
                  <Link
                    href={step.route}
                    className={cn(
                      buttonVariants({ size: "sm", variant: "outline" }),
                      "border-white/10 bg-white/5 text-white hover:bg-white/10"
                    )}
                  >
                    {step.cta}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard className="p-5 sm:p-6">
          <p className="text-sm font-medium text-fuchsia-200">AI agents removing friction</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Five-agent workflow</h2>
          <div className="mt-5 grid gap-3">
            {agents.map(([name, helper, Icon]) => (
              <div key={name} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500/10 text-fuchsia-200">
                  <Icon className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{name}</p>
                  <p className="text-xs leading-5 text-slate-400">{helper}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-100">
            BOQ management is the next phase: import BOQ, report actual work
            done, connect compliance achieved, and generate billing-ready items.
          </div>
        </GlassCard>
      </section>

      <GlassCard id="sample-documents" className="p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-green-200">Sample document repository</p>
            <h2 className="text-2xl font-semibold text-white">Download these files to test the app</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-400">
            Judges can download a file, then upload it back into the relevant module.
            This avoids needing their own invoices, compliance certificates, issue
            vouchers or BOQ template.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {sampleDocs.map((group) => (
            <div key={group.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <h3 className="text-lg font-semibold text-white">{group.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{group.description}</p>
              <div className="mt-4 grid gap-2">
                {group.docs.map((doc) => (
                  <a
                    key={doc.href}
                    href={doc.href}
                    download
                    className="group flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-blue-400/40 hover:bg-white/[0.07]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-white">{doc.label}</p>
                        {doc.recommended ? (
                          <span className="rounded-full border border-green-400/25 bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold text-green-200">
                            recommended
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-blue-200">{doc.fileName}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{doc.helper}</p>
                    </div>
                    <Download className="mt-1 size-4 shrink-0 text-slate-400 transition group-hover:text-blue-200" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
