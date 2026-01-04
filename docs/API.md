# API Reference

Base URL: `https://us-central1-hasod-41a23.cloudfunctions.net/api`

## Authentication

Most endpoints require Firebase Authentication. Include the ID token in requests:

```javascript
const token = await firebase.auth().currentUser.getIdToken();
fetch(url, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

Admin endpoints additionally check email against whitelist.

## Services

### GET /services
Get all active services.

**Response:**
```json
[
  {
    "id": "music-library",
    "name": "Music Library Access",
    "nameHe": "גישה לספריית המוזיקה",
    "pricePerMonth": 10,
    "currency": "USD",
    "features": ["Unlimited streaming", "Download access"],
    "active": true
  }
]
```

### GET /services/:serviceId
Get specific service details.

## Subscriptions

### POST /create-subscription
Create PayPal subscription for a service.

**Request:**
```json
{
  "uid": "user123",
  "serviceId": "music-library"
}
```

**Response:**
```json
{
  "approvalUrl": "https://paypal.com/...",
  "subscription": { "id": "I-ABC123", ...}
}
```

### POST /activate-subscription
Activate subscription after PayPal approval.

**Request:**
```json
{
  "uid": "user123",
  "subscriptionId": "I-ABC123",
  "serviceId": "music-library"
}
```

### POST /paypal-webhook
Receive PayPal webhook events (called by PayPal).

## Admin

### POST /admin/services
Create or update service (admin only).

**Request:**
```json
{
  "service": {
    "id": "new-service",
    "name": "Service Name",
    "pricePerMonth": 15,
    ...
  }
}
```

### POST /admin/manual-payment
Process manual payment (admin only).

**Request:**
```json
{
  "userEmail": "user@example.com",
  "serviceId": "music-library",
  "amount": 100,
  "durationMonths": 3,
  "paymentMethod": "cash",
  "processedByUid": "admin123",
  "processedByEmail": "admin@example.com"
}
```

### POST /admin/cancel-subscription
Cancel user subscription (admin only).

**Request:**
```json
{
  "uid": "user123",
  "serviceId": "music-library"
}
```

### POST /admin/manage-group
Add/remove user from Google Group (admin only).

**Request:**
```json
{
  "uid": "user123",
  "serviceId": "music-library",
  "action": "add"
}
```

## Error Responses

All errors follow this format:
```json
{
  "error": "Error message",
  "detail": "Technical details (dev only)"
}
```

**Status Codes:**
- `200` - Success
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## Rate Limits

Currently no rate limiting (to be implemented).

---

For detailed implementation, see [ARCHITECTURE.md](./ARCHITECTURE.md) and [.github/claude.md](./.github/claude.md).
