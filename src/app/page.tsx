"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Building2,
  ClipboardCheck,
  FileSpreadsheet,
  PackageCheck,
  PackageMinus,
  ShieldCheck,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { supabase } from "@/lib/supabase";

type Kpi = {
  label: string;
  value: number;
  suffix?: string;
  helper: string;
  Icon: React.ComponentType<{ className?: string }>;
};

type VelocityBucket = {
  label: string;
  count: number;
};

type AgentMetric = {
  label: string;
  count: number;
  helper: string;
};

const capabilities = [
  { label: "Invoice Vision", Icon: PackageCheck },
  { label: "Material Matcher", Icon: ClipboardCheck },
  { label: "Compliance Auditor", Icon: ShieldCheck },
  { label: "BOQ Normalizer", Icon: FileSpreadsheet },
  { label: "Issue Vision", Icon: PackageMinus },
];

function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(0);
  const previousValue = useRef(0);

  useEffect(() => {
    let frame = 0;
    let rafId = 0;
    const totalFrames = 36;
    const startValue = previousValue.current;
    const delta = value - startValue;

    function tick() {
      frame += 1;
      const progress = Math.min(frame / totalFrames, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(startValue + delta * eased));

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    }

    rafId = requestAnimationFrame(tick);
    previousValue.current = value;

    return () => cancelAnimationFrame(rafId);
  }, [value]);

  return (
    <span>
      {displayValue.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}

type CountQuery = PromiseLike<{
  count: number | null;
  error: { message: string } | null;
}>;

async function resolveCount(query: CountQuery) {
  const { count, error } = await query;

  if (error) {
    return 0;
  }

  return count ?? 0;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildVelocity(grnDates: Array<{ grn_date: string | null }>) {
  const now = new Date();
  const buckets: VelocityBucket[] = Array.from({ length: 6 }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      label: date.toLocaleString("en-US", { month: "short" }),
      count: 0,
    };
  });
  const bucketKeys = Array.from({ length: 6 }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return monthKey(date);
  });

  for (const row of grnDates) {
    if (!row.grn_date) continue;
    const date = new Date(`${row.grn_date}T00:00:00`);
    const index = bucketKeys.indexOf(monthKey(date));
    if (index >= 0) buckets[index].count += 1;
  }

  return buckets;
}

function readAiCallsToday() {
  if (typeof window === "undefined") return 0;

  try {
    const parsed = JSON.parse(localStorage.getItem("boqai.aiActivity") ?? "{}") as {
      date?: string;
      calls?: number;
    };
    const today = new Date().toISOString().slice(0, 10);
    return parsed.date === today ? Number(parsed.calls) || 0 : 0;
  } catch {
    return 0;
  }
}

