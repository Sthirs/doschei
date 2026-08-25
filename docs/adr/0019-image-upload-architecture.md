# ADR-0019: Image upload architecture — DB-resident data URLs, multer+sharp, replace-only

- **Status:** 🟢 accepted
- **Date:** 2026-08-24
- **Deciders:** Backend team, Frontend team

## Context

The specification ([`docs/specifications.md`](../specifications.md) §Features lines 12 and 85) requires:

- Group images: "A group has a name and an image that can be updated by its members"
- User profile pictures: "Users can view their profile picture when one is set, shown in place of the initials avatar; users can upload or change their profile picture from the account screen using the device's standard file picker (gallery, camera, or other sources); JPEG/PNG/WebP up to 5 MB are accepted, normalized server-side, and returned embedded in API responses."

Current state:

- `Group` entity has `imageUrl: string | null` column (stores external URL)
- `User` entity has no image column
- No upload endpoints exist for either
- Frontend shows group image when `imageUrl` is set; user avatar shows initials only

Constraints from existing ADRs:

- ADR-0004: PostgreSQL with TypeORM synchronize (no migrations) — schema changes via entity edits
- ADR-0003: Backend stack — Node, TypeScript, Express 5, TypeORM, REST API
- ADR-0005: JWT local auth + OIDC PKCE — auth context available on all protected routes
- ADR-0016: Global API rate limiting with express-rate-limit — upload endpoints inherit protection

Forces:

- Simplicity: avoid object storage (S3, GCS, Azure Blob) and CDN complexity for MVP
- Portability: data URLs embed in JSON responses, work offline-first with PWA
- Security: validate MIME type and size server-side; normalize to strip EXIF/metadata
- Replace-only semantics: no versioning, no gallery, no delete-to-null (spec doesn't require it)
- Consistency: same pipeline for group images and user profile pictures

## Decision

We will implement image uploads for both groups and user profiles using a unified architecture:

1. **Storage**: Base64 data URLs stored directly in the database
   - `Group.imageUrl` → renamed to `imageDataUrl` (string, nullable), stores `data:image/...;base64,...`
   - `User.imageDataUrl` → new column (string, nullable), same format
   - Max stored size: ~6.7 MB base64 (≈ 5 MB binary) — fits in PostgreSQL `text`/`varchar`

2. **Upload pipeline** (shared middleware):
   - `multer` with `memoryStorage` (no temp files)
   - File filter: accept `image/jpeg`, `image/png`, `image/webp` only
   - Size limit: 5 MB (enforced by multer `limits.fileSize`)
   - `sharp` normalization pipeline:
     - Auto-rotate from EXIF orientation
     - Strip all metadata (EXIF, ICC profile, XMP)
     - Convert to WebP (lossless for PNG, quality 85 for JPEG)
     - Resize to max 1024×1024 (preserving aspect ratio) — sufficient for avatars/thumbnails
     - Output buffer → base64 data URL

3. **Endpoints** (replace-only, no delete):
   - `PATCH /api/groups/:id/image` — `multipart/form-data` field `image`; returns updated group with `imageDataUrl`
   - `PATCH /api/auth/me/image` — `multipart/form-data` field `image`; returns updated user with `imageDataUrl`
   - Both require authentication; group endpoint requires membership
   - On success: 200 with entity including `imageDataUrl`
   - On validation error: 400 with `{ error: "invalid_image", detail: "..." }`
   - On auth error: 401/403 per ADR-0005

4. **Frontend integration**:
   - Account screen: file picker (`<input type="file" accept="image/jpeg,image/png,image/webp">`), preview, upload button
   - Group settings: same component reused
   - Display: `<img :src="entity.imageDataUrl" />` with fallback to initials avatar component
   - PWA offline: data URLs cached in Pinia store, survive reload

5. **Database migration**: TypeORM `synchronize: true` (ADR-0004) handles column add/rename on backend restart.

## Alternatives considered

- **Alternative A: Object storage (S3-compatible) + signed URLs**
  - Pros: Scales to large files, CDN integration, separates blob storage from DB
  - Cons: Infrastructure complexity (bucket, IAM, CDN, signed URL rotation), additional latency, not portable, overkill for ≤5 MB avatars
  - Rejected: MVP scope favors zero-infrastructure blob handling

- **Alternative B: Store binary in `bytea` column, serve via dedicated `/api/blob/:id` endpoint**
  - Pros: Smaller DB size (no base64 overhead), streaming responses
  - Cons: Extra endpoint, cache headers complexity, cannot embed in JSON responses (breaks "returned embedded in API responses" spec), PWA offline harder
  - Rejected: Spec explicitly requires embedded return; data URLs satisfy this natively

- **Alternative C: External image proxy (e.g., imgix, Cloudinary) with upload widget**
  - Pros: Transformations on-demand, CDN, face-detection cropping
  - Cons: Vendor lock-in, cost, external dependency, over-engineered for avatar use case
  - Rejected: Not aligned with self-hosted, cloud-native Helm deployment model (ADR-0007)

- **Alternative D: Allow delete (set to null) and version history**
  - Pros: User control, audit trail
  - Cons: Spec doesn't require it; adds API surface (DELETE), UI complexity (confirm dialogs), storage growth
  - Rejected: YAGNI — spec says "upload or change" (replace-only)

## Sources / Prior art

- [`docs/specifications.md`](../specifications.md) §Features lines 12, 85 — product requirements
- ADR-0004 — PostgreSQL + TypeORM synchronize (schema change mechanism)
- ADR-0003 — Express 5 + TypeORM backend stack
- ADR-0005 — Authentication context on protected routes
- ADR-0016 — Rate limiting inherited by new endpoints
- `sharp` documentation: <https://sharp.pixelplumbing.com/> — normalization pipeline
- `multer` documentation: <https://github.com/expressjs/multer> — multipart handling
- OWASP File Upload Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html> — validation best practices

## Consequences

- Positive:
  - Zero infrastructure dependencies beyond PostgreSQL
  - Single unified pipeline for group and user images
  - Data URLs embed directly in API responses — no extra round-trip for frontend
  - PWA offline works naturally (images cached with entity data)
  - `sharp` normalization strips privacy-sensitive metadata automatically
  - Replace-only semantics keep API and UI simple

- Negative / trade-offs:
  - Base64 overhead: ~33% size increase in DB and on wire (mitigated by 1024px max dimension and WebP compression)
  - Database size grows with each upload (no automatic cleanup of old images on replace)
  - No CDN caching — images served via API on every request (mitigated by browser cache headers on entity responses)
  - Not suitable for large images (>5 MB) or gallery use cases — by design

- Follow-ups:
  - A follow-up ADR on database storage quotas / per-user image size limits if abuse observed
  - A follow-up ADR on CDN / object storage migration if scale demands it
  - A follow-up ADR on "delete image" endpoint if product requires it
