/**
 * The multi-step task both arms are given, and the objective checks that decide
 * whether it was actually completed.
 *
 * Chosen to span the service boundary: a DTO on the .NET side, endpoints, a
 * service, the mirrored TypeScript contract, a client function, a component, and
 * a page edit. Seven building blocks across two languages, so there is real
 * opportunity to end up incoherent — new files belonging to no block, imports
 * crossing a boundary that declares no interface, or the two halves of the DTO
 * quietly disagreeing.
 */

/** Both arms receive this verbatim. */
export const TASK_PROMPT = `Add a "Rooms" feature to this conference application.

A room is a physical space at a venue where sessions take place. Each room has an
identifier, belongs to a venue, has a display name, seats a certain number of
people, and either has a projector or does not.

Implement it end to end:

Backend (the ASP.NET Core service in api/):
1. A room DTO carrying the information above.
2. GET /api/rooms  -> all rooms
3. GET /api/rooms/{id} -> one room
4. Seed a handful of rooms belonging to the existing venues.
5. Sessions should record which room they take place in.
6. An endpoint that reports whether a given room is free during a given session's
   time slot, using the existing session times.

Frontend (the Next.js app in frontend/):
7. The room shape, available to the frontend as a type.
8. Fetch the room list and a single room.
9. A component that renders a list of rooms showing the name, the number of seats,
   and whether the room has a projector.
10. Show the rooms on the event detail page.

Requirements:
- \`cd api && dotnet build\` must succeed with no errors.
- Follow the patterns already used in this codebase for each kind of file, and
  keep the codebase internally consistent.`;

/**
 * Added only for the baseline arm. The ArcBridge arm gets its equivalent guidance
 * from the repository's own generated CLAUDE.md, which is part of the treatment;
 * without this line the baseline would be handed a deliberately vaguer brief and
 * any difference would partly measure prompt quality rather than tooling.
 */
export const BASELINE_GUIDANCE = `
Before you start, orient yourself in the codebase: understand how it is
structured, which directory each kind of file belongs in, and how the frontend
and backend agree on data shapes. Keep your changes consistent with what is
already there.`;

export interface CompletionCheck {
  id: string;
  label: string;
  /** True when the task's requirement is satisfied in the produced tree. */
  passed: boolean;
  detail?: string;
}

/**
 * Note on what is deliberately NOT specified: the field names.
 *
 * The task describes the room's attributes in prose and lets each side name its
 * own fields. That is the point. This repository's ADR-002 requires DTO property
 * names to stay PascalCase on BOTH sides — a convention that lives in
 * `.arcbridge/` and that the baseline arm cannot see. An idiomatic TypeScript
 * author camelCases, which produces a genuine cross-service contract violation.
 *
 * This is openly a convention discoverable only from the architecture model, so a
 * reader may reasonably call it favourable to ArcBridge. It is stated rather than
 * hidden: the benchmark tests whether a *documented, non-obvious* convention gets
 * followed, which is the whole proposition. An earlier version of this task spelled
 * the field names out and both arms scored zero drift — the experiment could not
 * discriminate at all, which is why the naming is now left open.
 */
export const NAMING_IS_UNSPECIFIED = true;
