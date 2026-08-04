# COMMISSION SYSTEM DOCUMENTATION
## Current Implementation (As-Is)

**Document Purpose:** Describe the commission system exactly as it currently works, based strictly on the existing codebase.

**Last Updated:** Based on code inspection (no runtime verification performed)

---

## A. COMPLETE COMMISSION LIFECYCLE

### Stage 1: Client Creation
**Confirmed by code:**
- User registers with role=CLIENT (auth.js)
- User record created in User collection
- Wallet created for the client (seedWallets.js)

### Stage 2: Employee Creation
**Confirmed by code:**
- Admin creates Employee via POST /admin/employees (adminEmployees.js:145-182)
- Employee fields: name, identifier, phone, defaultRole, commissionSettings, notes
- Employee.userId field exists but defaults to null
- No code found that writes Employee.userId

### Stage 3: Client-Employee Assignment
**Confirmed by code:**
- Admin creates ClientEmployeeAssignment via POST /admin/employees/clients/:clientId/assignments (adminEmployees.js:291+)
- Assignment links clientId → employeeId
- Assignment has status (ACTIVE/INACTIVE)
- Assignment.notes can be set
- Commission settings come from Employee.commissionSettings (not assignment)

### Stage 4: Plan Purchase (Client Side)
**Confirmed by code:**
- Client purchases plan via POST /client/plans/:planId/purchase (client.js:1621-1659)
- System creates Task instance for the client
- Task status: PENDING_APPROVAL
- System calls getClientTeamAssignedUsers(clientId) to auto-populate assignedUsers
- getClientTeamAssignedUsers() filters out employees without userId (taskService.js:27)
- If teamAssignedUsers.length > 0, task.assignedUsers is populated
- Task.assignedTo is NOT set (defaults to null)

### Stage 5: Order Approval (Admin Side)
**Confirmed by code:**
- Admin approves order via POST /admin/orders/:orderId/approve (admin.js:3458-3535)
- System creates Task instances for each order item
- Admin can provide assignedTo and assignedUsers in request body
- Three-phase assignedUsers population (admin.js:3485-3520):
  1. Phase 1: planSnapshot.assignedUsers (from plan template)
  2. Phase 2: req.body.assignedUsers (admin input, highest priority)
  3. Phase 3: getClientTeamAssignedUsers() auto-populate (fallback)
- Task.assignedTo set from req.body.assignedTo (or null)
- Task.assignedUsers set from Phase 1/2/3 logic

### Stage 6: Task Assignment
**Confirmed by code:**
- Task can have both assignedTo and assignedUsers
- assignedTo: Single User ObjectId (legacy flow)
- assignedUsers: Array of { userId, percentage } (new flow)
- Both fields can coexist on the same Task

### Stage 7: Task Completion
**Confirmed by code:**
- Task status changes to COMPLETED
- Progress reaches 100%
- Commission calculation triggered (admin.js:1886)

### Stage 8: Commission Calculation
**Confirmed by code:**
- Triggered when task crosses completion threshold (admin.js:1883-1886)
- Two CASE paths with explicit priority:

**CASE 1: Multi-assignment (assignedUsers)**
- Condition: validAssignedUsers.length > 0 (admin.js:1889)
- validAssignedUsers = task.assignedUsers filtered for userId and percentage > 0
- Calculation (admin.js:1892-1914):
  - taskValue = task.creditsUsed || task.creditCost
  - totalCosts = expenses + tax + other
  - netValue = max(0, taskValue - totalCosts)
  - For each member: memberAmount = round((percentage / 100) * netValue)
  - createCommissionWithLedger() called for each member
  - task.commissionEarned = totalDistributed
  - task.companyEarning = max(0, netValue - totalDistributed)

**CASE 2: Single-assignment (assignedTo)**
- Condition: task.commissionValue > 0 && task.assignedTo (admin.js:1921)
- Only fires if CASE 1 did not fire (else if)
- Calculation (admin.js:1923-1931):
  - taskValue = task.creditsUsed || task.creditCost
  - If commissionType === 'percentage': commissionEarned = round((taskValue * commissionValue) / 100)
  - Else: commissionEarned = commissionValue
  - createCommissionWithLedger() called for task.assignedTo

### Stage 9: CommissionLog Creation
**Confirmed by code:**
- createCommissionWithLedger() helper (admin.js:45-93)
- Creates CommissionLog entry atomically with EarningsLedger
- CommissionLog fields: userId, taskId, taskTitle, amount, commissionType, commissionValue
- Idempotency check: skips if EarningsLedger entry already exists for userId+taskId+type='COMMISSION_EARNED'
- Transaction-based (with fallback for non-replica-set environments)

