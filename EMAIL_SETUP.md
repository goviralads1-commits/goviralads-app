# EMAIL REMINDER SYSTEM SETUP

## Resend API Configuration

Update `.env` file with your Resend credentials:

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@goviralads.com
EMAIL_FROM_NAME=Go Viral Ads
```

**Setup Steps:**
1. Sign up at https://resend.com (free tier: 100 emails/day)
2. Verify your domain (goviralads.com)
3. Generate API key from dashboard
4. Add to your `.env` file

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

## Email Types Implemented

1. ✅ Task Deadline Reminder (Client)
2. ✅ Task Overdue Reminder (Client + Admin)
3. ✅ Plan Expiry Reminder (Client)
4. ✅ Ticket Reply Email (Admin ↔ Client)
5. ✅ Recharge Approved/Rejected (Client)
6. ✅ Task Assigned (Client)
7. ✅ New Notice (Client)

## Startup Log

When configured correctly, server logs:
```
[EMAIL SERVICE] ========================================
[EMAIL SERVICE] ✅ Resend API Configured
[EMAIL SERVICE]   From: noreply@goviralads.com
[EMAIL SERVICE]   From Name: Go Viral Ads
[EMAIL SERVICE] ========================================
```

If not configured:
```
[EMAIL SERVICE] ========================================
[EMAIL SERVICE] ❌ Resend NOT Configured - emails disabled
[EMAIL SERVICE] ========================================
```
