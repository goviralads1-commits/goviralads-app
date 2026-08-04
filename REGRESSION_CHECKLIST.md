# REGRESSION TEST CHECKLIST

## Objective
Verify that existing features still work after Employee-User linkage implementation.

---

## 1. Employee Management

### 1.1 Create Employee (Without User Linkage)
- [ ] Create Employee without selecting User
- [ ] Verify Employee created successfully
- [ ] Verify Employee.userId = null
- [ ] Verify all fields saved correctly (name, identifier, phone, role, commission)

### 1.2 Edit Employee (Without Changing User Linkage)
- [ ] Edit Employee name
- [ ] Edit Employee phone
- [ ] Edit Employee role
- [ ] Edit Employee commission settings
- [ ] Verify all changes saved
- [ ] Verify Employee.userId unchanged

### 1.3 Delete Employee
- [ ] Delete Employee with linked User
- [ ] Delete Employee without linked User
- [ ] Verify Employee deleted
- [ ] Verify ClientEmployeeAssignment removed

### 1.4 View Employee List
- [ ] View Employee list
- [ ] Verify all Employees displayed
- [ ] Verify linked status shown correctly

### 1.5 View Employee Detail
- [ ] View Employee detail page
- [ ] Verify all fields displayed
- [ ] Verify commission settings shown
- [ ] Verify assignments shown

---

## 2. User Management

### 2.1 Create User
- [ ] Create User with role CLIENT
- [ ] Create User with role ADMIN
- [ ] Verify User created successfully
- [ ] Verify User can login

### 2.2 Edit User
- [ ] Edit User profile
- [ ] Edit User status
- [ ] Verify changes saved

### 2.3 View User List
- [ ] View User list
- [ ] Verify all Users displayed
- [ ] Verify User details correct

### 2.4 View User Detail
- [ ] View User detail page
- [ ] Verify all tabs work
- [ ] Verify Employee assignment tab works

---

## 3. Client Assignment

### 3.1 Assign Employee to Client
- [ ] Assign Employee (with linked User) to Client
- [ ] Assign Employee (without linked User) to Client
- [ ] Verify ClientEmployeeAssignment created
- [ ] Verify assignment appears in list

### 3.2 Remove Employee from Client
- [ ] Remove Employee assignment
- [ ] Verify assignment status = REMOVED
- [ ] Verify assignment no longer appears in active list

### 3.3 View Assigned Employees
- [ ] View Client detail
- [ ] Go to Employee Assignment tab
- [ ] Verify assigned Employees displayed
- [ ] Verify roles displayed correctly

---

## 4. Plan Purchase

### 4.1 Purchase Plan (Normal Flow)
- [ ] Login as Client
- [ ] Navigate to Plans
- [ ] Purchase plan with credits
- [ ] Verify plan purchased
- [ ] Verify credits deducted
- [ ] Verify Task created

### 4.2 Purchase Plan (With Assigned Employees)
- [ ] Assign Employee to Client first
- [ ] Purchase plan
- [ ] Verify Task created
- [ ] Verify Task.assignedUsers populated (if Employee has linked User)

### 4.3 View Orders
- [ ] View Orders page
- [ ] Verify orders displayed
- [ ] Verify order details correct

---

## 5. Task Creation

### 5.1 Task Created from Plan
- [ ] Purchase plan
- [ ] Verify Task created
- [ ] Verify Task fields correct (title, description, creditCost, etc.)
- [ ] Verify Task.status = PENDING_APPROVAL

### 5.2 Task with assignedUsers
- [ ] Purchase plan with assigned Employees
- [ ] Verify Task.assignedUsers populated
- [ ] Verify each entry has userId and percentage

### 5.3 Task with assignedTo (Manual)
- [ ] Create Task manually
- [ ] Set assignedTo field
- [ ] Verify Task.assignedTo set correctly

---

## 6. Task Completion

### 6.1 Mark Task Complete (100% Progress)
- [ ] Open Task detail
- [ ] Set progress to 100%
- [ ] Save changes
- [ ] Verify Task.status = COMPLETED
- [ ] Verify Task.progress = 100

### 6.2 Mark Task Complete (Status Change)
- [ ] Open Task detail
- [ ] Change status to COMPLETED
- [ ] Save changes
- [ ] Verify Task.status = COMPLETED

### 6.3 Task Completion Notification
- [ ] Complete Task
- [ ] Verify notification sent to Client
- [ ] Verify notification sent to Admin

---

## 7. Commission Generation

### 7.1 CASE 1 Commission (assignedUsers)
- [ ] Create Task with assignedUsers
- [ ] Complete Task
- [ ] Verify CommissionLog created for each User
- [ ] Verify commission amounts correct
- [ ] Verify EarningsLedger entries created