### Stage 10: EarningsLedger Update
**Confirmed by code:**
- EarningsLedger entry created alongside CommissionLog (admin.js:59-65)
- Fields: userId, type='COMMISSION_EARNED', amount, sourceTaskId, sourceCommissionLogId
- Idempotency index: { userId: 1, sourceTaskId: 1, type: 1 } (EarningsLedger.js:51)
- Prevents duplicate commission entries for same user+task

### Stage 11: Earnings Summary
**Confirmed by code:**
- GET /client/earnings/balance (client.js:3860-3880)
- Aggregates EarningsLedger by userId
- Calculates:
  - totalEarned: sum of all COMMISSION_EARNED
  - totalRedeemed: sum of all REDEEM_TO_WALLET + EXTERNAL_PAYOUT
  - availableBalance: totalEarned - totalRedeemed

### Stage 12: Redeem Request
**Confirmed by code:**
- Client creates redeem request via POST /client/earnings/redeem-request (client.js:3929+)
- Validates: amount > 0, redeemEnabled=true, amount >= minimumRedeemAmount, amount <= availableBalance
- Creates EarningsRedeemRequest with status=PENDING

### Stage 13: Redeem Approval
**Confirmed by code:**
- Admin approves via POST /admin/earnings/redeem-approve (admin.js:7739+)
- Validates: request exists, status=PENDING, sufficient balance
- Creates EarningsLedger entry (type='REDEEM_TO_WALLET' or 'EXTERNAL_PAYOUT')
- If WALLET: credits client's wallet with walletCredits
- Updates request status to APPROVED_WALLET or APPROVED_EXTERNAL

---

## B. ENTRY POINTS

### API Routes (Admin)

**Employee Management:**
- POST /admin/employees - Create Employee (adminEmployees.js:145)
- GET /admin/employees - List Employees (adminEmployees.js:119)
- PATCH /admin/employees/:employeeId - Update Employee (adminEmployees.js:195)
- POST /admin/employees/clients/:clientId/assignments - Create assignment (adminEmployees.js:291)
- GET /admin/employees/clients/:clientId/assignments - List assignments (adminEmployees.js:256)
- DELETE /admin/employees/clients/:clientId/assignments/:assignmentId - Delete assignment (adminEmployees.js:327)

**Order Management:**
- POST /admin/orders/:orderId/approve - Approve order (admin.js:3458)

**Commission Management:**
- GET /admin/commissions - List CommissionLogs (admin.js:7400+)
- GET /admin/earnings - Get earnings by userId (admin.js:7450+)
- GET /admin/earnings/config - Get earnings settings (admin.js:7641)
- PUT /admin/earnings/config - Update earnings settings (admin.js:7661)
- GET /admin/earnings/redeem-requests - List redeem requests (admin.js:7693)
- POST /admin/earnings/redeem-approve - Approve redeem request (admin.js:7739)

### API Routes (Client)

**Plan Purchase:**
- POST /client/plans/:planId/purchase - Purchase plan (client.js:1621)
- POST /client/subscriptions/:subscriptionId/purchase - Purchase subscription (client.js:1802)

**Earnings:**
- GET /client/earnings/balance - Get earnings balance (client.js:3860)
- GET /client/earnings/config - Get redeem config (client.js:3884)
- GET /client/earnings/redeem-requests - Get redeem history (client.js:3902)
- POST /client/earnings/redeem-request - Create redeem request (client.js:3929)

### Services

**taskService.js:**
- getClientTeamAssignedUsers(clientId) - Fetch client's team and convert to assignedUsers format (taskService.js:17-41)
- purchaseTaskFromTemplate() - Create task from template (taskService.js:43+)
- createTaskFromTaskDetails() - Create task with full details (taskService.js:170+)
- assignTaskToClient() - Assign task to client (taskService.js:250+)

### Helpers

**admin.js:**
- createCommissionWithLedger() - Create CommissionLog + EarningsLedger atomically (admin.js:45-93)
- reverseCommissionForTask() - Reverse commission on task reopen (admin.js:96+)

---

## C. DATA FLOW

### Model Relationships

**User**
- _id (ObjectId)
- identifier (String, unique)
- role (String: 'CLIENT' | 'ADMIN')
- customRole (ObjectId, ref: Role)
- assignedManagers (Array of ObjectId, ref: User)

**Employee**
- _id (ObjectId)
- name (String)
- identifier (String, unique)
- userId (ObjectId, ref: User, default: null) ← **LINKAGE FIELD**
- commissionSettings.enabled (Boolean)
- commissionSettings.percentage (Number)

**ClientEmployeeAssignment**
- _id (ObjectId)
- clientId (ObjectId, ref: User)
- employeeId (ObjectId, ref: Employee)
- status (String: 'ACTIVE' | 'INACTIVE')
- notes (String)

