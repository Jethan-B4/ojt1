# Project Status & Turnover Document

**Project:** Procurement System (PR to Payment Workflow)  
**Date:** April 20, 2026  
**Prepared for:** Project Turnover

---

## 1. Executive Summary

The procurement system is a React Native/Expo application with a Supabase backend that manages the complete procurement lifecycle from Purchase Request (PR) creation through Payment processing. The system is organized into **4 main phases** with defined status transitions and role-based access control.

---

## 2. Procurement Process Overview

### Phase 1: Purchase Request (PR) — Statuses 1-11
| Status | Name | Role | Description |
|--------|------|------|-------------|
| 1 | Pending | End User | Initial PR creation |
| 2 | Div. Head Review | Division Head | Review and forward to BAC |
| 3 | BAC Review | BAC | Certification and inclusion in APP |
| 4 | Budget Review | Budget | Earmark and record against PPMP |
| 5 | PARPO Approval | PARPO | Final approval before canvassing |
| 6-9 | Canvassing | BAC | RFQ release, collection, evaluation |
| 10 | Abstract of Awards | BAC | Award resolution |
| 11 | PO (Creation) | Supply | Abstract forwarded to Supply |
| 33 | Completed (PR Phase) | — | PR phase closure |

### Phase 2: Purchase Order (PO) — Statuses 11-17, 34
| Status | Name | Role | Description |
|--------|------|------|-------------|
| 11 | PO (Creation) | Supply | Receive Abstract, log receipt |
| 12 | PO (Allocation) | Supply | Assign PO number, prepare document |
| 13 | ORS (Creation) | Budget | Prepare ORS and assign ORS number |
| 14 | ORS (Processing) | Budget | Budget officer signs, forward to Accounting |
| 15 | PO (Accounting) | Accounting | Verify document completeness |
| 16 | PO (PARPO) | PARPO | Review and sign PO |
| 17 | PO (Serving) | Supply | Serve PO to suppliers |
| 34 | Completed (PO Phase) | — | PO phase closure, delivery can begin |

### Phase 3: Delivery — Statuses 18-24, 35, 27
| Status | Name | Role | Description |
|--------|------|------|-------------|
| 18 | Delivery (Waiting) | Supply | Log delivery, waiting for receipt |
| 19 | Delivery (Received) | Supply | DR/SOA recorded |
| 20 | Delivery (IAR) | Supply | Inspection & Acceptance Report |
| 21 | Delivery (IAR Processing) | Inspector | IAR review and sign-off |
| 22 | Delivery (LOA) | Supply | Letter of Acceptance |
| 23 | Delivery (DV) | Supply | Disbursement Voucher preparation |
| 24 | Delivery (Division Chief) | Division Chief | Final acceptance sign-off |
| 35 | Completed (Delivery Phase) | — | Delivery complete, ready for payment |
| 27 | Cancelled | — | Delivery cancelled |

### Phase 4: Payment — Statuses 35, 25-32, 36
| Status | Name | Role | Description |
|--------|------|------|-------------|
| 35 | Queue (post-delivery) | Accounting | Intake from delivery completion |
| 25 | Payment (Accounting) | Accounting | Initial payment processing |
| 26 | Payment (PARPO) | PARPO | First PARPO review |
| 27 | Payment (EMDS) | Supply/EMDS | EMDS processing |
| 28 | Payment (PARPO) II | PARPO | Second PARPO review |
| 29 | Payment (Approval) | Division Head | Final approval before releasing |
| 30 | Report Encoding | Accounting | UACS/Report encoding |
| 31 | Tax Processing | Accounting | BIR tax processing |
| 32 | Payment (Releasing) | Cash/Treasury | Cash/cheque releasing |
| 36 | Completed (Payment Phase) | — | Full procurement closure |

---

## 3. Critical Errors & Issues Found

### ⚠️ Issue #1: Missing Status 35 Transition in Delivery Module
**Location:** `app/procurement/DeliveryModule.tsx` (lines 989-1050 area)

**Problem:** The `submitProcess()` function handles status transitions 18→19→20→21→22→23→24, but does NOT handle the transition from status 24 to status 35 (Completed Delivery Phase).

