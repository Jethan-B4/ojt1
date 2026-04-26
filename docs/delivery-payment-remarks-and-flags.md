# Delivery & Payment Remarks/Flags Integration

## Summary

This pass extends the PR/PO remark pattern into Delivery (Phase 3) and Payment (Phase 4):

- Process modals now support `Status Flag` + `Remarks`.
- Submitting a process step writes a remark entry into `public.remarks`.
- Remarks are chained across phases (PR -> PO -> Delivery -> Payment) by linking new Delivery/Payment remarks to the same `pr_id` and `po_id`.
- Delivery and Payment module "More" actions include a `Remarks` entry that opens the shared remark timeline (`PORemarkSheet`).

## What Was Implemented

### 1) Delivery process modal

File: `app/(modals)/ProcessDeliveryModal.tsx`

- Added `Status Flag` UI via `FlagButton` + `StatusFlagPicker` (same pattern used by PO process).
- Kept existing field groups and process flow; remarks are now explicitly flaggable at process time.

### 2) Delivery process submission writes stacked remarks

File: `app/procurement/DeliveryModule.tsx`

- During `submitProcess()`, after status updates, the module writes a phase-stamped remark using:
  - `insertDeliveryProcessRemark(deliveryId, userId, remark, statusFlagId, "delivery")`
- Status flag IDs map to existing `status_flag` values:
  - `complete=2`, `incomplete_info=3`, `wrong_information=4`, `needs_revision=5`, `on_hold=6`, `urgent=7`.

### 3) Payment process modal now supports flagging and remarks insert

File: `app/(modals)/ProcessPaymentModal.tsx`

- Added `Status Flag` controls for both normal processing and admin override paths.
- On submit, besides status transition, inserts a remark using:
  - `insertDeliveryProcessRemark(deliveryId, userId, remark, statusFlagId, "payment")`

### 4) Stacked remark timeline access in Delivery and Payment modules

Files:

- `app/procurement/DeliveryModule.tsx`
- `app/procurement/PaymentModule.tsx`

Changes:

- Added `Remarks` action in each module’s "More" menu.
- Action resolves PO/PR context from the selected delivery record and opens `PORemarkSheet`.
- New Delivery/Payment remarks are written with `po_id` + `pr_id`, so they appear in the same stacked timeline with prior PR/PO remarks.

### 5) New Delivery remark helpers

File: `lib/supabase/delivery.ts`

- Added `fetchDeliveryPOContext(deliveryId)` to resolve linked PO/PR context.
- Added `insertDeliveryProcessRemark(...)` to standardize Delivery/Payment remark insertion.
- Remarks are phase-tagged in text:
  - Delivery: `[DELIVERY] ...`
  - Payment: `[PAYMENT] ...`

## Current Database Behavior

No mandatory schema migration is required for this implementation.

- Uses existing `public.remarks` table columns:
  - `pr_id`
  - `po_id`
  - `remark`
  - `status_flag_id`
  - `user_id`

Delivery/Payment remarks are linked through PO and PR keys, so stacking across prior phases works without adding new columns.

## Recommended (Optional) Database Improvements

To make Delivery/Payment remarks first-class (queryable without text tags), consider adding explicit phase fields:

```sql
-- Optional migration proposal
alter table public.remarks
  add column if not exists delivery_id bigint null references public.deliveries(id),
  add column if not exists phase text null
    check (phase in ('pr', 'po', 'delivery', 'payment', 'system'));

create index if not exists idx_remarks_delivery_id on public.remarks(delivery_id);
create index if not exists idx_remarks_phase on public.remarks(phase);
```

Optional backfill strategy:

- For existing rows with `po_id` and remark prefix `[DELIVERY]`, set `phase='delivery'`.
- For existing rows with `po_id` and remark prefix `[PAYMENT]`, set `phase='payment'`.
- For PO process rows with `po_id` and no prefix, set `phase='po'`.
- For PR-only rows (`po_id is null`), set `phase='pr'`.

## Notes

- This design intentionally keeps PR/PO parent history visible in later phases.
- Delete scopes remain PK-based as implemented in delete helpers; this doc only covers remark/flag integration.
