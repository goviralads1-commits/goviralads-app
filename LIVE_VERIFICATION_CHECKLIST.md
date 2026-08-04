# LIVE APPLICATION VERIFICATION CHECKLIST
## Based on Existing Implementation Only

**Purpose:** Verify the existing commission workflow implementation in the live application.

**Constraint:** Every step is based on existing screens, APIs, and functionality. No hypothetical features.

---

## VERIFICATION STEPS

### STEP 1: Employee Management Page

**Existing Screen:**
- Admin Panel → Employees (`/employees`)
- File: `frontend/admin-panel/src/pages/Employees.jsx`

**Existing API:**
- GET /admin/employees
- File: `src/routes/adminEmployees.js:119-143`

**Existing Backend Logic:**
- Retrieves all Employee records
- Returns: name, identifier, phone, defaultRole, commissionSettings, notes, userId

**Existing Models:**
- Employee collection

**Action:**
1. Navigate to `/employees`
2. Click "Create Employee" button
3. Fill form:
   - Name: "Test Employee"
   - Email/Identifier: "test.employee"
   - Phone: "1234567890"
   - Default Role: "ACCOUNT_MANAGER"
   - Commission Enabled: YES
   - Commission Percentage: 50
   - Notes: "Test"
4. Click "Save"

**Expected Behavior (Based on Current Code):**
- POST /admin/employees called (Employees.jsx:112)
- Employee created with fields: name, identifier, phone, defaultRole, commissionSettings, notes, createdBy
- Employee.userId defaults to null (Employee.js:67)
- Employee appears in list
- serializeEmployee() returns userId field (adminEmployees.js:35)

**Database Query:**
```javascript
db.employees.findOne({ identifier: 'test.employee' })
```

**Expected Result:**
- Employee document exists
- userId field: null (based on current code - no write path exists)
- commissionSettings: { enabled: true, percentage: 50 }

**Record:**
- [ ] Employee created successfully
- [ ] Employee.userId value: _______
- [ ] commissionSettings correct: YES / NO

---

### STEP 2: Employee Detail Page

**Existing Screen:**
- Admin Panel → Employees → Click Employee → Employee Detail (`/employees/:employeeId`)
- File: `frontend/admin-panel/src/pages/EmployeeDetail.jsx`

**Existing API:**
- GET /admin/employees/:employeeId
- File: `src/routes/adminEmployees.js:78-98`

**Existing Backend Logic:**
- Retrieves Employee by ID
- Returns: all Employee fields including userId

**Existing Models:**
- Employee collection

**Action:**
1. Click on "Test Employee" from list
2. View Employee Detail page
3. Check "Overview" tab

**Expected Behavior (Based on Current Code):**
- GET /admin/employees/:employeeId called (EmployeeDetail.jsx:48)
- Employee data loaded
- userId field displayed (if present in response)
- If userId is null, no commission data fetched (EmployeeDetail.jsx:80)

**Database Query:**
```javascript
db.employees.findOne({ identifier: 'test.employee' }, { name: 1, identifier: 1, userId: 1 })
```

**Expected Result:**
- Employee detail page loads
- userId field: null (based on current code)
- Commission tab: Shows "No commissions" or does not load (because userId is null)

**Record:**
- [ ] Employee detail page loads: YES / NO
- [ ] userId displayed: _______
- [ ] Commission tab behavior: _______

---

### STEP 3: Client-Employee Assignment (via ClientDetail or Profile)

**Existing Screen:**
- Admin Panel → Clients → Select Client → Edit → Employee Assignment tab
- File: `frontend/admin-panel/src/pages/ClientDetail.jsx` OR `frontend/admin-panel/src/pages/Profile.jsx`

**Existing API:**
- POST /admin/employees/clients/:clientId/assignments
- File: `src/routes/adminEmployees.js:291-325`

**Existing Backend Logic:**
- Creates ClientEmployeeAssignment record
- Links clientId to employeeId
- Status: ACTIVE
- Notes can be set
- Commission settings come from Employee model (not assignment)

**Existing Models:**
- ClientEmployeeAssignment collection

**Action:**
1. Navigate to Clients page
2. Select a test client
3. Click "Edit" to open client detail
4. Go to "Employee Assignment" tab
5. Click "Assign Employee"
6. Select "Test Employee" from dropdown
7. Click "Save"