**Impact:** Delivery records stuck at status 24 cannot advance to status 35, blocking the Payment phase intake.

**Fix Required:**
```typescript
// Add to submitProcess() in DeliveryModule.tsx after the status 23/24 handling:
else if (active.status_id === 24) {
  nextStatus = 35; // Complete delivery phase
  await updateDelivery(active.id, {
    status_id: nextStatus,
    notes: mergeNotes(active.notes, stamp),
  });
}
```

---

### ⚠️ Issue #2: Missing Status 35 in SUB_TAB_STATUS_MAP
**Location:** `app/procurement/DeliveryModule.tsx` (line 121-126)

**Problem:** The `SUB_TAB_STATUS_MAP` does not include status 35 in any tab category, meaning completed deliveries won't appear in filtered views.

**Current:**
```typescript
const SUB_TAB_STATUS_MAP: Record<SubTab, number[]> = {
  all: [],
  deliveries: [18, 19],
  inspection: [20, 21],
  acceptance: [22, 23, 24],
};
```

**Fix Required:**
```typescript
const SUB_TAB_STATUS_MAP: Record<SubTab, number[]> = {
  all: [],
  deliveries: [18, 19],
  inspection: [20, 21],
  acceptance: [22, 23, 24, 35], // Include 35
};
```

---

### ⚠️ Issue #3: Inconsistent Status 34 Handling for PO→Delivery Handoff
**Location:** `lib/supabase/delivery.ts` (line 96-105)

**Problem:** The `fetchPoCandidatesForDelivery()` function correctly filters for `status_id = 34` (Completed PO Phase), but there's no validation that the PO is truly ready for delivery logging.

**Recommendation:** Add a check to ensure PO has been "served" (status 17 passed through to 34) before allowing delivery creation.

---

### ⚠️ Issue #4: Role ID 9 (Accounting) Missing in Some Permission Checks
**Location:** `app/procurement/DeliveryModule.tsx` (line 670-674)

**Problem:** The `canRoleProcess()` function for Delivery module does not include role_id 9 (Accounting), but according to the status flow, Accounting should be able to process status 21 (IAR Processing).

**Current:**
```typescript
const canRoleProcess = (roleId: number, statusId: number) =>
  roleId === 1 ||
  (roleId === 8 && [18, 19, 20, 22, 23].includes(statusId)) ||
  (roleId === 9 && statusId === 21) ||  // Already present - OK
  (roleId === 2 && statusId === 24);
```

**Status:** ✓ This appears correct in the current code. Verify with business rules.

---

### ⚠️ Issue #5: Status Flag ID Mapping Inconsistency
**Location:** Multiple files

**Problem:** The `FLAG_TO_ID` mapping uses status_flag_id values 2-7 for various flags, but the `delivery-payment-remarks-and-flags.md` doc mentions these IDs without referencing the actual `status_flag` table structure.

**Files affected:**
- `app/(modals)/ProcessPRModal.tsx` (lines 187-194)
- `app/procurement/DeliveryModule.tsx` (lines 676-683)
- `app/(modals)/ProcessPaymentModal.tsx` (lines 164-171)

**Recommendation:** Verify the `status_flag` table has IDs: 2=complete, 3=incomplete_info, 4=wrong_information, 5=needs_revision, 6=on_hold, 7=urgent.

---

### ⚠️ Issue #6: Missing Expected Delivery Date Column Handling
**Location:** `docs/20260417_add_expected_delivery_date_to_deliveries.sql`

**Problem:** The migration adds `expected_delivery_date` as a `date` type, but the TypeScript interface in `delivery.ts` (line 15) types it as `string | null`.

**Current Interface:**
```typescript
export interface DeliveryRow {
  // ...
  expected_delivery_date: string | null;  // Should this be Date | null?
  // ...
}
```

**Recommendation:** Standardize date handling across the codebase. Supabase returns dates as ISO strings, so `string | null` is correct for the row type, but form inputs should validate format.

---

### ⚠️ Issue #7: No Validation for Delivery Number Uniqueness in UI
**Location:** `app/(modals)/CreateDeliveryModal.tsx`

