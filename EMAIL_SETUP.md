# EMAIL REMINDER SYSTEM SETUP

## SMTP Configuration Required

Update `.env` file with your SMTP credentials:

### Option 1: Gmail
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=your-email@gmail.com
SMTP_FROM_NAME=TaskFlow Pro
```

**Gmail App Password:**
1. Go to Google Account settings
2. Enable 2-factor authentication
3. Generate app-specific password
4. Use that password in SMTP_PASS

### Option 2: Brevo (Free)
```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-brevo-email
SMTP_PASS=your-brevo-api-key
SMTP_FROM=your-verified-sender@domain.com
SMTP_FROM_NAME=TaskFlow Pro
```

## Testing Reminders

### Manual Trigger (via API):

**1. Test Deadline Reminder:**
```bash
POST http://localhost:3000/admin/email-reminder-settings/trigger
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "type": "deadline"
}
```

**2. Test Overdue Reminder:**
```bash
POST http://localhost:3000/admin/email-reminder-settings/trigger
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "type": "overdue"
}
```

**3. Test Plan Expiry Reminder:**
```bash
POST http://localhost:3000/admin/email-reminder-settings/trigger
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "type": "expiry"
}
```

### Get Current Settings:
```bash
GET http://localhost:3000/admin/email-reminder-settings
Authorization: Bearer <admin-token>
```

### Update Settings:
```bash
PATCH http://localhost:3000/admin/email-reminder-settings
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "taskDeadline": {
    "enabled": true,
    "daysBefore": 3,
    "message": "Your custom message"
  },
  "taskOverdue": {
    "enabled": true,
    "message": "Overdue message"
  },
  "planExpiry": {
    "enabled": true,
    "daysBefore": 7,
    "message": "Plan expiring message"
  }
}
```

## Automatic Schedule

- **Task Deadline Reminder:** Daily at 9:00 AM
- **Task Overdue Reminder:** Daily at 10:00 AM  
- **Plan Expiry Reminder:** Daily at 8:00 AM

## 4 Email Types Implemented

1. ✅ Task Deadline Reminder (Client)
2. ✅ Task Overdue Reminder (Client + Admin)
3. ✅ Plan Expiry Reminder (Client)
4. ✅ Ticket Reply Email (Admin ↔ Client)
