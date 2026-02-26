# Bitespeed Identity Reconciliation Service

A web service that identifies and links customer contacts across multiple purchases, even when different email addresses and phone numbers are used.

## Submission Details

- **GitHub Repository**: `https://github.com/ph03iA/BiteSpeed-Backend-Assignment-.git`
- **Hosted Base URL**: `https://bitespeed-identity-quee.onrender.com`
- **Identify Endpoint**: `POST https://bitespeed-identity-quee.onrender.com/identify`

### Assignment Checklist

1. [x] Code published to GitHub.
2. [x] Work committed in small, meaningful commits.
3. [x] `/identify` endpoint implemented and exposed.
4. [x] Application hosted online (Render) and endpoint shared above.
5. [x] API accepts JSON request body (not form-data).
6. [x] Task ready for submission.

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **ORM**: Prisma
- **Database**: PostgreSQL (hosted on Neon)

## Setup

### Prerequisites

- Node.js (v18+)
- PostgreSQL database

### Installation

```bash
git clone https://github.com/ph03iA/BiteSpeed-Backend-Assignment-.git
cd BiteSpeed-Backend-Assignment-
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

Set your PostgreSQL connection string:

```
DATABASE_URL="postgresql://user:password@localhost:5432/bitespeed?schema=public"
PORT=3000
```

### Database Setup

Run migrations to create the `Contact` table:

```bash
npx prisma generate
npx prisma db push
```

### Running the Server

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## API

### `POST /identify`

Identifies and reconciles a customer's contact information.

**Request Body:**

```json
{
  "email": "doc@hillvalley.edu",
  "phoneNumber": "123456"
}
```

At least one of `email` or `phoneNumber` must be provided.

> Important: send payload as raw JSON (`Content-Type: application/json`), not `form-data`.

**Response (200 OK):**

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["doc@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

### `GET /health`

Health check endpoint. Returns `{ "status": "ok" }`.

## Testing Screenshots

### Test 1: New Customer — Creates Primary Contact

A brand new request with no matching contacts creates a primary contact.

![Test 1 - New Primary Contact](screenshots/test1-new-primary.png)

### Test 2: Existing Phone, New Email — Creates Secondary Contact

Same phone number but a different email links them together. A secondary contact is created under the original primary.

![Test 2 - Secondary Contact Created](screenshots/test2-secondary-created.png)

### Test 3: Two Primaries Merged

Two previously unrelated primary contacts are linked when a request contains an email from one and a phone from the other. The newer primary is demoted to secondary.

![Test 3 - Primary Contacts Merged](screenshots/test3-primary-merge.png)

## How It Works

The service maintains a `Contact` table where rows are linked together:

- The **oldest** contact in a linked group is the **primary**.
- All others are **secondary**, pointing to the primary via `linkedId`.

### Reconciliation Logic

1. **No match found**: A new primary contact is created.
2. **Match found with new info**: A new secondary contact is created, linked to the existing primary.
3. **Two separate primaries matched**: The newer primary is demoted to secondary under the older one, and all its children are re-parented.

## Database Schema

```
Contact
├── id             Int (PK, auto-increment)
├── phoneNumber    String?
├── email          String?
├── linkedId       Int? (FK → Contact.id)
├── linkPrecedence "primary" | "secondary"
├── createdAt      DateTime
├── updatedAt      DateTime
└── deletedAt      DateTime?
```
