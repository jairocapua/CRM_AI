"use client";

import { PlusIcon, SearchIcon } from "lucide-react";

import type { Pipeline } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function BoardToolbar({
  pipelines,
  pipelineId,
  onPipelineChange,
  search,
  onSearchChange,
  showLost,
  onShowLostChange,
  onNew,
}: {
  pipelines: Pipeline[];
  pipelineId: string;
  onPipelineChange: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  showLost: boolean;
  onShowLostChange: (value: boolean) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={pipelineId}
        onValueChange={(value) => onPipelineChange(value ?? pipelineId)}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Pipeline">
            {(value: string) =>
              pipelines.find((p) => p.id === value)?.name ?? "Pipeline"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {pipelines.map((pipeline) => (
            <SelectItem key={pipeline.id} value={pipeline.id}>
              {pipeline.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search deals…"
          className="w-56 pl-8"
          aria-label="Search deals"
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="show-lost"
          checked={showLost}
          onCheckedChange={onShowLostChange}
        />
        <Label htmlFor="show-lost" className="text-sm font-normal">
          Show lost
        </Label>
      </div>

      <Button className="ml-auto" onClick={onNew}>
        <PlusIcon />
        New deal
      </Button>
    </div>
  );
}
