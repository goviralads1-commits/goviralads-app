# TEST CASES FOR EMPLOYEE-USER LINKAGE

## Test Case 1: Employee Creation with User Linkage

**Preconditions:**
- Admin logged in
- At least one User exists in database

**Steps:**
1. Navigate to Employees page
2. Click "Create Employee"
3. Fill form:
   - Name: "Test Employee"
   - Email/Identifier: "test.employee"
   - Phone: "1234567890"
   - Default Role: "ACCOUNT_MANAGER"
   - Commission Enabled: YES
   - Commission Percentage: 50
   - Linked User Account: Select a User from dropdown
4. Click "Save"

**Expected Result:**
- Employee created successfully
- Employee.userId = selected User._id
- Success message displayed
- Employee appears in list

**Database Verification:**
```javascript
db.employees.findOne({ identifier: 'test.employee' })
// Expected: userId field contains User ObjectId
```

---

## Test Case 2: Employee Edit - Change User Linkage

**Preconditions:**
- Employee exists with linked User
- At least one other User exists

**Steps:**
1. Navigate to Employees page
2. Click "Edit" on Employee
3. Change "Linked User Account" to different User
4. Click "Save"

**Expected Result:**
- Employee updated successfully
- Employee.userId = new User._id
- Success message displayed

**Database Verification:**
```javascript
db.employees.findOne({ _id: ObjectId('employee_id') })
// Expected: userId field contains new User ObjectId
```

---

## Test Case 3: Employee Edit - Clear User Linkage

**Preconditions:**
- Employee exists with linked User

**Steps:**
1. Navigate to Employees page
2. Click "Edit" on Employee
3. Change "Linked User Account" to "-- No User Linked --"
4. Click "Save"

**Expected Result:**
- Employee updated successfully
- Employee.userId = null
- Success message displayed

**Database Verification:**
```javascript
db.employees.findOne({ _id: ObjectId('employee_id') })
// Expected: userId field is null
```

---

## Test Case 4: Validation - Duplicate User Linkage

**Preconditions:**
- User A is already linked to Employee X
- Employee Y exists

**Steps:**
1. Navigate to Employees page
2. Click "Edit" on Employee Y
3. Try to select User A from dropdown
4. Click "Save"

**Expected Result:**
- Error message: "This User is already linked to another Employee"
- Employee Y.userId remains unchanged
- Dropdown shows error state

**API Verification:**
```
PATCH /admin/employees/Y
Request: { userId: "A" }
Response: 400 { error: "This User is already linked to another Employee" }
```

---

## Test Case 5: Commission Flow - CASE 1 (Multi-Assignment)

**Preconditions:**
- Employee exists with linked User
- Employee has commission enabled (50%)
- Employee assigned to Client
- Client has credits

**Steps:**
1. Login as Client
2. Navigate to Plans
3. Purchase a plan (cost: 100 credits)
4. Verify Task created
5. Login as Admin
6. Navigate to Tasks
7. Open Task detail
8. Mark Task as COMPLETED (100% progress)

**Expected Result:**
- Task.assignedUsers = [{ userId: Employee.userId, percentage: 50 }]
- CommissionLog created
- EarningsLedger entry created
- Commission amount: 50 (50% of 100)

**Database Verification:**
```javascript
// Check Task
db.tasks.findOne({ _id: ObjectId('task_id') })
// Expected: assignedUsers array populated

// Check CommissionLog
db.commissionlogs.find({ taskId: ObjectId('task_id') })
// Expected: 1 entry with amount = 50

// Check EarningsLedger
db.earningsledgers.find({ sourceTaskId: ObjectId('task_id') })
// Expected: 1 entry with type = "COMMISSION_EARNED", amount = 50
```

---

## Test Case 6: Commission Flow - CASE 2 (Single Assignment)

**Preconditions:**
- Task exists WITHOUT assignedUsers
- Task has assignedTo set manually
- Task has commissionValue > 0

**Steps:**
1. Login as Admin
2. Navigate to Tasks
3. Open Task detail
4. Verify assignedTo is set
5. Mark Task as COMPLETED

**Expected Result:**
- CommissionLog created
- EarningsLedger entry created
- Commission calculated based on commissionValue

**Database Verification:**
```javascript
// Check CommissionLog
db.commissionlogs.find({ taskId: ObjectId('task_id') })
// Expected: 1 entry for assignedTo User

// Check EarningsLedger
db.earningsledgers.find({ sourceTaskId: ObjectId('task_id') })
// Expected: 1 entry with type = "COMMISSION_EARNED"
```