**Problem:** The database enforces `delivery_no` uniqueness (SQL line 9), but there's no client-side check before submission, leading to potential user-facing errors.

**Recommendation:** Add async validation to check delivery number availability before form submission.

---

### ⚠️ Issue #8: ProcessPaymentModal Missing Role Check for Override
**Location:** `app/(modals)/ProcessPaymentModal.tsx` (line 148-160)

**Problem:** The `canRoleProcessPayment()` correctly checks roles, but when admin (role_id 1) overrides, the modal doesn't show which step is being skipped to.

**Status:** Low priority - functional but could improve UX.

---

### ⚠️ Issue #9: PR to PO Status Gap (Status 11)
**Location:** Process flow documentation

**Problem:** Status 11 appears in BOTH PR phase end (PO Creation) and PO phase start (PO Creation). This is intentional design, but the transition logic should ensure smooth handoff.

**Verification needed:** Confirm that when PR reaches status 11, the PO creation modal properly inherits PR data.

---

### ⚠️ Issue #10: BAC Resolution Module PR Selection
**Location:** `docs/BAC_RESOLUTION_MODULE_CHANGES.md`

**Problem:** The BAC Resolution module allows manual PR row entry, which could lead to PRs being resolved that haven't passed through the proper workflow.

**Recommendation:** Add validation to ensure selected PRs have status >= 6 (Canvassing phase) before allowing inclusion in BAC Resolution.

---

## 4. Database Schema Status

### Tables Implemented
| Table | Status | Notes |
|-------|--------|-------|
| `purchase_requests` | ✓ Complete | Core PR table |
| `purchase_request_items` | ✓ Complete | Line items |
| `purchase_orders` | ✓ Complete | Core PO table |
| `purchase_order_items` | ✓ Complete | Line items |
| `deliveries` | ✓ Complete | Phase 3 tracking |
| `iar_documents` | ✓ Complete | IAR document data |
| `loa_documents` | ✓ Complete | LOA acceptance |
| `dv_documents` | ✓ Complete | Disbursement voucher |
| `remarks` | ✓ Complete | Cross-phase remark chain |
| `status` | ✓ Complete | Status lookup table |
| `status_flag` | ✓ Complete | Flag lookup table |
| `canvasser_assignments` | ✓ Complete | RFQ tracking |
| `canvass_entries` | ✓ Complete | Price canvassing |
| `bac_resolution` | ✓ Complete | BAC resolutions |
| `bac_resolution_prs` | ✓ Complete | Resolution-PR linking |

### Pending Migrations to Run
1. ✓ `20260414_add_rfq_fields_to_canvasser_assignments.sql` - Adds `quotation_no`, `rfq_index`
2. ✓ `20260414_refine_bac_resolution_multi_pr.sql` - Multi-PR resolution support
3. ✓ `20260415_add_cancelled_status.sql` - Cancelled status support
4. ✓ `20260415_add_supplier_address_to_canvass_entries.sql` - Supplier address field
5. ✓ `20260416_add_delivery_phase3_tables.sql` - Core delivery tables
6. ✓ `20260417_add_expected_delivery_date_to_deliveries.sql` - Expected delivery date

---

## 5. Role Permissions Matrix

| Role ID | Role | PR | PO | Delivery | Payment |
|---------|------|----|----|----------|---------|
| 1 | Admin | Full | Full | Full | Full |
| 2 | Division Head | Process 2→3 | — | Process 24→35 | Process 29→30 |
| 3 | BAC | Process 3→6, Create Resolution | — | — | — |
| 4 | Budget | Process 4→5 | Process 13→15 | — | — |
| 5 | PARPO | Process 5→6 | Process 16→17 | — | Process 26→27, 28→29 |
| 6 | End User | Create, Edit ≤2 | — | — | — |
| 8 | Supply | View | Create, Process 11→13, 16→17 | Create, Process 18→23 | Process 27→28 |
| 9 | Accounting | — | Process 15→16 | — | Process 35→26, 30→32 |
| 10 | Cash/Treasury | — | — | — | Process 32→36 |

