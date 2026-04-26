# Monitoring Mode Transition

**Date:** April 26, 2026  
**Objective:** Convert the mobile procurement app from a full CRUD system to a monitoring-only approach, aligning with the web version's role as the primary data entry point.

---

## Overview

The procurement mobile application has been transitioned to a **monitoring-only** mode. This means the mobile app now focuses on:
- **Viewing** procurement records across all phases
- **Processing** records through workflow stages
- **Adding remarks** and status flags
- **Administrative functions** (delete, cancel, override) for Admin users

Data creation and editing (except remarks) are now handled exclusively through the web version.

---

## Changes by Module

### 1. PRModule (Purchase Request Phase)

#### Removed
- **Create PR button** - Removed from SearchBar component
- **CreatePRModal** - No longer imported or used
- **Edit button** - Removed from RecordCard (was shown for End Users on status ≤ 2)
- **EditPRModal** - No longer imported or used
- **Edit option** - Removed from MoreSheet actions

#### State Removed
```typescript
// Removed from PRModule state:
- prModalOpen, setPrModalOpen
- editRecord, setEditRecord
- editVisible, setEditVisible
```

#### Functions Removed
```typescript
// Removed handlers:
- handleOpenCreate()
- handlePRSubmit()
- handlePRSave()
```

#### Retained
- View PR modal
- Process PR modal (for role-based workflow advancement)
- Remarks sheet (view/add comments)
- Cancel PR (Admin only)
- Delete PR (Admin only)

---

### 2. POModule (Purchase Order Phase)

#### Removed
- **Create PO button** - Removed from SearchBar component
- **CreatePOModal** - No longer imported or used
- **Edit button** - Removed from MoreSheet (was conditionally shown based on `canEdit`)
- **EditPOModal** - No longer imported or used

#### State Removed
```typescript
// Removed from POModule state:
- createVisible, setCreateVisible
- editRecord, setEditRecord
- editVisible, setEditVisible
```

#### Functions Removed
```typescript
// Removed handlers:
- handlePOCreated()
- handlePOSave()
```

#### Permissions Simplified
```typescript
// Removed:
- canCreate (roleId === 8 check)
- canEditPO() function (checked role + status for edit permission)
```

#### Retained
- View PO modal
- Process PO modal (role-based processing)
- ORS Inline Panel (for Budget/Admin ORS editing at status 13)
- Remarks sheet
- Cancel PO (Admin only)
- Delete PO (Admin only)
- Override Status (Admin only)

---

### 3. DeliveryModule (Delivery Phase)

#### Removed
- **Log Delivery button** - Removed from SearchBar component
- **CreateDeliveryModal** - No longer imported or used
- All create-related state and handlers

#### State Removed
```typescript
// Removed from DeliveryModule state:
- createOpen, setCreateOpen
- poOptions, setPoOptions
- selectedPoId, setSelectedPoId
- deliveryNo, setDeliveryNo
- expectedDeliveryDate, setExpectedDeliveryDate
```

#### Functions Removed
```typescript
// Removed handlers:
- openCreate()
- submitCreate()
```

#### Imports Removed
```typescript
// No longer imported from @/lib/supabase/delivery:
- fetchPoCandidatesForDelivery
- insertDelivery
```

#### Retained
- View Delivery modal (with IAR/LOA/DV tabs)
- Process Delivery modal
- Remarks sheet
- Delete Delivery (Admin only)
- Override Status (Admin only)

---

### 4. PaymentModule (Payment Phase)

#### Status
- **No changes required** - PaymentModule was already monitoring-only
- Only fix: Added missing `currentUser` prop to PORemarkSheet

#### Retained
- View Payment/Delivery documents
- Process Payment (role-based)
- Remarks sheet
- Override Status (Admin only)

---

### 5. UserManagement Module

#### Status
- **Unchanged** - Full CRUD functionality preserved
- Admin users retain complete user management capabilities

#### Retained
- Create users (CreateUserModal)
- Edit users (EditUserModal)
- Delete users (DeleteUserModal)
- View all users with roles and divisions

---

## UI Changes Summary

### SearchBar Components
All SearchBar components across modules simplified:
- Removed `onCreatePress` prop
- Removed `canCreate` prop
- Removed Create/Log button JSX

### RecordCard Components
All RecordCard components simplified:
- Removed Edit button logic
- Standardized to **View | Process | •••** pattern

### MoreSheet Components
All MoreSheet components simplified:
- Removed Edit action
- Retained: Remarks, View Documents, Process/Override (role-gated), Delete (Admin)

---

## Data Flow Architecture

### Before (Full CRUD)
```
Mobile: Create → Edit → Process → View
         ↓
      Supabase
         ↓
Web:    View (read-only mainly)
```

### After (Monitoring Mode)
```
Web:    Create → Edit (primary data entry)
         ↓
      Supabase
         ↓
Mobile: View → Process → Remarks
         ↓
      (Monitor & Advance Workflow)
```

---

## Benefits of Monitoring Mode

1. **Reduced Complexity** - Mobile codebase is ~300 lines lighter
2. **Clear Separation** - Web handles data entry, mobile handles field operations
3. **Better UX** - Mobile users focus on processing and monitoring, not data entry
4. **Data Integrity** - Reduces risk of mobile data entry errors
5. **Faster Mobile** - Less UI clutter, faster load times

---

## Future Changes & Updates

### Phase 1: Immediate Improvements (Recommended)

#### 1.1 Push Notifications
- **Status:** Not implemented
- **Priority:** High
- **Description:** Add push notifications for role-based users when records reach their processing stage
- **Example:** Division Head gets notified when a PR reaches status 2

