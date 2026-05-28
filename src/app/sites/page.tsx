"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Building2, MapPin, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { GlassCard } from "@/components/glass-card";
import { ElectricSkeleton } from "@/components/electric-skeleton";
import { EmptyState } from "@/components/empty-state";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Site = {
  id: string;
  name: string;
  location: string | null;
  client_name: string | null;
  status: string | null;
  created_at: string | null;
};

type SiteFormValues = {
  name: string;
  location: string;
  client_name: string;
  status: string;
};

const siteSchema = z.object({
  name: z.string().trim().min(1, "Site name is required."),
  location: z.string().trim().optional(),
  client_name: z.string().trim().optional(),
  status: z.string().trim().optional(),
});

function statusClasses(status: string | null) {
  if (status === "active") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }

  if (status === "inactive") {
    return "border-slate-400/20 bg-slate-400/10 text-slate-300";
  }

  return "border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200";
}

function cleanOptional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function SitesPage() {
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<SiteFormValues>({
    defaultValues: {
      name: "",
      location: "",
      client_name: "",
      status: "active",
    },
  });

  const sortedSites = useMemo(() => sites, [sites]);

  async function loadSites() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("sites")
      .select("id,name,location,client_name,status,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Could not load sites.");
      setSites([]);
      setIsLoading(false);
      return;
    }

    setSites(data ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    let isMounted = true;

    queueMicrotask(() => {
      if (isMounted) {
        loadSites();
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleCreate(values: SiteFormValues) {
    const parsed = siteSchema.safeParse(values);

    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0];

        if (field === "name") {
          form.setError("name", { message: issue.message });
        }
      });
      return;
    }

    const payload = {
      name: parsed.data.name.trim(),
      location: cleanOptional(values.location),
      client_name: cleanOptional(values.client_name),
      status: cleanOptional(values.status) ?? "active",
    };

    const { error } = await supabase.from("sites").insert(payload);

    if (error) {
      toast.error(`Site could not be created: ${error.message}`);
      return;
    }

    toast.success("Site created.");
    form.reset({
      name: "",
      location: "",
      client_name: "",
      status: "active",
    });
    setIsDialogOpen(false);
    await loadSites();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-slate-400">
            <Building2 className="size-4 text-[var(--accent)]" />
            Construction project registry
          </p>
          <h1 className="bg-gradient-to-r from-white via-blue-100 to-fuchsia-200 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            Sites
          </h1>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <Button
            className="h-10 gap-2 bg-[var(--brand)] text-white hover:bg-blue-500"
            onClick={() => setIsDialogOpen(true)}
          >
            <Plus className="size-4" />
            New Site
          </Button>

          <DialogContent className="border border-white/10 bg-[#0b0d14]/95 p-0 shadow-[0_0_40px_rgba(59,130,246,0.18)] backdrop-blur-xl sm:max-w-lg">
            <DialogHeader className="p-5 pb-0">
              <DialogTitle className="text-xl text-white">
                Create site
              </DialogTitle>
              <DialogDescription>
                Add a demo project to the BOQ.ai workspace.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form
                className="grid gap-4 px-5 pb-5"
                onSubmit={form.handleSubmit(handleCreate)}
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-200">Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Hackathon Demo Tower"
                          className="h-10 border-white/10 bg-white/5 text-white"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-200">
                        Location
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Bengaluru, Karnataka"
                          className="h-10 border-white/10 bg-white/5 text-white"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="client_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-200">
                        Client name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Outskill Realty"
                          className="h-10 border-white/10 bg-white/5 text-white"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-200">Status</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="active"
                          className="h-10 border-white/10 bg-white/5 text-white"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter className="-mx-5 -mb-5 border-white/10 bg-white/[0.03]">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-[var(--brand)] text-white hover:bg-blue-500"
                    disabled={form.formState.isSubmitting}
                  >
                    Create site
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => (
              <GlassCard key={index} className="h-44 p-5">
                <ElectricSkeleton rows={1} />
              </GlassCard>
            ))
          : sortedSites.map((site) => (
              <button
                key={site.id}
                className="group text-left"
                onClick={() => router.push(`/sites/${site.id}`)}
              >
                <GlassCard className="min-h-44 p-5 transition group-hover:-translate-y-0.5 group-hover:border-blue-400/40 group-hover:shadow-[0_0_42px_rgba(59,130,246,0.28)]">
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/10">
                      <Building2 className="size-5 text-blue-300" />
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("capitalize", statusClasses(site.status))}
                    >
                      {site.status ?? "active"}
                    </Badge>
                  </div>

                  <h2 className="text-xl font-semibold tracking-tight text-white">
                    {site.name}
                  </h2>
                  <div className="mt-4 grid gap-2 text-sm text-slate-400">
                    <p className="flex items-center gap-2">
                      <MapPin className="size-4 text-slate-500" />
                      {site.location || "Location not set"}
                    </p>
                    <p className="flex items-center gap-2">
                      <UserRound className="size-4 text-slate-500" />
                      {site.client_name || "Client not set"}
                    </p>
                  </div>
                </GlassCard>
              </button>
            ))}
      </section>

      {!isLoading && sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          description="Seed demo data or create the first project site to start the invoice-to-MIR loop."
        />
      ) : null}
    </div>
  );
}