---

## 6. Recommended Next Steps

### Critical (Before Production)
1. **Fix Issue #1:** Add status 24→35 transition in DeliveryModule
2. **Fix Issue #2:** Add status 35 to SUB_TAB_STATUS_MAP acceptance tab
3. **Database Migration Review:** Ensure all 6 SQL migrations have been applied to production
4. **Role Permission Audit:** Verify all role_id checks match business requirements

### High Priority
5. Add server-side function to prevent status jumps (e.g., 18→35 without intermediate steps)
6. Implement delivery number uniqueness check in CreateDeliveryModal
7. Add BAC Resolution PR validation (status >= 6)
8. Create database triggers to enforce status transition rules

### Medium Priority
9. Add edit/delete support for BAC Resolutions
10. Implement signatory templates from users table by role
11. Add export naming convention for PDFs
12. Create comprehensive unit tests for status transitions

### Low Priority
13. Add deep-link navigation from PR cards to BAC Resolution
14. Optimize remark queries with pagination
15. Add reporting dashboard for procurement metrics

---

## 7. File Structure Reference

### Core Procurement Modules
```
app/procurement/
├── PRModule.tsx        # Phase 1: PR to Abstract of Awards
├── POModule.tsx        # Phase 2: PO Creation to Serving
├── DeliveryModule.tsx  # Phase 3: Delivery to Acceptance
└── PaymentModule.tsx   # Phase 4: Payment to Closure
```

### Process Modals
```
app/(modals)/
├── ProcessPRModal.tsx       # PR phase processing
├── ProcessPOModal.tsx       # PO phase processing
├── ProcessDeliveryModal.tsx # Delivery phase processing
└── ProcessPaymentModal.tsx  # Payment phase processing
```

### Database Layer
```
lib/supabase/
├── pr.ts        # PR queries and mutations
├── po.ts        # PO queries and mutations
├── delivery.ts  # Delivery/Payment queries
├── bac.ts       # BAC Resolution queries
└── notifications.ts # Cross-module notifications
```

---

## 8. Testing Checklist for Turnover

### Unit Tests Needed
- [ ] PR creation with items
- [ ] PR status transitions (1→2→3→4→5→6)
- [ ] PO creation from PR at status 11
- [ ] PO status transitions (11→12→13→14→15→16→17→34)
- [ ] Delivery creation from PO at status 34
- [ ] Delivery status transitions (18→19→20→21→22→23→24→35) **← Fix Issue #1**
- [ ] Payment phase intake from status 35
- [ ] Payment status transitions (35→25→26→27→28→29→30→31→32→36)
- [ ] Remark chaining across all phases
- [ ] Role permission enforcement at each step

### Integration Tests Needed
- [ ] End-to-end PR → Payment flow
- [ ] BAC Resolution creation and linking
- [ ] Canvassing flow with RFQ release/collect
- [ ] Document generation (IAR, LOA, DV)
- [ ] Notification triggers on status changes

---

## 9. Contact & Handoff Notes

### Key Technical Decisions
1. **Status ID Range Convention:**
   - 1-11: PR Phase
   - 11-17, 34: PO Phase
   - 18-24, 35, 27: Delivery Phase
   - 35, 25-32, 36: Payment Phase

2. **Remark Chain Design:**
   - All remarks link to `pr_id` and `po_id`
   - Phase tags: `[DELIVERY]` and `[PAYMENT]` prefixes
   - Shared `PORemarkSheet` component across modules

3. **Role-Based Access:**
   - Each module has `canRoleProcessX()` function
   - Admin (role_id 1) has override access everywhere
   - Division filtering applied for non-admin roles

### Known Limitations
1. No automated backup strategy documented
2. No rate limiting on status transitions
3. PDF generation not yet integrated
4. No audit log beyond the remarks table

### Documentation Status
- ✓ Code-level documentation in files
- ✓ SQL migration files with descriptions
- ✓ This turnover document
- ⚠️ API documentation (needs generation)
- ⚠️ User manual (needs creation)

---

**End of Document**

*For questions or clarifications, review the source code comments or the SQL migration files in the `docs/` directory.*
