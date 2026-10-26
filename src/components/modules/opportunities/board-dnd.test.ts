import { describe, expect, it } from "vitest";

import {
  boardDragAnnouncements,
  boardDropTarget,
  stageDroppableId,
} from "./board-dnd";

const stages = [
  { id: "s1", name: "New Lead" },
  { id: "s2", name: "Contacted" },
  { id: "s3", name: "Closed Won" },
];

const deals = [
  { id: "a", name: "Acme renewal", stageId: "s1", position: 0 },
  { id: "b", name: "Beta pilot", stageId: "s1", position: 1 },
  { id: "c", name: "Cobalt deal", stageId: "s1", position: 2 },
  { id: "d", name: "Delta upsell", stageId: "s2", position: 0 },
  { id: "e", name: "Echo expansion", stageId: "s2", position: 1 },
];

describe("boardDropTarget", () => {
  it("is in place when a deal is over itself", () => {
    expect(boardDropTarget(deals, "b", "b")).toEqual({
      stageId: "s1",
      index: 1,
      total: 3,
      inPlace: true,
    });
  });

  it("inserts before the deal it is over in another stage", () => {
    expect(boardDropTarget(deals, "b", "e")).toEqual({
      stageId: "s2",
      index: 1,
      total: 3,
      inPlace: false,
    });
  });

  it("goes to the end of a stage when over the column itself", () => {
    expect(boardDropTarget(deals, "a", stageDroppableId("s2"))).toEqual({
      stageId: "s2",
      index: 2,
      total: 3,
      inPlace: false,
    });
    expect(boardDropTarget(deals, "a", stageDroppableId("s3"))).toEqual({
      stageId: "s3",
      index: 0,
      total: 1,
      inPlace: false,
    });
  });

  it("takes the place of the deal it is over within a stage, either way", () => {
    // As dnd-kit's sorting preview shows it: down onto Cobalt ends last.
    expect(boardDropTarget(deals, "b", "c")).toEqual({
      stageId: "s1",
      index: 2,
      total: 3,
      inPlace: false,
    });
    expect(boardDropTarget(deals, "a", "b")).toEqual({
      stageId: "s1",
      index: 1,
      total: 3,
      inPlace: false,
    });
    expect(boardDropTarget(deals, "c", "a")).toEqual({
      stageId: "s1",
      index: 0,
      total: 3,
      inPlace: false,
    });
  });

  it("is undefined for an unknown deal or target", () => {
    expect(boardDropTarget(deals, "zz", "a")).toBeUndefined();
    expect(boardDropTarget(deals, "a", "zz")).toBeUndefined();
  });
});

describe("boardDragAnnouncements", () => {
  const say = boardDragAnnouncements(deals, stages);

  it("names the deal, the stage and the position at each step", () => {
    expect(say.onDragStart({ active: { id: "b" } })).toBe(
      "Picked up Beta pilot, in New Lead, position 2 of 3.",
    );
    expect(say.onDragOver({ active: { id: "b" }, over: { id: "b" } })).toBe(
      "Beta pilot is over New Lead, position 2 of 3.",
    );
    expect(say.onDragOver({ active: { id: "b" }, over: { id: "d" } })).toBe(
      "Beta pilot is over Contacted, position 1 of 3.",
    );
    expect(
      say.onDragOver({
        active: { id: "b" },
        over: { id: stageDroppableId("s3") },
      }),
    ).toBe("Beta pilot is over Closed Won, position 1 of 1.");
    expect(say.onDragOver({ active: { id: "b" }, over: null })).toBe(
      "Beta pilot is not over a stage.",
    );
  });

  it("says where a drop moved the deal, or that it stayed", () => {
    expect(say.onDragEnd({ active: { id: "b" }, over: { id: "e" } })).toBe(
      "Beta pilot moved to Contacted, position 2 of 3.",
    );
    expect(say.onDragEnd({ active: { id: "b" }, over: { id: "b" } })).toBe(
      "Beta pilot dropped; it stays in New Lead, position 2 of 3.",
    );
    expect(say.onDragEnd({ active: { id: "b" }, over: null })).toBe(
      "Beta pilot dropped; it stays in New Lead, position 2 of 3.",
    );
    expect(say.onDragCancel({ active: { id: "b" } })).toBe(
      "Moving Beta pilot was cancelled; it stays in New Lead, position 2 of 3.",
    );
  });

  it("falls back to generic words for an unknown deal", () => {
    expect(say.onDragStart({ active: { id: "zz" } })).toBe(
      "Picked up the deal.",
    );
  });
});