---

## Test Case 7: Earnings Display

**Preconditions:**
- User has commission history (from Test Case 5 or 6)

**Steps:**
1. Login as User with earnings
2. Navigate to Earnings page

**Expected Result:**
- Earnings balance displayed
- Earnings history shows commission entries
- Total matches sum of COMMISSION_EARNED entries

**API Verification:**
```
GET /client/earnings-balance
Response: { balance: 50, entries: [...] }
```

---

## Test Case 8: Redeem Request

**Preconditions:**
- User has earnings balance > 0

**Steps:**
1. Login as User with earnings
2. Navigate to Earnings page
3. Click "Redeem"
4. Enter amount: 50
5. Select payout method: WALLET
6. Submit

**Expected Result:**
- Redeem request created
- Status: PENDING
- Request appears in admin panel

**Database Verification:**
```javascript
db.earningsredeemrequests.findOne({ userId: ObjectId('user_id') })
// Expected: status = "PENDING", amount = 50
```

---

## Test Case 9: Redeem Approval

**Preconditions:**
- Redeem request exists with status PENDING

**Steps:**
1. Login as Admin
2. Navigate to Earnings → Redeem Requests
3. Find pending request
4. Click "Approve"
5. Select payout method: WALLET
6. Submit

**Expected Result:**
- Redeem request status: APPROVED_WALLET
- EarningsLedger entry created (type: REDEEM_TO_WALLET)
- User's wallet balance increased

**Database Verification:**
```javascript
// Check Redeem Request
db.earningsredeemrequests.findOne({ _id: ObjectId('request_id') })
// Expected: status = "APPROVED_WALLET"

// Check EarningsLedger
db.earningsledgers.find({ userId: ObjectId('user_id'), type: 'REDEEM_TO_WALLET' })
// Expected: 1 entry

// Check Wallet
db.wallets.findOne({ clientId: ObjectId('user_id') })
// Expected: balance increased by 50
```

---

## Test Case 10: Regression - Employee Without User Linkage

**Preconditions:**
- Employee exists WITHOUT linked User

**Steps:**
1. Create Employee without selecting User
2. Assign Employee to Client
3. Purchase plan as Client
4. Complete Task

**Expected Result:**
- Task created
- Task.assignedUsers = [] (empty, because Employee.userId is null)
- No commission generated via CASE 1
- Task can still be completed normally

**Database Verification:**
```javascript
db.tasks.findOne({ _id: ObjectId('task_id') })
// Expected: assignedUsers = []
```

---

## Test Case 11: User Selector Dropdown

**Preconditions:**
- Multiple Users exist
- Some Users already linked to Employees

**Steps:**
1. Navigate to Employees page
2. Click "Create Employee"
3. Click "Linked User Account" dropdown

**Expected Result:**
- Dropdown shows "-- No User Linked --" option
- Dropdown shows only Users NOT already linked to Employees
- Each option shows: User name (identifier)
- Can select User

**API Verification:**
```
GET /admin/employees/available-users
Response: { users: [ { id, identifier, name, ... } ] }
// Expected: Only Users not linked to any Employee
```

---

## Test Case 12: Validation - Invalid User ID

**Preconditions:**
- Employee exists

**Steps:**
1. Login as Admin
2. Send PATCH request with invalid userId

**API Request:**
```
PATCH /admin/employees/employee_id
Body: { userId: "invalid_id" }
```

**Expected Result:**
- Response: 404 { error: "User not found" }
- Employee.userId unchanged

---

## SUMMARY

**Total Test Cases:** 12
**Critical Path:** Test Cases 1, 5, 6, 7, 8, 9
**Regression:** Test Cases 6, 10
**Validation:** Test Cases 4, 11, 12

**Execution Order:**
1. Test Case 1 (Basic linkage)
2. Test Case 2 (Change linkage)
3. Test Case 3 (Clear linkage)
4. Test Case 11 (Dropdown)
5. Test Case 4 (Validation)
6. Test Case 5 (CASE 1 commission)
7. Test Case 6 (CASE 2 commission)
8. Test Case 7 (Earnings display)
9. Test Case 8 (Redeem request)
10. Test Case 9 (Redeem approval)
11. Test Case 10 (Regression)
12. Test Case 12 (Validation)

**All test cases must pass before deployment.**
