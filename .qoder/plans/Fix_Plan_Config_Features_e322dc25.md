# Fix Plan Config Features — Master Execution Plan

---

## PHASE 1 — Backend Create Fix (CRITICAL)

### What will be changed
Add 6 missing fields to `POST /admin/tasks/assign` plan creation branch:
- `visibility`
- `allowedClients`
- `requireLink`
- `requireCustomInput`
- `customInputLabel`
- `customInputPlaceholder`

**Two edits in the same file, same endpoint:**

1. **Destructure block** (Line ~1767): Add the 6 fields to `const { ... } = payload;`
2. **Task.create() block** (Line ~1814): Add the 6 fields with safe defaults:
   - `visibility: visibility || 'PUBLIC'`
   - `allowedClients: visibility === 'SELECTED' ? (allowedClients || []) : []`
   - `requireLink: requireLink || false`
   - `requireCustomInput: requireCustomInput || false`
   - `customInputLabel: customInputLabel || ''`
   - `customInputPlaceholder: customInputPlaceholder || ''`

### Exact files involved
- `src/routes/admin.js` — Lines 1737–1814

### Risk level: LOW
- Only adding new fields to an existing object. No existing logic modified.
- Schema already supports all 6 fields.

### Why this step is needed
This is the **single root cause** blocking all 5 features. Frontend sends the fields correctly, but backend destructuring silently drops them. DB always gets schema defaults (PUBLIC, false, empty).

### What could go wrong
- Typo in field name → field still not saved (mitigated by Phase 2 verification)
- `allowedClients` with invalid ObjectIds → Mongoose validation error (mitigated by conditional: only pass when `visibility === 'SELECTED'`)

---

## PHASE 2 — Verify DB Persistence

### What will be changed
**No code changes.** Verification only.

### How to verify
After Phase 1 deploy:
1. Admin creates a new plan with:
   - Visibility = SELECTED + 1 client checked
   - Require Link = ON
   - Require Custom Input = ON
   - Custom Input Label = "Instagram Username"
   - Custom Input Placeholder = "e.g. @john_doe"
2. Check MongoDB directly (or via admin GET endpoint) to confirm all 6 fields persisted with correct values, NOT defaults.

### Exact files involved
- None (verification step)

### Risk level: N/A

### Why this step is needed
Confirms Phase 1 actually worked before proceeding downstream. If fields still default, there's a deeper issue (e.g., Mongoose stripping unknown fields — though schema already defines them).

### What could go wrong
- Nothing — read-only verification

---

## PHASE 3 — Client API Verification

### What will be changed
**No code changes expected.** The client API endpoints already return these fields:

- `GET /client/plans` (Line 1249–1252): returns `requireLink`, `requireCustomInput`, `customInputLabel`, `customInputPlaceholder`
- `GET /client/plans/:planId` (Lines 1386–1389): same 4 fields
- Visibility filtering (Lines 1172–1179): already filters by `visibility` + `allowedClients`

### How to verify
After Phase 2 confirms DB persistence:
1. Log in as the allowed client → plan should appear in `/client/plans`
2. Log in as a non-allowed client → plan should NOT appear
3. Check API response includes `requireLink: true`, `requireCustomInput: true`, correct label + placeholder

### Exact files involved
- `src/routes/client.js` — Lines 1172–1253 and 1319–1390 (read-only check)

### Risk level: N/A

### Why this step is needed
Confirms the existing client API code works correctly now that DB has real values instead of defaults.

### What could go wrong
- Nothing — verification only

---

## PHASE 4 — Cart + Modal Validation

### What will be changed
**No code changes expected.** Cart.jsx already:

- Fetches plan data from API on checkout (Line 39)
- Merges `requireLink`, `requireCustomInput`, `customInputLabel`, `customInputPlaceholder` into `modalItems` (Lines 48–58)
- Renders link input when `item.requireLink` (Line 399)
- Renders custom input when `item.requireCustomInput` (Line 413)
- Uses `item.customInputPlaceholder` as placeholder (Line 416)
- Validates all required fields filled before enabling button (Lines 139–148)
- Sends `inputs` array in purchase payload (Line 95)

### How to verify
1. Add plan with requireLink + requireCustomInput to cart
2. Open checkout modal → input fields should appear for each quantity unit
3. Leave fields empty → "Place Order" button should be disabled
4. Fill all fields → button enables
5. Submit → check network payload includes `inputs` array

