# BAC Resolution Module Changes

## What Was Added

- Standalone BAC Resolution module UI via `app/(components)/BACResolutionModule.tsx`
  - Create/list/preview workflow independent from a single canvassing session.
  - Supports:
    - manual PR row entry
    - valid PR selection by division
    - 3 WHEREAS fields
    - NOW THEREFORE / RESOLVED narrative field
    - RESOLVED-at location field
    - multiple PR rows per BAC Resolution

- PR Module action update in `app/procurement/PRModule.tsx`
  - If `role_id === 3` (BAC), the top action button now shows:
    - label: `Create BAC Resolution`
    - icon: gavel
  - Clicking opens standalone BAC Resolution module modal.
  - End-user flow (`Create PR`) remains unchanged.

- Canvasser progress tab adjustment in `app/(canvassing)/CanvasserView.tsx`
  - Lowest-offer section hidden for canvasser role flow.
  - Progress tab now emphasizes assignment and return tracking.

## Database / Supabase Layer

- Added migration:
  - `supabase/migrations/20260414_refine_bac_resolution_multi_pr.sql`

- Added/refined schema support:
  - `bac_resolution` new fields:
    - `division_id`
    - `resolved_at_place`
    - `whereas_1`, `whereas_2`, `whereas_3`
    - `now_therefore_text`
  - New linking table:
    - `bac_resolution_prs`
    - enables many PR rows per BAC Resolution

- Updated helpers in `lib/supabase/bac.ts`:
  - `insertStandaloneBACResolution(...)`
  - `fetchBACResolutionsByDivision(...)`
  - shared PR row insertion helper used by both session-based and standalone creation

## Supabase Context File

- Updated `lib/supbase_context.ts` to include:
  - expanded `bac_resolution` fields
  - new `bac_resolution_prs` table

## Possible Next Steps

1. Add stricter DB constraints:
   - unique `(resolution_id, pr_no)` on `bac_resolution_prs`
   - optional check constraint to prevent empty `whereas_*` strings.

2. Add edit/delete support for standalone BAC Resolutions.

3. Add automatic signatory templates from `users` by role (chair, vice, members).

4. Add deep-link navigation:
   - from PR cards into standalone BAC Resolution filtered by division/PR.

5. Add export naming convention:
   - `BAC-Resolution-<resolution_no>.pdf` for downloaded documents.