**Expected Behavior (Based on Current Code):**
- POST /admin/employees/clients/:clientId/assignments called (ClientDetail.jsx:119 or Profile.jsx:340)
- ClientEmployeeAssignment created
- Assignment appears in list
- Employee.commissionSettings used for commission (not assignment settings)

**Database Query:**
```javascript
db.clientemployeeassignments.findOne({ clientId: ObjectId('<client_id>'), employeeId: ObjectId('<employee_id>') })
```

**Expected Result:**
- Assignment document exists
- status: "ACTIVE"
- Employee.userId still null (assignment does not modify Employee)

**Record:**
- [ ] Assignment created: YES / NO
- [ ] Assignment status: _______
- [ ] Employee.userId after assignment: _______

---

### STEP 4: Plan Purchase (Client Side)

**Existing Screen:**
- Client Portal → Plans → Select Plan → Purchase
- File: `frontend/client-app/src/pages/Plans.jsx`

**Existing API:**
- POST /client/plans/:planId/purchase
- File: `src/routes/client.js:1621-1659`

**Existing Backend Logic:**
- Creates Task instance from Plan
- Calls getClientTeamAssignedUsers(clientId) (client.js:1619)
- getClientTeamAssignedUsers() queries ClientEmployeeAssignment (taskService.js:19-22)
- Populates employeeId (taskService.js:22)
- Filters out employees without userId (taskService.js:27)
- If Employee.userId exists, adds to assignedUsers array (taskService.js:31-34)
- If teamAssignedUsers.length > 0, sets task.assignedUsers (client.js:1658)

**Existing Models:**
- Task collection
- ClientEmployeeAssignment collection (read)
- Employee collection (read)

**Action:**
1. Login as test client
2. Navigate to Plans page
3. Select a plan
4. Click "Purchase" or "Buy Now"
5. Confirm purchase

**Expected Behavior (Based on Current Code):**
- POST /client/plans/:planId/purchase called
- Task created with status: PENDING_APPROVAL
- getClientTeamAssignedUsers() called
- If Employee.userId is null → assignedUsers array empty
- If Employee.userId exists → assignedUsers populated
- Task.assignedTo: null (not set in this flow)

**Database Query:**
```javascript
db.tasks.find({ clientId: ObjectId('<client_id>') }).sort({ createdAt: -1 }).limit(1)
```

**Expected Result:**
- Task document exists
- status: "PENDING_APPROVAL"
- assignedUsers: [] (if Employee.userId is null) OR [{ userId: <id>, percentage: 50 }] (if Employee.userId exists)
- assignedTo: null

**Record:**
- [ ] Task created: YES / NO
- [ ] Task.status: _______
- [ ] Task.assignedUsers: _______ (array or empty)
- [ ] Task.assignedTo: _______

---

### STEP 5: Order Approval (Admin Side)

**Existing Screen:**
- Admin Panel → Orders → Select Order → Approve
- File: `frontend/admin-panel/src/pages/Orders.jsx`

**Existing API:**
- POST /admin/orders/:orderId/approve
- File: `src/routes/admin.js:3458-3535`

**Existing Backend Logic:**
- Creates Task instances for order items
- Calls getClientTeamAssignedUsers() if assignedUsers not provided (admin.js:3488)
- Three-phase assignedUsers population (admin.js:3512-3520):
  1. planSnapshot.assignedUsers
  2. req.body.assignedUsers (admin input)
  3. getClientTeamAssignedUsers() fallback
- Sets task.assignedTo from req.body.assignedTo (admin.js:3510)

**Existing Models:**
- Task collection (created/updated)
- Order collection (updated)

**Action:**
1. Login as admin
2. Navigate to Orders page
3. Find pending order from Step 4
4. Click "Approve"
5. (Optional) Manually set assignedTo or assignedUsers
6. Click "Approve Order"

**Expected Behavior (Based on Current Code):**
- POST /admin/orders/:orderId/approve called
- Task created/updated
- assignedUsers populated from 3-phase logic
- assignedTo set if admin provided it
- Order status: APPROVED

**Database Query:**
```javascript
db.tasks.findOne({ _id: ObjectId('<task_id>') }, { title: 1, status: 1, assignedUsers: 1, assignedTo: 1 })
```

**Expected Result:**
- Task document exists
- status: "IN_PROGRESS" or "ACTIVE"
- assignedUsers: [] or populated (depending on Employee.userId)
- assignedTo: null or ObjectId (depending on admin input)

**Record:**
- [ ] Order approved: YES / NO
- [ ] Task.status: _______
- [ ] Task.assignedUsers: _______
- [ ] Task.assignedTo: _______

