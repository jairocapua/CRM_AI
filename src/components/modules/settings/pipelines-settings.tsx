"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVerticalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import type { ID, Pipeline, PipelineStage } from "@/types";
import * as api from "@/lib/api";
import {
  ApiError,
  invalidate,
  loadErrorOf,
  useAction,
  useResource,
} from "@/lib/api";
import { TAG_DOT_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { LoadError } from "@/components/common/load-error";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DeletePipelineDialog } from "./delete-pipeline-dialog";
import { PipelineDialog } from "./pipeline-dialog";
import {
  STAGE_DRAG_INSTRUCTIONS,
  STAGE_ORDER_SAVING,
  stageDragAnnouncements,
  stageOutcome,
} from "./pipelines-copy";
import {
  selectedPipeline,
  shownPipelines,
  shownStages,
  storedOrderOf,
  type PickedOrder,
} from "./pipelines-view";
import { RemoveStageDialog } from "./remove-stage-dialog";
import { StageDialog } from "./stage-dialog";

/**
 * The pipelines page body: a picker for the pipeline, then that pipeline's
 * name (Rename, Delete pipeline) and its stages in board order, each with a
 * drag handle, Edit and Remove, and "Add stage".
 *
 * - What shows (`shownPipelines`): per pipeline, the newer of the listed copy
 *   and the last copy a save returned (`saved`), so a failed refetch never
 *   brings back older values. Every write that returns the pipeline (rename,
 *   stage add, edit, removal and reorder) hands it to `saved`, so what it
 *   changed survives a pipeline switch (the panel remounts) even while the
 *   list cannot be read. A deleted pipeline (`deletedIds`) and a removed
 *   stage (`removedStageIds`) go at once, before the refetch, so their
 *   buttons cannot be pressed again on stale data.
 * - Reordering (drag, or the keyboard on a handle) saves the whole order
 *   (`pipelines.reorderStages`) and shows it at once (`picked`); the saved
 *   copy then stands for it. While the reorder saves, the handles are
 *   disabled and a polite status says "Saving the new order…", so one order
 *   saves at a time. Once it is saved, a list read still on its way cannot
 *   bring the old order back (its copy is not newer). A failed reorder
 *   toasts the API's sentence and the stored order comes back
 *   (`INVALID_ORDER` also reads the list again).
 * - After a pipeline is deleted the default (or first) one left is picked
 *   and focus moves to its heading; after one is created it is picked.
 * - The list failing to load shows one `LoadError`; Retry invalidates
 *   "pipelines".
 */