### 7.2 CASE 2 Commission (assignedTo)
- [ ] Create Task with assignedTo (no assignedUsers)
- [ ] Complete Task
- [ ] Verify CommissionLog created for assignedTo User
- [ ] Verify commission amount correct
- [ ] Verify EarningsLedger entry created

### 7.3 No Commission (No Assignment)
- [ ] Create Task without assignedUsers or assignedTo
- [ ] Complete Task
- [ ] Verify NO CommissionLog created
- [ ] Verify Task completed successfully

### 7.4 Commission Split (Multiple Users)
- [ ] Create Task with multiple assignedUsers
- [ ] Set different percentages (e.g., 30%, 20%)
- [ ] Complete Task
- [ ] Verify commission split correctly
- [ ] Verify each User receives correct amount

---

## 8. Earnings Display

### 8.1 View Earnings Balance
- [ ] Login as User with earnings
- [ ] Navigate to Earnings page
- [ ] Verify balance displayed
- [ ] Verify balance matches sum of COMMISSION_EARNED entries

### 8.2 View Earnings History
- [ ] View Earnings page
- [ ] Verify earnings history displayed
- [ ] Verify each entry shows (type, amount, date, source)

### 8.3 Commission Tab (Admin)
- [ ] Navigate to Employee detail
- [ ] Go to Commission tab
- [ ] Verify commission history displayed
- [ ] Verify total earnings displayed

---

## 9. Redeem Flow

### 9.1 Request Redeem
- [ ] Login as User with earnings
- [ ] Navigate to Earnings page
- [ ] Click "Redeem"
- [ ] Enter amount
- [ ] Select payout method
- [ ] Submit
- [ ] Verify redeem request created
- [ ] Verify status = PENDING

### 9.2 View Redeem Requests (Admin)
- [ ] Login as Admin
- [ ] Navigate to Earnings → Redeem Requests
- [ ] Verify requests displayed
- [ ] Verify request details correct

### 9.3 Approve Redeem (WALLET)
- [ ] Find pending redeem request
- [ ] Click "Approve"
- [ ] Select payout method: WALLET
- [ ] Submit
- [ ] Verify request status = APPROVED_WALLET
- [ ] Verify EarningsLedger entry created
- [ ] Verify Wallet balance increased

### 9.4 Approve Redeem (EXTERNAL)
- [ ] Find pending redeem request
- [ ] Click "Approve"
- [ ] Select payout method: EXTERNAL
- [ ] Enter transaction reference
- [ ] Submit
- [ ] Verify request status = APPROVED_EXTERNAL
- [ ] Verify EarningsLedger entry created

### 9.5 Reject Redeem
- [ ] Find pending redeem request
- [ ] Click "Reject"
- [ ] Enter reason
- [ ] Submit
- [ ] Verify request status = REJECTED

---

## 10. Existing Features (No Changes Expected)

### 10.1 Wallet Management
- [ ] View Wallet balance
- [ ] Admin adjust balance
- [ ] Verify transactions recorded

### 10.2 Billing
- [ ] View billing history
- [ ] Verify invoices displayed

### 10.3 Categories
- [ ] View categories
- [ ] Create/edit/delete categories
- [ ] Verify categories work

### 10.4 Plans
- [ ] View plans
- [ ] Create/edit/delete plans
- [ ] Verify plans work

### 10.5 Tasks
- [ ] View tasks
- [ ] Filter tasks
- [ ] Sort tasks
- [ ] Verify tasks work

### 10.6 Reports
- [ ] View reports
- [ ] Verify data displayed

### 10.7 Notifications
- [ ] View notifications
- [ ] Mark as read
- [ ] Verify notifications work

### 10.8 Support
- [ ] Create ticket
- [ ] View tickets
- [ ] Respond to ticket
- [ ] Verify support works

---

## REGRESSION TEST EXECUTION ORDER

1. Employee Management (1.1 - 1.5)
2. User Management (2.1 - 2.4)
3. Client Assignment (3.1 - 3.3)
4. Plan Purchase (4.1 - 4.3)
5. Task Creation (5.1 - 5.3)
6. Task Completion (6.1 - 6.3)
7. Commission Generation (7.1 - 7.4)
8. Earnings Display (8.1 - 8.3)
9. Redeem Flow (9.1 - 9.5)
10. Existing Features (10.1 - 10.8)

---

## PASS CRITERIA

**All checkboxes must be checked.**

**Any failure = regression found = must fix before deployment.**

---

## NOTES

- Test each feature with and without Employee-User linkage
- Test edge cases (empty fields, null values, etc.)
- Test error handling (invalid IDs, missing data, etc.)
- Document any bugs found
- Verify database integrity after each test

---

**END OF REGRESSION CHECKLIST**