#### 1.2 Offline Mode
- **Status:** Partial (local state only)
- **Priority:** High
- **Description:** Enable full offline processing with queue-based sync
- **Implementation:** Use SQLite/WatermelonDB for offline storage

#### 1.3 Document Viewer Enhancements
- **Status:** Basic PDF viewing
- **Priority:** Medium
- **Description:** Add pinch-to-zoom, annotation, and download capabilities

### Phase 2: Monitoring Enhancements

#### 2.1 Dashboard Analytics
- **Status:** Not implemented
- **Priority:** Medium
- **Description:** Add visual dashboards showing:
  - Records by status (pie/bar charts)
  - Average processing time per phase
  - Overdue items alerts
  - Division-wise procurement metrics

#### 2.2 Advanced Filtering
- **Status:** Basic status/section filters exist
- **Priority:** Medium
- **Description:** Add:
  - Date range filtering
  - Multi-status selection
  - Flag-based filtering (urgent, on-hold, etc.)
  - Saved filter presets

#### 2.3 Search Enhancements
- **Status:** Basic text search
- **Priority:** Low
- **Description:** Add:
  - Full-text search across remarks
  - Search by date ranges
  - Recent search history

### Phase 3: Integration Features

#### 3.1 QR Code Scanning
- **Status:** Not implemented
- **Priority:** Medium
- **Description:** Add QR scanning for:
  - Delivery receipts
  - PO documents
  - PR quick lookup

#### 3.2 Signature Capture
- **Status:** Not implemented
- **Priority:** Medium
- **Description:** Enable digital signatures for:
  - IAR (Inspection & Acceptance Report)
  - LOA (Letter of Acceptance)
  - DV (Disbursement Voucher)

#### 3.3 Photo Attachments
- **Status:** Not implemented
- **Priority:** Low
- **Description:** Allow attaching photos to:
  - Delivery records (received items)
  - Inspection reports
  - Any phase for documentation

### Phase 4: Workflow Improvements

#### 4.1 Batch Processing
- **Status:** Single record processing only
- **Priority:** Medium
- **Description:** Enable bulk actions:
  - Batch approve/reject
  - Batch add remarks
  - Batch status updates (Admin)

#### 4.2 Automated Reminders
- **Status:** Not implemented
- **Priority:** Low
- **Description:** Add in-app reminders for:
  - Records stuck in a status > X days
  - Expected delivery date approaching
  - Payment processing delays

#### 4.3 SLA Tracking
- **Status:** Not implemented
- **Priority:** Low
- **Description:** Track and display:
  - SLA targets per phase
  - Actual vs target processing times
  - SLA breach alerts

### Phase 5: Security & Compliance

#### 5.1 Audit Log Viewer
- **Status:** Remarks only (limited audit)
- **Priority:** Medium
- **Description:** Add comprehensive audit trail view showing:
  - Who changed what and when
  - IP address and device info
  - Before/after values

#### 5.2 Biometric Authentication
- **Status:** Not implemented
- **Priority:** Low
- **Description:** Add fingerprint/Face ID for:
  - App login
  - Critical actions (delete, override, final approvals)

#### 5.3 Role-Based Views
- **Status:** Partial (some role gating exists)
- **Priority:** Low
- **Description:** Customize UI per role:
  - Division Head sees only their division by default
  - Custom dashboards per role
  - Quick action buttons based on role permissions

---

## Technical Debt & Maintenance

### Known Issues to Address

1. **TypeScript Strictness**
   - Some `any` types in delivery/payment modules
   - Missing strict null checks in several components

2. **Error Handling**
   - Inconsistent error message formats
   - Some silent failures in fetch operations

3. **Test Coverage**
   - No automated tests for the modified modules
   - Recommend adding Jest/React Native Testing Library

### Refactoring Opportunities

1. **Component Consolidation**
   - SearchBar, FilterPanel, RecordCard patterns could be unified into shared components
   - MoreSheet could be a generic ActionSheet component

2. **Hook Extraction**
   - Data loading patterns repeated across modules
   - Could create `useProcurementData(role, phase)` hook

3. **State Management**
   - Currently using useState/useEffect
   - Consider Zustand or Redux Toolkit for global state

---

## Migration Notes

### For Developers

1. **Removed Modals Still Exist**
   - CreatePRModal, EditPRModal, CreatePOModal, EditPOModal, CreateDeliveryModal
   - Located in `app/(modals)/`
   - Can be re-enabled if needed by reversing the changes

2. **Supabase Functions Unchanged**
   - All create/update functions remain in `lib/supabase/`
   - Mobile just no longer calls them (except update for processing)

3. **Role Permissions Simplified**
   - Removed complex edit permission checks
   - Now primarily: Can Process? (role + status) + Is Admin?

### For Users

1. **End Users (Role 6)**
   - Can no longer create PRs from mobile
   - Must use web interface for PR creation
   - Can still view and track their PRs

2. **Division Heads (Role 2)**
   - No changes to processing capabilities
   - Can no longer edit PRs (was previously allowed for status ≤ 2)

3. **Supply (Role 8)**
   - Can no longer create POs or log deliveries from mobile
   - Must use web interface for creation
   - Retains processing capabilities

4. **Admin (Role 1)**
   - Retains all capabilities including delete and override
   - User management unchanged

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-26 | Initial monitoring mode transition completed |

---

## Related Documentation

- `PROJECT_STATUS_AND_TURNOVER.md` - Pre-transition project status
- `docs/delivery-payment-remarks-and-flags.md` - Remarks system documentation
- `docs/BAC_RESOLUTION_MODULE_CHANGES.md` - BAC module changes

---

**End of Document**

*For questions or to revert any changes, review the git history for commits on 2026-04-26.*