---

### STEP 6: Task Completion and Commission Calculation

**Existing Screen:**
- Admin Panel → Tasks → Select Task → Complete
- File: `frontend/admin-panel/src/pages/TaskDetail.jsx`

**Existing API:**
- PATCH /admin/tasks/:taskId
- File: `src/routes/admin.js:1800+`

**Existing Backend Logic:**
- Detects task completion (admin.js:1883-1886)
- If crossedCompletion and commissionEarned is null:
  - CASE 1: If validAssignedUsers.length > 0 (admin.js:1889)
    - Split commission among assignedUsers
    - Call createCommissionWithLedger() for each (admin.js:1902)
  - CASE 2: Else if commissionValue > 0 and assignedTo exists (admin.js:1921)
    - Give commission to assignedTo
    - Call createCommissionWithLedger() (admin.js:1933)
- createCommissionWithLedger() creates CommissionLog + EarningsLedger (admin.js:45-93)

**Existing Models:**
- Task collection (updated)
- CommissionLog collection (created)
- EarningsLedger collection (created)

**Action:**
1. Navigate to Tasks page
2. Find task from Step 4/5
3. Open task detail
4. Update progress to 100% OR change status to "COMPLETED"
5. Save changes

**Expected Behavior (Based on Current Code):**
- PATCH /admin/tasks/:taskId called
- Task status: COMPLETED
- Commission calculation triggered
- If assignedUsers has valid entries → CASE 1 fires → CommissionLog created
- If assignedTo exists → CASE 2 fires → CommissionLog created
- If neither → No commission created

**Database Query:**
```javascript
db.tasks.findOne({ _id: ObjectId('<task_id>') }, { status: 1, progress: 1, commissionEarned: 1 })
db.commissionlogs.find({ taskId: ObjectId('<task_id>') })
db.earningsledgers.find({ sourceTaskId: ObjectId('<task_id>') })
```

**Expected Result:**
- Task.status: "COMPLETED"
- Task.progress: 100
- Task.commissionEarned: number or null
- CommissionLog count: 0 (if no assignedUsers and no assignedTo) OR >0 (if assignedUsers or assignedTo exists)
- EarningsLedger count: 0 or >0

**Record:**
- [ ] Task completed: YES / NO
- [ ] Task.commissionEarned: _______
- [ ] CommissionLog created: YES / NO
- [ ] CommissionLog count: _______
- [ ] EarningsLedger created: YES / NO
- [ ] EarningsLedger count: _______

---

### STEP 7: Commission Display (Admin - Employee Detail)

**Existing Screen:**
- Admin Panel → Employees → Select Employee → Commission Tab
- File: `frontend/admin-panel/src/pages/EmployeeDetail.jsx`

**Existing API:**
- GET /admin/commissions?userId=<employee_user_id>
- File: `src/routes/admin.js:7280-7370`

**Existing Backend Logic:**
- Queries CommissionLog by userId
- Returns commission history
- Aggregates EarningsLedger for totals

**Existing Models:**
- CommissionLog collection
- EarningsLedger collection

**Action:**
1. Navigate to Employees page
2. Click on "Test Employee"
3. Go to "Commission" tab

**Expected Behavior (Based on Current Code):**
- If employee.userId is null → fetchCommissions() returns early (EmployeeDetail.jsx:80)
- Commission tab shows no data OR does not load
- If employee.userId exists → GET /admin/commissions called
- Commission history displayed

**Database Query:**
```javascript
db.commissionlogs.find({ userId: ObjectId('<employee_user_id>') })
```

**Expected Result:**
- If Employee.userId is null → No commission data displayed
- If Employee.userId exists → Commission data displayed (if any exists)

**Record:**
- [ ] Commission tab loads: YES / NO
- [ ] Commission entries displayed: _______
- [ ] API called: YES / NO
- [ ] API response: _______

---

### STEP 8: Earnings Display (Client Side)

**Existing Screen:**
- Client Portal → Earnings or Profile
- File: `frontend/client-app/src/pages/Earnings.jsx` OR `frontend/client-app/src/pages/EarningsLedger.jsx`

**Existing API:**
- GET /client/earnings-balance
- File: `src/routes/client.js:3837-3880`

**Existing Backend Logic:**
- Aggregates EarningsLedger by userId (req.user.id)
- Returns balance and entries

**Existing Models:**
- EarningsLedger collection

**Action:**
1. Login as the User who is linked to Employee (if any)
2. Navigate to Earnings page