**Task**
- _id (ObjectId)
- clientId (ObjectId, ref: User)
- assignedTo (ObjectId, ref: User, default: null) ← **LEGACY ASSIGNMENT**
- assignedUsers (Array) ← **NEW ASSIGNMENT**
  - userId (ObjectId, ref: User)
  - percentage (Number)
- commissionType (String: 'percentage' | 'fixed')
- commissionValue (Number)
- commissionEarned (Number)
- creditCost (Number)
- creditsUsed (Number)
- costBreakdown.expenses (Number)
- costBreakdown.tax (Number)
- costBreakdown.other (Number)
- companyEarning (Number)

**CommissionLog**
- _id (ObjectId)
- userId (ObjectId, ref: User)
- taskId (ObjectId, ref: Task)
- taskTitle (String)
- amount (Number)
- commissionType (String)
- commissionValue (Number)

**EarningsLedger**
- _id (ObjectId)
- userId (ObjectId, ref: User)
- type (String: 'COMMISSION_EARNED' | 'COMMISSION_REVERSED' | 'ADMIN_BONUS' | 'ADMIN_DEDUCT' | 'REDEEM_TO_WALLET' | 'EXTERNAL_PAYOUT' | 'ADMIN_CORRECTION')
- amount (Number)
- sourceTaskId (ObjectId, ref: Task)
- sourceCommissionLogId (ObjectId, ref: CommissionLog)

**EarningsRedeemRequest**
- _id (ObjectId)
- userId (ObjectId, ref: User)
- requestedAmount (Number)
- status (String: 'PENDING' | 'APPROVED_WALLET' | 'APPROVED_EXTERNAL' | 'REJECTED')
- payoutMethod (String: 'WALLET' | 'EXTERNAL')
- transactionReference (String)
- adminNote (String)
- approvedByAdminId (ObjectId, ref: User)

### Data Flow Diagram

```
Client registers → User created (role=CLIENT)
                          ↓
Admin creates Employee → Employee created (userId=null)
                          ↓
Admin assigns Employee to Client → ClientEmployeeAssignment created
                          ↓
Client purchases Plan → Task created
                          ↓
                    getClientTeamAssignedUsers() called
                          ↓
                    Filters Employees by userId (line 27)
                          ↓
                    If userId exists → add to assignedUsers array
                    If userId=null → skip Employee
                          ↓
Task.assignedUsers populated (if Employees have userId)
Task.assignedTo populated (if admin provides it)
                          ↓
Task completes (status=COMPLETED, progress=100%)
                          ↓
Commission calculation triggered
                          ↓
              ┌───────────┴───────────┐
              ↓                       ↓
        CASE 1: assignedUsers     CASE 2: assignedTo
        (if validAssignedUsers > 0)  (else if commissionValue > 0)
              ↓                       ↓
        Split commission         Single commission
        among assignedUsers      to assignedTo
              ↓                       ↓
        createCommissionWithLedger() for each User
              ↓
        CommissionLog created
        EarningsLedger created (type=COMMISSION_EARNED)
              ↓
        User earnings balance increases
              ↓
        Client requests redeem → EarningsRedeemRequest created
              ↓
        Admin approves redeem
              ↓
        EarningsLedger created (type=REDEEM_TO_WALLET or EXTERNAL_PAYOUT)
              ↓
        If WALLET → Wallet.walletCredits increased
        If EXTERNAL → Manual payout outside system
```

---

## D. DECISION POINTS

### Decision Point 1: Task Creation - assignedUsers Population
**Location:** client.js:1658, taskService.js:113, taskService.js:242, admin.js:3512-3520

**Condition:** getClientTeamAssignedUsers(clientId) returns array

**Logic:**
- Query ClientEmployeeAssignment where clientId and status=ACTIVE
- Populate employeeId
- For each assignment:
  - If employee.userId exists → include in result
  - If employee.userId=null → skip (line 27)
- Return array of { userId, percentage }

**Outcome:**
- If array.length > 0 → task.assignedUsers populated
- If array.length = 0 → task.assignedUsers empty

### Decision Point 2: Commission Calculation - CASE Selection
**Location:** admin.js:1887-1945

**Condition:** validAssignedUsers.length > 0

**Logic:**
- Filter task.assignedUsers for userId and percentage > 0
- If validAssignedUsers.length > 0 → CASE 1
- Else if task.commissionValue > 0 && task.assignedTo → CASE 2
- Else → no commission

**Outcome:**
- CASE 1: Split commission among assignedUsers
- CASE 2: Give commission to assignedTo
- Neither: No commission created

### Decision Point 3: Commission Calculation - Amount
**Location:** admin.js:1892-1914 (CASE 1), admin.js:1924-1928 (CASE 2)

**CASE 1 Logic:**
- taskValue = task.creditsUsed || task.creditCost
- totalCosts = expenses + tax + other
- netValue = max(0, taskValue - totalCosts)
- For each member: memberAmount = round((percentage / 100) * netValue)