export default function DashboardPage() {
  const [totalSites, setTotalSites] = useState(0);
  const [activeBoqs, setActiveBoqs] = useState(0);
  const [grnsThisMonth, setGrnsThisMonth] = useState(0);
  const [inventoryItems, setInventoryItems] = useState(0);
  const [materialsIssuedThisMonth, setMaterialsIssuedThisMonth] = useState(0);
  const [compliancePercent, setCompliancePercent] = useState(0);
  const [velocity, setVelocity] = useState<VelocityBucket[]>([]);
  const [agentMetrics, setAgentMetrics] = useState<AgentMetric[]>([]);
  const [aiCallsToday, setAiCallsToday] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setIsLoading(true);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .slice(0, 10);

      const [
        sitesCount,
        boqCount,
        grnCount,
        complianceTotal,
        complianceUploaded,
        grnDatesResult,
        invoiceVisionCount,
        materialMatcherCount,
        complianceAuditorCount,
        boqNormalizerCount,
        inventoryItemsResult,
        issueVisionCount,
      ] = await Promise.all([
        resolveCount(
          supabase.from("sites").select("*", { count: "exact", head: true })
        ),
        resolveCount(
          supabase
            .from("boq_headlines")
            .select("*", { count: "exact", head: true })
        ),
        resolveCount(
          supabase
            .from("grn_invoices")
            .select("*", { count: "exact", head: true })
            .gte("grn_date", monthStart)
        ),
        resolveCount(
          supabase
            .from("material_compliance_documents")
            .select("*", { count: "exact", head: true })
        ),
        resolveCount(
          supabase
            .from("material_compliance_documents")
            .select("*", { count: "exact", head: true })
            .eq("status", "uploaded")
        ),
        supabase
          .from("grn_invoices")
          .select("grn_date")
          .eq("status", "committed")
          .order("grn_date", { ascending: true }),
        resolveCount(
          supabase
            .from("grn_invoices")
            .select("*", { count: "exact", head: true })
            .not("ai_extracted_raw", "is", null)
        ),
        resolveCount(
          supabase
            .from("grn_line_items")
            .select("*", { count: "exact", head: true })
            .not("ai_match_confidence", "is", null)
        ),
        resolveCount(
          supabase
            .from("material_compliance_documents")
            .select("*", { count: "exact", head: true })
            .not("ai_audit", "is", null)
        ),
        resolveCount(
          supabase
            .from("boq_line_items")
            .select("*", { count: "exact", head: true })
        ),
        supabase.from("grn_line_items").select("material_id,quantity"),
        resolveCount(
          supabase
            .from("material_consumption")
            .select("*", { count: "exact", head: true })
            .gte("consumption_date", monthStart)
        ),
      ]);

      const receivedByMaterial = new Map<string, number>();
      if (!inventoryItemsResult.error) {
        for (const row of inventoryItemsResult.data ?? []) {
          if (!row.material_id) continue;
          receivedByMaterial.set(
            row.material_id,
            (receivedByMaterial.get(row.material_id) ?? 0) + Number(row.quantity ?? 0)
          );
        }
      }

      setTotalSites(sitesCount);
      setActiveBoqs(boqCount);
      setGrnsThisMonth(grnCount);
      setInventoryItems(
        Array.from(receivedByMaterial.values()).filter((quantity) => quantity > 0).length
      );
      setMaterialsIssuedThisMonth(issueVisionCount);
      setCompliancePercent(
        complianceTotal > 0
          ? Math.round((complianceUploaded / complianceTotal) * 100)
          : 0
      );
      setVelocity(buildVelocity(grnDatesResult.error ? [] : grnDatesResult.data ?? []));
      setAgentMetrics([
        {
          label: "Invoice Vision",
          count: invoiceVisionCount,
          helper: "Invoices extracted",
        },
        {
          label: "Material Matcher",
          count: materialMatcherCount,
          helper: "Line items matched",
        },
        {
          label: "Compliance Auditor",
          count: complianceAuditorCount,
          helper: "Docs audited",
        },
        {
          label: "BOQ Normalizer",
          count: boqNormalizerCount,
          helper: "BOQ rows normalized",
        },
        {
          label: "Issue Vision",
          count: issueVisionCount,
          helper: "Material issues captured",
        },
      ]);
      setIsLoading(false);
    }

    loadDashboard();
  }, []);

  useEffect(() => {
    function syncActivity() {
      setAiCallsToday(readAiCallsToday());
    }

    queueMicrotask(syncActivity);
    window.addEventListener("boqai-ai-activity", syncActivity);
    window.addEventListener("storage", syncActivity);

    return () => {
      window.removeEventListener("boqai-ai-activity", syncActivity);
      window.removeEventListener("storage", syncActivity);
    };
  }, []);

  const kpis = useMemo<Kpi[]>(
    () => [
      {
        label: "Total Sites",
        value: totalSites,
        helper: "Live projects in Supabase",
        Icon: Building2,
      },
      {
        label: "Active BOQs",
        value: activeBoqs,
        helper: "Ready for Phase 4 BOQ data",
        Icon: FileSpreadsheet,
      },
      {
        label: "GRNs This Month",
        value: grnsThisMonth,
        helper: "Goods receipt invoices",
        Icon: PackageCheck,
      },
      {
        label: "Inventory Items",
        value: inventoryItems,
        helper: "Materials with received stock",
        Icon: Warehouse,
      },
      {
        label: "Materials Issued This Month",
        value: materialsIssuedThisMonth,
        helper: "Committed consumption rows",
        Icon: PackageMinus,
      },
      {
        label: "Compliance %",
        value: compliancePercent,
        suffix: "%",
        helper: "Uploaded docs passing intake",
        Icon: ShieldCheck,
      },
    ],
    [
      activeBoqs,
      compliancePercent,
      grnsThisMonth,
      inventoryItems,
      materialsIssuedThisMonth,
      totalSites,
    ]
  );

  const maxVelocity = Math.max(1, ...velocity.map((bucket) => bucket.count));
  const maxAgentCount = Math.max(1, ...agentMetrics.map((metric) => metric.count));
  const minutesSaved = aiCallsToday * 4;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-slate-400">
            <Bot className="size-4 text-[var(--accent)]" />
            5 agents standing by
          </p>
          <h1 className="bg-gradient-to-r from-white via-blue-100 to-fuchsia-200 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            Dashboard
          </h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {capabilities.map(({ label, Icon }) => (
            <div
              key={label}
              className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-sm text-slate-200 backdrop-blur-xl"
            >
              <span className="ai-status-dot" />
              <Icon className="size-3.5 text-blue-200" />
              {label}
            </div>
          ))}
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map(({ label, value, suffix, helper, Icon }) => (
          <GlassCard key={label} className="p-5">
            <div className="mb-5 flex items-start justify-between">
              <div className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/10">
                <Icon className="size-5 text-blue-300" />
              </div>
              <Activity className="size-4 text-[var(--accent)]" />
            </div>
            <p className="text-sm text-slate-400">{label}</p>
            <p className="mt-2 text-4xl font-semibold tracking-normal text-white">
              {isLoading ? (
                <span className="text-slate-600">0</span>
              ) : (
                <CountUp value={value} suffix={suffix} />
              )}
            </p>
            <p className="mt-3 text-sm text-slate-500">{helper}</p>
          </GlassCard>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <GlassCard className="min-h-[300px] p-5">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="bg-gradient-to-r from-white to-blue-200 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
                GRN Velocity
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Committed GRNs grouped by month
              </p>
            </div>
            <TrendingUp className="size-5 text-blue-300" />
          </div>
          <div className="flex h-44 items-end gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
            {(velocity.length > 0 ? velocity : Array.from({ length: 6 }, (_, index) => ({
              label: `M${index + 1}`,
              count: 0,
            }))).map((bucket) => {
              const height = bucket.count === 0 ? 8 : Math.max(16, (bucket.count / maxVelocity) * 100);

              return (
                <div key={bucket.label} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-32 w-full items-end">
                    <div
                      className="flex w-full items-start justify-center rounded-t-lg bg-gradient-to-t from-[var(--brand)]/80 to-[var(--accent)]/70 pt-1 text-[10px] font-semibold text-white"
                      style={{ height: `${height}%` }}
                    >
                      {bucket.count}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">{bucket.label}</span>
                </div>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard className="min-h-[300px] p-5">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="bg-gradient-to-r from-white to-fuchsia-200 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
                Agent Throughput
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Live output created by each agent
              </p>
            </div>
            <ClipboardCheck className="size-5 text-[var(--accent)]" />
          </div>
          <div className="mb-4 rounded-xl border border-blue-400/15 bg-blue-400/10 px-4 py-3 text-sm text-blue-100">
            Today: {aiCallsToday} AI calls triggered in this browser, about {minutesSaved} minutes saved.
          </div>
          <div className="grid gap-3">
            {agentMetrics.map((metric) => (
              <div
                key={metric.label}
                className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-white">{metric.label}</p>
                    <span className="text-xs text-slate-500">{metric.helper}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--accent)]"
                      style={{
                        width: `${metric.count === 0 ? 4 : Math.max(10, (metric.count / maxAgentCount) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-sm font-semibold text-slate-200">
                  {metric.count.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      </section>
    </div>
  );
}
