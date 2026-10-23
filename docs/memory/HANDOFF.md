# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T31 in review.

## Last change
- P7-T31: `LinkButton` (Link + cn(buttonVariants)) in src/components/ui/button.tsx; the six P7-T19 links use it; PaginationLink is a plain `<a>` with no role.
- ESLint `no-restricted-syntax` bans `nativeButton={false}` and bare `className={buttonVariants(...)}` outside src/components/ui; CLAUDE.md constraint added.
- Tests: 8 Vitest (button.test.ts) + 3 node:test (scripts/eslint-config.test.mjs), all seen failing via mutants. check green (547 Vitest), e2e 103 passed.

## Next up
- **Agent:** P7-T32 Link-button icon padding and link-buttons spec scoping (unblocked once P7-T31 is approved).

## Waiting on you
- Review of P7-T31 (Autopilot reviews it).
- P7-H4: should an ended, already-Cancelled appointment stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- Lint selector misses template literals, `clsx(buttonVariants())` and stored class strings; broader `:not(cn > call)` selector possible.
- Lint message for `nativeButton={false}` reads oddly for Menu/Popover/Dialog triggers; add a "trigger: disable with a reason" clause.
- button.test.ts length checks on literal arrays cannot fail; the real guard is the typecheck `toBeNever()`.
- The why is repeated in CLAUDE.md, eslint comment and spec header; eslint comment could point to LinkButton's JSDoc.
- Consider moving LinkButton to a sibling `ui/link-button.tsx` so shadcn overwrites cannot drop it.
- P7-T32 must still add `data-icon` to View contact / Open board icons.

## Blockers
- None.