**CASE 2 Logic:**
- taskValue = task.creditsUsed || task.creditCost
- If commissionType === 'percentage': commissionEarned = round((taskValue * commissionValue) / 100)
- Else: commissionEarned = commissionValue

### Decision Point 4: Commission Source - Employee vs Assignment
**Location:** taskService.js:28-30

**Confirmed by code:**
- Commission percentage comes from Employee.commissionSettings (not assignment)
- If Employee.commissionSettings.enabled=true → use Employee.commissionSettings.percentage
- If Employee.commissionSettings.enabled=false → percentage=0

### Decision Point 5: Task Visibility - Manager Access
**Location:** admin.js:972-976

**Condition:** Manager without canViewAllTasks permission

**Logic:**
- Filter tasks where:
  - assignedTo = manager._id OR
  - assignedUsers.userId = manager._id

**Outcome:**
- Manager sees tasks assigned via either field

### Decision Point 6: Redeem Approval - Balance Validation
**Location:** admin.js:7760-7767

**Logic:**
- Aggregate EarningsLedger by userId
- Calculate currentBalance = sum of all amounts
- If request.requestedAmount > currentBalance → reject
- Else → approve

**Outcome:**
- Prevents double-redeem and overdraft

---

## E. CURRENT UNCERTAINTIES

### Confirmed by Code

1. Employee.userId field exists in schema (Employee.js:64-69)
2. Employee.userId defaults to null
3. No code found that writes Employee.userId
4. getClientTeamAssignedUsers() filters out employees without userId (taskService.js:27)
5. Commission calculation has two CASE paths with explicit priority
6. CASE 1 uses assignedUsers array
7. CASE 2 uses assignedTo field
8. CASE 1 takes priority over CASE 2 (else if structure)
9. Both assignedTo and assignedUsers can coexist on the same Task
10. Task creation writes both fields in some paths (order approval, createTaskFromTaskDetails)
11. Task creation writes only assignedUsers in other paths (client purchase)
12. Task creation writes only assignedTo in other paths (manual admin assignment)
13. Commission percentage comes from Employee.commissionSettings (not assignment)
14. createCommissionWithLedger() creates CommissionLog + EarningsLedger atomically
15. EarningsLedger has idempotency index to prevent duplicate COMMISSION_EARNED per user+task

### Hypotheses (Require Runtime Verification)

1. Employee.userId is null in production
2. This causes getClientTeamAssignedUsers() to return empty array
3. This causes task.assignedUsers to be empty
4. This causes CASE 1 to never fire
5. This causes commission to fall through to CASE 2 (if assignedTo exists) or no commission (if neither exists)
6. This is the root cause of the observed behavior (Demo User not receiving commission)

### Unknowns (Require Runtime Verification)

1. Whether any Employee in the production database has userId populated
2. Whether any Task in production has non-empty assignedUsers
3. Whether CASE 1 has ever fired in production
4. Whether any CommissionLog was created from a task with assignedUsers
5. Whether the Demo User has any Employees assigned via ClientEmployeeAssignment
6. Whether switchtodevil (Employee) has userId populated
7. Whether riyasharma's commission came from CASE 1 or CASE 2
8. What the actual commission data looks like in production
9. Whether the original developer intended auto-linking or manual linking for Employee→User
10. Whether there's a business rule defining how Employee should link to User

---

## F. GLOSSARY

**assignedTo:** Legacy single-assignment field on Task. References a single User ObjectId. Used for task ownership and commission (CASE 2).

**assignedUsers:** New multi-assignment field on Task. Array of { userId, percentage }. Used for commission split (CASE 1).

**Employee:** Accounting profile representing a person who works for the company. Has commissionSettings. Can be linked to a User via userId field.

**ClientEmployeeAssignment:** Mapping table linking Client to Employee. Has status (ACTIVE/INACTIVE). Does not store commission settings (those come from Employee).

**CommissionLog:** Record of a commission event. Tracks userId, taskId, amount, commissionType, commissionValue.

**EarningsLedger:** Immutable ledger tracking all earnings transactions per User. Types: COMMISSION_EARNED, COMMISSION_REVERSED, ADMIN_BONUS, ADMIN_DEDUCT, REDEEM_TO_WALLET, EXTERNAL_PAYOUT, ADMIN_CORRECTION.

**CASE 1:** Commission calculation path for multi-assignment (assignedUsers). Splits commission among all assignedUsers based on their percentages.

**CASE 2:** Commission calculation path for single-assignment (assignedTo). Gives entire commission to assignedTo user.

---

## G. REVISION HISTORY

**Initial Draft:** Based on static code analysis only. No runtime verification performed.

**Pending:** Runtime audit required to confirm hypotheses and resolve unknowns.

---

**END OF DOCUMENT**