describe("announced positions among the cards shown", () => {
  // The board announces against the cards shown (`visible`) and drops
  // against every deal: hidden ones ("h*": lost, or filtered out by the
  // search) sit between and around the shown cards.
  const all = [
    { id: "h1", name: "Hidden one", stageId: "s1", position: 0 },
    { id: "a", name: "Acme renewal", stageId: "s1", position: 1 },
    { id: "h2", name: "Hidden two", stageId: "s1", position: 2 },
    { id: "b", name: "Beta pilot", stageId: "s1", position: 3 },
    { id: "c", name: "Cobalt deal", stageId: "s1", position: 4 },
    { id: "h3", name: "Hidden three", stageId: "s1", position: 5 },
    { id: "h4", name: "Hidden four", stageId: "s2", position: 0 },
    { id: "d", name: "Delta upsell", stageId: "s2", position: 1 },
    { id: "h5", name: "Hidden five", stageId: "s2", position: 2 },
    { id: "e", name: "Echo expansion", stageId: "s2", position: 3 },
    { id: "h6", name: "Hidden six", stageId: "s3", position: 0 },
  ];
  const shown = all.filter((d) => !d.id.startsWith("h"));

  /** The stored board after a drop, as handleDragEnd and
   *  api.opportunities.move compute it: against every deal. */
  function drop(activeId: string, overId: string) {
    const target = boardDropTarget(all, activeId, overId);
    if (!target || target.inPlace) return all;
    const dragged = all.find((d) => d.id === activeId)!;
    const column = all
      .filter((d) => d.stageId === target.stageId && d.id !== activeId)
      .sort((x, y) => x.position - y.position);
    column.splice(target.index, 0, { ...dragged, stageId: target.stageId });
    const placed = new Map(column.map((d, i) => [d.id, i]));
    return all.map((d) =>
      d.id === activeId
        ? { ...d, stageId: target.stageId, position: placed.get(d.id)! }
        : placed.has(d.id)
          ? { ...d, position: placed.get(d.id)! }
          : d,
    );
  }

  const shownIds = new Set(shown.map((d) => d.id));
  const overs = [
    ...shown.map((d) => d.id),
    ...stages.map((s) => stageDroppableId(s.id)),
  ];
  const cases = shown.flatMap((d) => overs.map((over) => [d.id, over]));

  it.each(cases)(
    "dragging %s over %s announces the place it lands among the shown cards",
    (activeId, overId) => {
      const announced = boardDropTarget(shown, activeId, overId)!;
      const after = drop(activeId, overId);
      const moved = after.find((d) => d.id === activeId)!;
      const shownColumn = after
        .filter((d) => shownIds.has(d.id) && d.stageId === moved.stageId)
        .sort((x, y) => x.position - y.position)
        .map((d) => d.id);
      expect({
        stageId: moved.stageId,
        index: shownColumn.indexOf(activeId),
        total: shownColumn.length,
      }).toEqual({
        stageId: announced.stageId,
        index: announced.index,
        total: announced.total,
      });
    },
  );

  it("counts only the shown cards", () => {
    const say = boardDragAnnouncements(shown, stages);
    expect(say.onDragStart({ active: { id: "b" } })).toBe(
      "Picked up Beta pilot, in New Lead, position 2 of 3.",
    );
    expect(say.onDragEnd({ active: { id: "a" }, over: { id: "b" } })).toBe(
      "Acme renewal moved to New Lead, position 2 of 3.",
    );
    expect(say.onDragEnd({ active: { id: "a" }, over: { id: "e" } })).toBe(
      "Acme renewal moved to Contacted, position 2 of 3.",
    );
  });
});