### Exact files involved
- `frontend/client-app/src/pages/Cart.jsx` (read-only check)

### Risk level: N/A

### Why this step is needed
Confirms the existing frontend code works end-to-end now that API returns real values.

### What could go wrong
- Nothing — verification only

---

## PHASE 5 — Order + Task Flow

### What will be changed
**No code changes for the main flow.** The purchase-cart endpoint already:

- Validates inputs per-quantity (Lines 3123–3153)
- Stores `inputs` in order items (Line 3194)
- Stores `customInputLabel` in `planSnapshot` (Line 3192) — **BUT see Phase 7 for schema gap**

Task creation on order approval already:
- Reads `item.inputs[i]` per-task (Line 3037)
- Reads `item.planSnapshot?.customInputLabel` (Line 3036)

### How to verify
1. Place order with inputs filled
2. Check Order document in DB: `items[0].inputs` should have the submitted data
3. Admin approves order
4. Check created Task documents: `clientInputs` should have one entry per task

### Exact files involved
- `src/routes/client.js` — Lines 3123–3194 (read-only check)
- `src/routes/admin.js` — Lines 3019–3042 (read-only check)

### Risk level: N/A

### Why this step is needed
Validates the order→task pipeline works with real data.

### What could go wrong
- `customInputLabel` in planSnapshot may be silently stripped by Mongoose (see Phase 7)

---

## PHASE 6 — Task Detail API Fix (CODE CHANGE)

### What will be changed
Add missing fields to TWO task detail API responses:

**1. `GET /admin/tasks/:taskId`** (admin.js Lines 953–1052):
Add to the response object:
- `clientInputs: task.clientInputs || []`
- `customInputLabel: task.customInputLabel || ''`

**2. `GET /client/tasks/:taskId`** (client.js Lines 583–690):
Add to the response object:
- `clientInputs: task.clientInputs || []`
- `customInputLabel: task.customInputLabel || ''`

### Exact files involved
- `src/routes/admin.js` — Inside `GET /tasks/:taskId` response object (~Line 1051)
- `src/routes/client.js` — Inside `GET /tasks/:taskId` response object (~Line 689)

### Risk level: LOW
- Adding 2 fields to existing response objects. No logic change. No existing fields touched.

### Why this step is needed
Both admin and client TaskDetail.jsx pages read `task.clientInputs` and `task.customInputLabel` — but the API never sends them. Without this fix, the "Client Inputs" / "Your Submitted Inputs" sections will never render even if data exists in DB.

### What could go wrong
- Typo in field name → frontend still reads undefined (mitigated by matching exact schema field names)

---

## PHASE 7 — Order.js planSnapshot Schema Fix (CODE CHANGE)

### What will be changed
Add `customInputLabel` to the `planSnapshot` sub-schema in `orderItemSchema`:

**File**: `src/models/Order.js` Lines 79–87
**Add**: `customInputLabel: { type: String, default: '' }`

### Exact files involved
- `src/models/Order.js` — Lines 79–87

### Risk level: LOW
- Adding one field to an existing sub-schema. No existing fields modified.
- Mongoose strict mode currently strips `customInputLabel` silently. After this fix, it will persist.

### Why this step is needed
`client.js` Line 3192 writes `customInputLabel` into planSnapshot, but Order.js schema doesn't define it. Mongoose strict mode silently strips it. When admin approves the order, `item.planSnapshot.customInputLabel` is `undefined`, so the task gets an empty label.

### What could go wrong
- Existing orders in DB won't retroactively gain this field (acceptable — only affects new orders)

---

## EXECUTION ORDER

```
Phase 1 (code) → Phase 2 (verify) → Phase 3 (verify) → Phase 4 (verify)
                                                              ↓
Phase 7 (code) → Phase 6 (code) → Phase 5 (verify) ←────────┘
```

**Recommended execution sequence:**
1. Phase 1 + Phase 6 + Phase 7 (all code changes — can be done together, 3 files)
2. Phase 2 + 3 + 4 + 5 (all verification — sequential testing)

**Total files modified: 3**
- `src/routes/admin.js` (Phase 1 + Phase 6)
- `src/routes/client.js` (Phase 6)
- `src/models/Order.js` (Phase 7)
