# Engineering Decisions

## 1. Modular monolith instead of microservices

The assessment allows one working day. A React client and one Express API keep the system easy to run, inspect, and explain. Separate services would add deployment and operational complexity without helping the MVP prove its core correctness behaviours.

## 2. MongoDB documents with targeted indexes

Work items are the main aggregate. Comments are embedded because they are usually read with the item; activity events are separate because the history grows over time and is queried chronologically. Compound indexes support common team/status/priority views, and text indexes support basic title/description search. Pagination is server-side so the client does not load the entire dataset.

## 3. Optimistic concurrency with compare-and-swap

Each work item has a monotonically increasing `version`. The client sends the version it read in `If-Match`; the API updates only where both `_id` and `version` match, and increments the version. If another writer wins first, the conditional update matches nothing and the API returns `409 Conflict`. This avoids silently overwriting another employee's work without requiring pessimistic locks.

## 4. Authorization enforced in the API

The browser is not trusted to enforce permissions. JWT identifies the user, but the API reloads the user record and checks the role and team on protected requests. Public registration always assigns `member`; users cannot submit their own role. Admin provisioning is intentionally left as a controlled operator action for the assessment MVP.

## 5. Explicit workflow and auditable changes

Statuses are constrained by schema enums and approval routes have role checks. Create/update/comment/approval operations produce activity records. The current implementation does not wrap item writes and activity inserts in a transaction; this is documented as a known consistency gap. A production follow-up would use MongoDB transactions or an outbox pattern and add idempotency-key storage with a unique index.

## Intentionally deferred

Realtime updates, asynchronous notification queues, multi-team memberships, configurable workflows, soft deletion, file attachments, and a full admin console are excluded so the one-day submission can focus on the main work lifecycle, permissions, stale-update handling, and usable search/filtering.
