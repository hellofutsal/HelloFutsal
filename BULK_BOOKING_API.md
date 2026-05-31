# Bulk Book Slots API

## Overview

This API endpoint allows ground owners to bulk book multiple available slots for a field within a specific date and time range. It automatically skips already booked slots and books all remaining available slots for a single user in one transaction.

## Endpoint

```
POST /bookings/bulk/time-range
```

## Authentication

- **Required**: JWT Token (Bearer)
- **Role**: Admin (Ground Owner)

## Request Body

```json
{
  "fieldId": "550e8400-e29b-41d4-a716-446655440000",
  "startDate": "2026-05-10",
  "endDate": "2026-05-15",
  "startTime": "18:00",
  "endTime": "19:30",
  "userName": "John Doe",
  "phoneNumber": "+977-9841234567"
}
```

### Parameters

| Parameter     | Type   | Required | Description                               | Format                        |
| ------------- | ------ | -------- | ----------------------------------------- | ----------------------------- |
| `fieldId`     | UUID   | Yes      | The ID of the field to book slots for     | Valid UUID v4                 |
| `startDate`   | String | Yes      | Start date of the booking range           | YYYY-MM-DD                    |
| `endDate`     | String | Yes      | End date of the booking range (inclusive) | YYYY-MM-DD                    |
| `startTime`   | String | Yes      | Start time of slots to book               | HH:mm (24-hour)               |
| `endTime`     | String | Yes      | End time of slots to book                 | HH:mm (24-hour)               |
| `userName`    | String | Yes      | Name of the user booking the slots        | 2-120 characters              |
| `phoneNumber` | String | Yes      | Phone number of the user                  | 7-15 digits, may start with + |

## Response

### Success Response (200 OK)

```json
{
  "summary": {
    "total": 5,
    "booked": 4,
    "failed": 1
  },
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "John Doe",
    "mobileNumber": "+977-9841234567"
  },
  "bookedSlots": [
    {
      "booking": {
        "id": "550e8400-e29b-41d4-a716-446655440010",
        "fieldId": "550e8400-e29b-41d4-a716-446655440000",
        "slotId": "550e8400-e29b-41d4-a716-446655440011",
        "userId": "550e8400-e29b-41d4-a716-446655440001",
        "status": "booked",
        "bookingType": "normal",
        "baseAmount": "1500.00",
        "totalAmount": "1500.00"
      },
      "slot": {
        "id": "550e8400-e29b-41d4-a716-446655440011",
        "fieldId": "550e8400-e29b-41d4-a716-446655440000",
        "slotDate": "2026-05-10",
        "startTime": "18:00",
        "endTime": "19:30",
        "slotType": "normal",
        "status": "booked",
        "price": "1500.00"
      }
    }
  ],
  "failedBookings": [
    {
      "slotDate": "2026-05-12",
      "startTime": "18:00",
      "endTime": "19:30",
      "error": "Slot not found"
    }
  ]
}
```

### Error Responses

**401 Unauthorized**

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**403 Forbidden** (Non-admin user)

```json
{
  "statusCode": 403,
  "message": "Only admins can create bookings"
}
```

**404 Not Found** (Field doesn't exist or doesn't belong to user)

```json
{
  "statusCode": 404,
  "message": "Field not found"
}
```

**400 Bad Request** (Invalid input)

```json
{
  "statusCode": 400,
  "message": "Bad Request",
  "error": [
    {
      "field": "fieldId",
      "message": "fieldId must be a valid UUID"
    },
    {
      "field": "startTime",
      "message": "startTime must be in HH:mm format"
    }
  ]
}
```

**409 Conflict** (User with phone number already exists)

```json
{
  "statusCode": 409,
  "message": "User with this phone number already exists"
}
```

## How It Works

1. **Validates** the authenticated user is an admin
2. **Verifies** the field exists and belongs to the admin
3. **Finds or creates** the user with the provided phone number
4. **Queries** all available slots matching:
   - The specified field ID
   - Date range (startDate to endDate, inclusive)
   - Exact time range (startTime to endTime)
   - Status = "available" (skips already booked slots)
5. **Books** each available slot:
   - Creates a booking record
   - Updates slot status to "booked"
   - Checks for matching membership plans and applies if found
6. **Returns** a summary with:
   - Total slots found in the range
   - Number of successfully booked slots
   - Number of failed bookings with error details

## Key Features

✅ **Automatic slot filtering** - Ignores already booked slots  
✅ **User management** - Creates new users or uses existing ones  
✅ **Membership support** - Automatically applies active membership pricing if available  
✅ **Transaction safety** - All bookings are atomic (all succeed or all fail)  
✅ **Detailed response** - Shows booked slots and failures with reasons  
✅ **Validation** - Validates all inputs with helpful error messages

## Example Usage (cURL)

```bash
curl -X POST http://localhost:3000/bookings/bulk/time-range \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-jwt-token" \
  -d '{
    "fieldId": "550e8400-e29b-41d4-a716-446655440000",
    "startDate": "2026-05-10",
    "endDate": "2026-05-15",
    "startTime": "18:00",
    "endTime": "19:30",
    "userName": "John Doe",
    "phoneNumber": "+977-9841234567"
  }'
```

## Example Usage (JavaScript/TypeScript)

```typescript
const response = await fetch("http://localhost:3000/bookings/bulk/time-range", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  },
  body: JSON.stringify({
    fieldId: "550e8400-e29b-41d4-a716-446655440000",
    startDate: "2026-05-10",
    endDate: "2026-05-15",
    startTime: "18:00",
    endTime: "19:30",
    userName: "John Doe",
    phoneNumber: "+977-9841234567",
  }),
});

const result = await response.json();
console.log(`Successfully booked ${result.summary.booked} slots`);
```

## Notes

- The API uses **pessimistic locking** to prevent race conditions during booking
- All operations occur within a **database transaction** for data consistency
- If a user with the phone number already exists, it will be reused
- Membership pricing is automatically applied if an active membership plan covers the time slot
- The API processes slots sequentially; if one booking fails, others continue
