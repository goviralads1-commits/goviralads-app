# ROLE & COMMISSION SYSTEM TEST

## Test with Postman or curl

### 1. Login as Admin
```bash
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "identifier": "admin@example.com",
  "password": "admin123"
}
```

Save the `token` from response.

---

## ROLE MANAGEMENT TESTS

### 2. Create Custom Role - "Manager"
```bash
POST http://localhost:3000/admin/roles
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "MANAGER",
  "displayName": "Manager",
  "permissions": {
    "viewClients": "FULL",
    "createTasks": "FULL",
    "editTasks": "FULL",
    "manageWallet": "PARTIAL",
    "sendNotices": "FULL",
    "replyTickets": "FULL",
    "viewReports": "PARTIAL",
    "manageUsers": "NONE"
  }
}
```

### 3. Create Custom Role - "Support"
```bash
POST http://localhost:3000/admin/roles
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "SUPPORT",
  "displayName": "Support Agent",
  "permissions": {
    "viewClients": "PARTIAL",
    "createTasks": "NONE",
    "editTasks": "NONE",
    "manageWallet": "NONE",
    "sendNotices": "PARTIAL",
    "replyTickets": "FULL",
    "viewReports": "NONE",
    "manageUsers": "NONE"
  }
}
```

### 4. Get All Roles
```bash
GET http://localhost:3000/admin/roles
Authorization: Bearer <admin-token>
```

### 5. Update Role
```bash
PATCH http://localhost:3000/admin/roles/<roleId>
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "displayName": "Senior Manager",
  "permissions": {
    "viewClients": "FULL",
    "createTasks": "FULL",
    "editTasks": "FULL",
    "manageWallet": "FULL",
    "sendNotices": "FULL",
    "replyTickets": "FULL",
    "viewReports": "FULL",
    "manageUsers": "PARTIAL"
  }
}
```

### 6. Assign Role to User
```bash
POST http://localhost:3000/admin/users/<userId>/assign-role
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "roleId": "<roleId>"
}
```

---

## CLIENT-MANAGER ASSIGNMENT TESTS

### 7. Assign Managers to Client
```bash
POST http://localhost:3000/admin/clients/<clientId>/assign-managers
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "managerIds": ["<managerId1>", "<managerId2>"]
}
```

### 8. Get Client's Managers
```bash
GET http://localhost:3000/admin/clients/<clientId>/managers
Authorization: Bearer <admin-token>
```

---

## COMMISSION SETTINGS TESTS

### 9. Set Commission on Client
```bash
PATCH http://localhost:3000/admin/clients/<clientId>/commission
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "enabled": true,
  "percentage": 10,
  "recipients": [
    {
      "managerId": "<managerId1>",
      "share": 60
    },
    {
      "managerId": "<managerId2>",
      "share": 40
    }
  ]
}
```

### 10. Set Commission on Task
```bash
PATCH http://localhost:3000/admin/tasks/<taskId>/commission
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "enabled": true,
  "percentage": 5,
  "recipients": [
    {
      "managerId": "<managerId1>",
      "share": 100
    }
  ]
}
```

---

## VERIFICATION CHECKLIST

✅ **Role Creation Works:**
- POST /admin/roles creates new role
- Permissions stored correctly

✅ **Permissions Enforced:**
- Role permissions saved with NONE/PARTIAL/FULL
- requirePermission middleware ready for enforcement

✅ **Client-Manager Assignment Works:**
- POST /admin/clients/:clientId/assign-managers saves manager IDs
- GET /admin/clients/:clientId/managers returns assigned managers

✅ **Commission % Saves Correctly:**
- Client commission settings stored
- Task commission settings stored
- Percentage validated (0-100)
- Recipients with share % saved