**Expected Behavior (Based on Current Code):**
- GET /client/earnings-balance called
- Earnings balance displayed
- Earnings history displayed

**Database Query:**
```javascript
db.earningsledgers.find({ userId: ObjectId('<user_id>') })
```

**Expected Result:**
- If EarningsLedger entries exist → Balance displayed
- If no entries → Balance: 0

**Record:**
- [ ] Earnings page loads: YES / NO
- [ ] Earnings balance: _______
- [ ] Earnings entries: _______

---

### STEP 9: Redeem Request (Client Side)

**Existing Screen:**
- Client Portal → Earnings → Redeem
- File: `frontend/client-app/src/pages/Earnings.jsx`

**Existing API:**
- POST /client/earnings/redeem-request
- File: `src/routes/client.js:3929-3997`

**Existing Backend Logic:**
- Creates EarningsRedeemRequest
- Validates amount and balance
- Status: PENDING

**Existing Models:**
- EarningsRedeemRequest collection

**Action:**
1. Login as client with earnings
2. Navigate to Earnings page
3. Click "Redeem"
4. Enter amount
5. Submit

**Expected Behavior (Based on Current Code):**
- POST /client/earnings/redeem-request called
- EarningsRedeemRequest created
- Status: PENDING

**Database Query:**
```javascript
db.earningsredeemrequests.find({ userId: ObjectId('<user_id>') })
```

**Expected Result:**
- Redeem request exists
- status: "PENDING"

**Record:**
- [ ] Redeem request created: YES / NO
- [ ] Request status: _______

---

### STEP 10: Redeem Approval (Admin Side)

**Existing Screen:**
- Admin Panel → Earnings → Redeem Requests → Approve
- File: `frontend/admin-panel/src/pages/EarningsRedeems.jsx`

**Existing API:**
- POST /admin/earnings/redeem-approve
- File: `src/routes/admin.js:7739-7850`

**Existing Backend Logic:**
- Approves redeem request
- Creates EarningsLedger entry (type: REDEEM_TO_WALLET or EXTERNAL_PAYOUT)
- If WALLET → credits wallet

**Existing Models:**
- EarningsRedeemRequest collection (updated)
- EarningsLedger collection (created)
- Wallet collection (updated if WALLET)

**Action:**
1. Login as admin
2. Navigate to Earnings → Redeem Requests
3. Find pending request
4. Click "Approve"
5. Select payout method
6. Submit

**Expected Behavior (Based on Current Code):**
- POST /admin/earnings/redeem-approve called
- Request status: APPROVED_WALLET or APPROVED_EXTERNAL
- EarningsLedger entry created
- If WALLET → Wallet credited

**Database Query:**
```javascript
db.earningsredeemrequests.findOne({ _id: ObjectId('<request_id>') })
db.earningsledgers.find({ userId: ObjectId('<user_id>'), type: { $in: ['REDEEM_TO_WALLET', 'EXTERNAL_PAYOUT'] } })
```

**Expected Result:**
- Request status updated
- EarningsLedger entry exists
- Wallet updated (if WALLET method)

**Record:**
- [ ] Redeem approved: YES / NO
- [ ] Request status: _______
- [ ] EarningsLedger entry created: YES / NO
- [ ] Wallet credited (if WALLET): YES / NO

---

## CRITICAL CHECKPOINT: Employee.userId

**Based on Current Code:**
- Employee.userId field exists (Employee.js:64-69)
- No code path writes to Employee.userId (confirmed by repository-wide search)
- Employee creation does NOT set userId (adminEmployees.js:168-176)
- Employee update does NOT accept userId (adminEmployees.js:184-208)
- getClientTeamAssignedUsers() filters out employees without userId (taskService.js:27)

**Expected Behavior:**
- All Employees have userId = null
- assignedUsers array is always empty (because userId is null)
- CASE 1 commission never fires (because assignedUsers is empty)
- CASE 2 commission fires only if assignedTo is manually set by admin

**Verification:**
```javascript
db.employees.find({}, { name: 1, identifier: 1, userId: 1 })
```

**Expected Result:**
- All Employees have userId: null

**If ANY Employee has userId populated:**
- Investigate how it was populated
- This would indicate a write path not found in static analysis

---

## SUMMARY

**This checklist verifies ONLY existing implementation.**

**No hypothetical features.**

**No assumed functionality.**

**Every step based on actual code.**

---

**END OF CHECKLIST**
