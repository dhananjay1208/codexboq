"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, MapPin, UserRound } from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

type Site = {
  id: string;
  name: string;
  location: string | null;
  client_name: string | null;
  status: string | null;
};

export default function SiteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [site, setSite] = useState<Site | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSite() {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("sites")
        .select("id,name,location,client_name,status")
        .eq("id", params.id)
        .maybeSingle();

      if (error) {
        toast.error("Could not load site.");
        setSite(null);
        setIsLoading(false);
        return;
      }

      setSite(data);
      setIsLoading(false);
    }

    let isMounted = true;

    queueMicrotask(() => {
      if (isMounted) {
        loadSite();
      }
    });

    return () => {
      isMounted = false;
    };
  }, [params.id]);

  return (
    <div className="space-y-6">
      <Button
        variant="outline"
        className="gap-2 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
        onClick={() => router.push("/sites")}
      >
        <ArrowLeft className="size-4" />
        Back to sites
      </Button>

      <GlassCard className="p-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-8 w-64 animate-pulse rounded bg-white/10" />
            <div className="h-4 w-80 animate-pulse rounded bg-white/10" />
          </div>
        ) : site ? (
          <div>
            <div className="mb-5 flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/10">
              <Building2 className="size-6 text-blue-300" />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="bg-gradient-to-r from-white via-blue-100 to-fuchsia-200 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
                  {site.name}
                </h1>
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
              </div>
              <Badge
                variant="outline"
                className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
              >
                {site.status ?? "active"}
              </Badge>
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Site not found
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              This project may have been removed or the URL is incorrect.
            </p>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
