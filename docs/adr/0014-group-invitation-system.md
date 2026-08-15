# ADR-0014: Group invitation system — email-keyed pending invitation with accept/decline lifecycle

- **Status:** 🟢 accepted
- **Date:** 2026-08-15
- **Deciders:** Sthirs

## Context

The specification requires that users can create groups and invite other users to join via email ([`docs/specifications.md`](../specifications.md) §Features, line 10). The implementation-status audit at [`docs/specifications.md:209-216`](../specifications.md) previously flagged this feature as NOT IMPLEMENTED: `addMemberByEmail` in `apps/backend/src/services/groupService.ts:282-309` only looks up an already-registered user by email and throws `"No user found with that email."` otherwise. There is no invitation entity, no accept/decline flow, and no mechanism to hide the invitee's display name and id from the inviter until the invitee accepts.

[`ADR-0005`](0005-authentication-and-identity.md) captures the existing authentication and identity decision (JWT local auth + OIDC PKCE provider registry), which defines the user-creation paths that a deferred-attach hook must integrate with. [`ADR-0013`](0013-account-name-update-endpoint.md) is the most recent focused-ADR in this directory and provides the style reference for this record; it also cites the `oauthService.ts` attach-point that is relevant here.

## Decision

We will introduce an email-keyed `Invitation` entity (with `status: 'pending' | 'accepted' | 'declined'`, a `group_id` FK, a non-null `inviter_id` FK, a NULLABLE `invitee_id` FK, an `invitee_email` snapshot string, and created/updated timestamps) plus a new `invitationService.ts` exposing `createInvitation`, `acceptInvitation`, `declineInvitation`, `cancelInvitation`, `listPendingForInvitee`, and `attachPendingInvitationsForEmail`, along with new accept/decline/cancel routes.

`POST /api/groups/:id/members` is repurposed to CREATE an invitation (returning `201 { invitation }`, email-only, never `displayName`); the invitee's `displayName` and `id` are suppressed from `members` until the invitation is `accepted`. A deferred-attach hook (`attachPendingInvitationsForEmail`) runs in `authService.register` and in the `oauthService.handleCallback` new-user-creation branch (after `userRepo.save(user)` at `apps/backend/src/services/oauthService.ts:219`), so invitations to not-yet-registered emails become visible once a matching user registers.

`GET /groups` is extended with an `invitations` array for the invitee; `GET /groups/:id` is extended with a `pendingInvitations` array (email-only) for members.

## Alternatives considered

- **Alternative A: direct-add-without-invitation** — rejected. The UX implies acceptance, and name-hiding is impossible without an intermediate pending state.
- **Alternative B: registered-users-only with no deferred attach** — rejected by user Q2 decision. Invites must work for any email, attaching on later registration.
- **Alternative C: email-sending (SMTP/vendor)** — rejected by user Q3 decision. In-app only, no SMTP or vendor dependency.

## Sources / Prior art

- [`docs/specifications.md`](../specifications.md) §Features, line 10 (post-edit wording).
- [`docs/specifications.md:209-216`](../specifications.md) — implementation-status audit (previously flagged NOT IMPLEMENTED).
- [`docs/adr/0005-authentication-and-identity.md`](0005-authentication-and-identity.md) — existing authentication and identity decision; defines the user-creation paths the deferred-attach hook must integrate with.
- [`docs/adr/0013-account-name-update-endpoint.md`](0013-account-name-update-endpoint.md) — focused-ADR style reference; cites the `oauthService.ts` attach-point relevant here.
- `apps/backend/src/services/oauthService.ts:184-229` — three-tier branching in `handleCallback` (existing identity, link-by-email, new user). The deferred-attach hook runs in the new-user branch after `userRepo.save(user)` at line 219.
- `apps/backend/src/entities/Group.ts:26-32` — join-table membership pattern the `Invitation` entity complements.
- `apps/backend/src/controllers/groupController.ts:363-368` — manual-validation pattern to follow for the new invitation routes.
- [`docs/adr/0004-postgresql-and-schema-management.md`](0004-postgresql-and-schema-management.md) — `synchronize: true`, no migrations. The pending-uniqueness invariant is enforced at the service layer (a `WHERE status='pending'` check) rather than a native partial-unique index, because TypeORM `synchronize` does not emit partial indexes.

## Consequences

- Positive: email-keyed invites work for not-yet-registered users. An invitation to `foo@example.com` becomes visible to `foo` as soon as they register via any path (local or OAuth).
- Positive: name privacy until acceptance. The invitee's `displayName` and `id` are not shared with the inviter or the group until the invitee accepts.
- Negative / trade-offs: `invitee_id` is NULL until the user exists. The deferred-attach hook must be maintained on every future user-creation path (local register, OAuth new-user branch). If a new user-creation path is added without the hook, invitations to that email will silently fail to attach.
- Negative / trade-offs: the pending-uniqueness invariant (one pending invitation per email per group) is enforced at the service layer rather than a native partial-unique index, because TypeORM `synchronize` does not emit partial indexes. A race between two concurrent `createInvitation` calls for the same email+group could produce two pending rows until the service-layer check is hardened.
- Follow-ups: real email notifications for invitations (a separate ADR). Today invitations are in-app only.
- Follow-ups: native partial-unique index via a TypeORM migration if [`ADR-0004`](0004-postgresql-and-schema-management.md) is revisited and migrations are introduced.
- Follow-ups: removal of the deferred-attach hook if email-only registration is ever dropped and all users are guaranteed to exist at invite time.
