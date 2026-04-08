# HelloFutsal Auth API

NestJS authentication starter for a multivendor futsal platform.

## What is included

- Separate tables for regular users and ground-owner/admin accounts
- JWT login and registration for both account types
- PostgreSQL database wiring through TypeORM
- Validation and password hashing

## Setup

1. Copy `.env.example` to `.env` and set your own `JWT_SECRET`.
2. Install dependencies.
3. Run the app in development mode.

```bash
npm install
npm run start:dev
```

## Migrations

The app runs pending TypeORM migrations on startup. When you change an entity, generate a new migration and commit it with the code change.

```bash
npm run migration:generate -- src/migrations/YourMigrationName
npm run migration:run
```

The generate command should point to a new file name for each schema change.

## Docker

Run the app and database together with Docker Compose:

```bash
docker compose up --build
```

PostgreSQL will be available on host port `0001`, mapped to container port `5432`.

The API will be available on host port `1111`.

The app loads secrets from `.env`, waits for Postgres to become healthy, then runs pending migrations before starting.

## Available endpoints

- `POST /auth/users/request-otp`
- `POST /auth/users/register` (legacy alias of `POST /auth/users/request-otp`)
- `POST /auth/users/verify-otp`
- `POST /auth/users/login`
- `POST /auth/admins/request-otp`
- `POST /auth/admins/register` (legacy alias of `POST /auth/admins/request-otp`)
- `POST /auth/admins/verify-otp`
- `POST /auth/admins/login`
- `GET /auth/me`

## User signup OTP flow

1. Call `POST /auth/users/request-otp` with `username`, `password`, and either `email` or `mobileNumber`.
2. OTP is stored hashed in the database and delivered through your email/SMS integration later.
3. Call `POST /auth/users/verify-otp` with the same identifier and the OTP.
4. The account is created only after OTP verification.

## Current onboarding note

- `POST /auth/admins/request-otp` requires `username`, `email`, and `password` (also accepts legacy `ownerName`).
- `groundName` will be captured in a later onboarding phase.
- `POST /auth/users/login` accepts `email`, `mobileNumber`, or `username` with `password`.
- OTP values are not returned in API responses or logged in plain text.
- OTP values are stored in the OTP request table as both `raw_otp` and `otp_hash`.

## Admin signup OTP flow

1. Call `POST /auth/admins/request-otp` with `username`, `email`, and `password`.
2. OTP is stored hashed in the database and delivered through your email integration later.
3. Call `POST /auth/admins/verify-otp` with the same email and OTP.
4. The admin account is created only after OTP verification.

## Notes

- `synchronize` is disabled (`DB_SYNCHRONIZE=false`) for local and Docker environments.
- Use migrations for all schema changes.
# HelloFutsal