export function PipelinesSettings() {
  const pipelines = useResource("pipelines", () => api.pipelines.list());
  const [selectedId, setSelectedId] = useState<ID | null>(null);
  const [saved, setSaved] = useState<ReadonlyMap<ID, Pipeline>>(
    () => new Map(),
  );
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<ID>>(
    () => new Set(),
  );
  const [pipelineDialog, setPipelineDialog] = useState<{
    pipeline: Pipeline | null;
  } | null>(null);
  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);
  const [focusHeading, setFocusHeading] = useState(false);
  const [deleting, setDeleting] = useState<Pipeline | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletedOne, setDeletedOne] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pickerId = useId();

  const shown = useMemo(
    () => shownPipelines(pipelines.data, saved, deletedIds),
    [pipelines.data, saved, deletedIds],
  );
  const active = selectedPipeline(shown, selectedId);

  function remember(pipeline: Pipeline) {
    setSaved((map) => new Map(map).set(pipeline.id, pipeline));
  }

  function openPipelineDialog(pipeline: Pipeline | null) {
    // A new pipeline is picked once created: its heading takes focus.
    setFocusHeading(pipeline === null);
    setPipelineDialog({ pipeline });
    setPipelineDialogOpen(true);
  }

  const header = (
    <PageHeader
      title="Pipelines"
      description="The pipelines on the deals board, and the stages their deals move through."
      actions={
        <Button type="button" onClick={() => openPipelineDialog(null)}>
          <PlusIcon data-icon="inline-start" aria-hidden />
          New pipeline
        </Button>
      }
    />
  );

  let body: React.ReactNode;
  const loadError = loadErrorOf(pipelines);
  if (pipelines.isLoading && pipelines.data === undefined) {
    body = <PipelinesSkeleton />;
  } else if (loadError) {
    body = (
      <LoadError
        title="Could not load the pipelines"
        message={loadError.message}
        onRetry={() => invalidate("pipelines")}
        retrying={pipelines.isRefreshing}
      />
    );
  } else if (active) {
    body = (
      <div className="flex max-w-3xl flex-col gap-6">
        <Field className="max-w-sm">
          <FieldLabel htmlFor={pickerId}>Pipeline</FieldLabel>
          <Select
            value={active.id}
            onValueChange={(next) => {
              if (next) setSelectedId(next as ID);
            }}
          >
            <SelectTrigger id={pickerId} className="w-full">
              <SelectValue>
                {(id: string) => shown.find((p) => p.id === id)?.name ?? ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {shown.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? (
                    <span className="text-muted-foreground"> (default)</span>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <PipelinePanel
          key={active.id}
          pipeline={active}
          headingRef={headingRef}
          onRename={() => openPipelineDialog(active)}
          onSaved={remember}
          onDelete={() => {
            setDeletedOne(false);
            setDeleting(active);
            setDeleteOpen(true);
          }}
        />
      </div>
    );
  } else {
    body = null;
  }

  return (
    <>
      {header}
      {body}
      {pipelineDialog ? (
        <PipelineDialog
          open={pipelineDialogOpen}
          onOpenChange={setPipelineDialogOpen}
          pipeline={pipelineDialog.pipeline}
          finalFocus={focusHeading ? headingRef : undefined}
          onSaved={(pipeline) => {
            remember(pipeline);
            if (!pipelineDialog.pipeline) setSelectedId(pipeline.id);
            setPipelineDialogOpen(false);
          }}
        />
      ) : null}
      {deleting ? (
        <DeletePipelineDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          pipeline={deleting}
          finalFocus={deletedOne ? headingRef : undefined}
          onDeleted={(gone) => {
            const left = shown.filter((p) => p.id !== gone.id);
            setDeletedIds((ids) => new Set(ids).add(gone.id));
            setSelectedId(selectedPipeline(left, null)?.id ?? null);
            setDeletedOne(true);
            setDeleteOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * One pipeline: its heading (focused after a delete or a create), Rename,
 * Delete pipeline (the dialog lives with the page, so it outlives this
 * panel), and its stages. Keyed by pipeline, so its dialogs and
 * picked order start fresh when another pipeline is picked; every write's
 * returned pipeline goes to `onSaved`, so nothing it changed is lost then.
 */
function PipelinePanel({
  pipeline,
  headingRef,
  onRename,
  onSaved,
  onDelete,
}: {
  pipeline: Pipeline;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onRename: () => void;
  onSaved: (pipeline: Pipeline) => void;
  onDelete: () => void;
}) {
  const headingId = useId();
  const stagesHeadingId = useId();
  const stagesHeadingRef = useRef<HTMLHeadingElement>(null);
  const [removedStageIds, setRemovedStageIds] = useState<ReadonlySet<ID>>(
    () => new Set(),
  );
  const [stageDialog, setStageDialog] = useState<{
    stage: PipelineStage | null;
  } | null>(null);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [removing, setRemoving] = useState<PipelineStage | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [focusStages, setFocusStages] = useState(false);
  const [reorder, reordering] = useAction(api.pipelines.reorderStages);
  const [picked, setPicked] = useState<PickedOrder | null>(null);

  const storedOrder = storedOrderOf(pipeline);
  const stages = shownStages(pipeline, removedStageIds, picked);
  // Once saved, the returned copy is the pipeline shown (`onSaved`), and a
  // list read still on its way is not newer, so it cannot undo the move.
  const moving = reordering;

  const sensors = useSensors(
    // A small threshold keeps a click on a handle from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function handleDragEnd({ active, over }: DragEndEvent) {
    if (moving || !over || active.id === over.id) return;
    const ids = stages.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    const stage = stages[from]!;
    setPicked({ pipelineId: pipeline.id, ids: next, over: storedOrder });
    try {
      onSaved(await reorder(pipeline.id, next));
    } catch (error) {
      setPicked(null);
      // The list was stale: read it again, so trying again can work.
      if (error instanceof ApiError && error.code === "INVALID_ORDER") {
        invalidate("pipelines");
      }
      toast.error(
        error instanceof ApiError
          ? error.message
          : `Could not move ${stage.name}.`,
      );
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="text-base font-semibold [overflow-wrap:anywhere] outline-none"
          >
            {pipeline.name}
          </h2>
          {pipeline.isDefault ? (
            <Badge variant="secondary">Default</Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Rename ${pipeline.name}`}
            onClick={onRename}
          >
            <PencilIcon data-icon="inline-start" aria-hidden />
            Rename
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Delete ${pipeline.name}`}
            onClick={onDelete}
          >
            <Trash2Icon data-icon="inline-start" aria-hidden />
            Delete pipeline
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h3
              ref={stagesHeadingRef}
              id={stagesHeadingId}
              tabIndex={-1}
              className="text-sm font-medium outline-none"
            >
              Stages
            </h3>
            <p className="text-muted-foreground text-sm">
              The board shows a column per stage, in this order. Drag a stage by
              its handle to move it.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setStageDialog({ stage: null });
              setStageDialogOpen(true);
            }}
          >
            <PlusIcon data-icon="inline-start" aria-hidden />
            Add stage
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          accessibility={{
            announcements: stageDragAnnouncements(stages),
            screenReaderInstructions: { draggable: STAGE_DRAG_INSTRUCTIONS },
          }}
          onDragEnd={(event) => void handleDragEnd(event)}
        >
          <SortableContext
            items={stages.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol
              aria-labelledby={stagesHeadingId}
              className="divide-y rounded-lg border"
            >
              {stages.map((stage) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  disabled={moving}
                  onEdit={() => {
                    setStageDialog({ stage });
                    setStageDialogOpen(true);
                  }}
                  onRemove={() => {
                    setFocusStages(false);
                    setRemoving(stage);
                    setRemoveOpen(true);
                  }}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        {/* Why the handles are disabled, said once as they turn so. */}
        <p role="status" className="sr-only">
          {moving ? STAGE_ORDER_SAVING : ""}
        </p>
      </div>

      {stageDialog ? (
        <StageDialog
          open={stageDialogOpen}
          onOpenChange={setStageDialogOpen}
          pipeline={pipeline}
          stage={stageDialog.stage}
          onSaved={(next) => {
            onSaved(next);
            setStageDialogOpen(false);
          }}
        />
      ) : null}
      {removing ? (
        <RemoveStageDialog
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          pipeline={pipeline}
          stage={removing}
          finalFocus={focusStages ? stagesHeadingRef : undefined}
          onRemoved={(stage, saved) => {
            setRemovedStageIds((ids) => new Set(ids).add(stage.id));
            onSaved(saved);
            setFocusStages(true);
            setRemoveOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * One stage: its drag handle, colour, name, probability and outcome badge,
 * then Edit and Remove (icon only below `sm`). Every control is named after
 * the stage.
 */
function StageRow({
  stage,
  disabled,
  onEdit,
  onRemove,
}: {
  stage: PipelineStage;
  disabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id, disabled });
  const outcome = stageOutcome(stage);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "bg-card flex items-center gap-2 py-2 pr-2 pl-1 first:rounded-t-lg last:rounded-b-lg",
        isDragging && "relative z-10 rounded-lg shadow-md",
      )}
    >
      <Button
        ref={setActivatorNodeRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Move ${stage.name}`}
        className="cursor-grab touch-none data-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon aria-hidden />
      </Button>
      <span
        aria-hidden
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          TAG_DOT_CLASSES[stage.color],
        )}
      />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-medium [overflow-wrap:anywhere]">
          {stage.name}
        </span>
        {outcome ? <Badge variant="outline">{outcome}</Badge> : null}
      </div>
      <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
        {stage.probability}%<span className="sr-only"> probability</span>
      </span>
      <div className="flex shrink-0 items-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Edit ${stage.name}`}
          onClick={onEdit}
        >
          <PencilIcon data-icon="inline-start" aria-hidden />
          <span className="hidden sm:inline">Edit</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Remove ${stage.name}`}
          onClick={onRemove}
        >
          <Trash2Icon data-icon="inline-start" aria-hidden />
          <span className="hidden sm:inline">Remove</span>
        </Button>
      </div>
    </li>
  );
}

/** The page's shape while the first read is in flight. */
function PipelinesSkeleton() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex max-w-sm flex-col gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-full" />
      </div>
      <Skeleton className="h-6 w-48" />
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-6" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
