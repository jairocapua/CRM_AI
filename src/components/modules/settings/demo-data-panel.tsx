"use client";

import { useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { useAction, useResource } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { formatNumber } from "@/lib/format";

/** Base UI's Slider reports `number | readonly number[]` depending on mode. */
function firstValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : (value as number);
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "unknown";
  const mb = bytes / 1_048_576;
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function DemoDataPanel() {
  const [latency, setLatency] = useState(api.settings.tuning().latencyMs);
  const [failureRate, setFailureRate] = useState(
    api.settings.tuning().failureRate,
  );

  const stats = useResource("settings", () => api.settings.stats());
  const integrity = useResource("settings", () =>
    api.settings.integrityReport(),
  );

  const [reseed, isReseeding] = useAction(async () => {
    await api.settings.reseed();
    toast.success("Workspace reseeded", {
      description: "All demo data has been regenerated from the fixed seed.",
    });
  });

  const [clear, isClearing] = useAction(async () => {
    await api.settings.clear();
    toast.success("Workspace cleared", {
      description: "Reload or reseed to get data back.",
    });
  });

  const counts = stats.data?.counts ?? {};
  const problems = integrity.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseIcon className="size-4" />
            Workspace contents
          </CardTitle>
          <CardDescription>
            Everything is generated from a fixed seed and a fixed reference
            date, so a reseed always produces the same world.
            {stats.data?.approxBytes
              ? ` Roughly ${formatBytes(stats.data.approxBytes)} in localStorage.`
              : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries(counts).map(([name, count]) => (
                <div key={name} className="rounded-lg border p-3">
                  <div className="text-xl font-semibold tabular-nums">
                    {formatNumber(count)}
                  </div>
                  <div className="text-muted-foreground text-xs capitalize">
                    {name.replace(/([A-Z])/g, " $1").trim()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {problems.length === 0 ? (
              <CheckCircle2Icon className="text-status-good size-4" />
            ) : (
              <AlertTriangleIcon className="text-status-critical size-4" />
            )}
            Referential integrity
          </CardTitle>
          <CardDescription>
            Cross-checks that every deal, thread, appointment and activity
            points at records that actually exist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {integrity.isLoading ? (
            <Skeleton className="h-5 w-64" />
          ) : problems.length === 0 ? (
            <p className="text-sm">
              No problems found — every reference resolves.
            </p>
          ) : (
            <ul className="text-status-critical list-inside list-disc space-y-1 text-sm">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simulated network</CardTitle>
          <CardDescription>
            The API seam adds latency and can fail on purpose. Turn these up to
            check that every screen has a real loading and error state.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="latency">Latency</Label>
              <span className="text-muted-foreground text-sm tabular-nums">
                {latency} ms
              </span>
            </div>
            <Slider
              id="latency"
              value={[latency]}
              min={0}
              max={3000}
              step={50}
              onValueChange={(value) => {
                const next = firstValue(value);
                setLatency(next);
                api.settings.setLatency(next);
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="failure">Failure rate</Label>
              <span className="text-muted-foreground text-sm tabular-nums">
                {Math.round(failureRate * 100)}%
              </span>
            </div>
            <Slider
              id="failure"
              value={[failureRate]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={(value) => {
                const next = firstValue(value);
                setFailureRate(next);
                api.settings.setFailureRate(next);
              }}
            />
            <p className="text-muted-foreground text-xs">
              Reads that back a whole screen are exempt, so the app stays
              navigable at 100%; mutations and detail loads will fail.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reset</CardTitle>
          <CardDescription>
            Demo data lives in this browser only. Clearing it affects nobody
            else.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => void reseed()} disabled={isReseeding}>
            <RefreshCwIcon
              className={isReseeding ? "size-4 animate-spin" : "size-4"}
            />
            {isReseeding ? "Reseeding…" : "Reseed workspace"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void clear()}
            disabled={isClearing}
          >
            <Trash2Icon className="size-4" />
            Clear all data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
