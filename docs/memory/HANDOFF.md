# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T32 in review.

## Last change
- P7-T32: View contact / Open board icons carry `data-icon`, so sm padding applies (6/10 and 10/6).
- e2e/link-buttons.spec.ts pins padding in every sizeLook check; thread-header link scoped via its Contact details toggle (no `.first()`).
- ESLint nativeButton message adds the Base UI trigger "disable with a reason" clause; config comment now points to LinkButton's JSDoc; +1 test:scripts test.
- button.test.ts drops inert toHaveLength asserts. check green (547 Vitest), e2e 103 passed.

## Next up
- **Agent:** P7-T33 App-wide unsaved-changes guard (sidebar links, reload, tab close).

## Waiting on you
- Review of P7-T32 (Autopilot reviews it).
- P7-H4: should an ended, already-Cancelled appointment stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- New task P7-T41: trigger exception in LinkButton JSDoc, trim duplicate trigger asserts/comment in eslint-config.test.mjs, reword spec header padding attribution.
- nativeButton lint message is ~380 chars; could shorten and leave the cause to the JSDoc.
- Spec header could become a pointer to LinkButton's JSDoc like the ESLint comment.
- Earlier: lint selector misses template literals / clsx / stored strings; consider moving LinkButton to `ui/link-button.tsx`.
- P7-T32 not checked visually in the browser pane; padding is pinned by e2e computed styles.

## Blockers
- None.
