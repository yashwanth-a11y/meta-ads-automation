# Authentication API — frontend integration guide

This document is the contract for the **signup** and **login** endpoints. If you're building the frontend, everything you need to wire up the auth flow is here.

---

## 1. Quick facts

- **Base URL (local dev):** `http://localhost:4000`
- **Auth model:** stateless **JWT** (JSON Web Token), 7-day expiry. No refresh token yet.
- **CORS:** the backend allows requests from `http://localhost:5173` by default. If your dev server runs elsewhere, change `CORS_ORIGINS` in `backend/.env`.
- **All request and response bodies are JSON.** Always send `content-type: application/json`.
- **There is no email or phone verification.** A user signs up and is logged in immediately.
- **There is no organization / workspace concept** in the UI. Every user owns their own data; the backend uses `organization_id = user.id` internally.

---

## 2. The two endpoints

### 2.1 `POST /api/v1/auth/signup`

Creates a new user account and returns a JWT.

**Request body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `first_name` | string | yes | 1–100 chars |
| `last_name` | string | yes | 1–100 chars |
| `email` | string | yes | valid email format, max 255 chars, case-insensitive uniqueness |
| `phone` | string | yes | **E.164 format**: starts with `+`, then country code, then number, no spaces. Example: `+14155552671`, `+919866352390` |
| `password` | string | yes | min 8 chars, must contain at least one **letter** AND one **digit** |
| `confirm_password` | string | yes | must equal `password` |

**Example request**

```http
POST /api/v1/auth/signup
content-type: application/json

{
  "first_name": "Alice",
  "last_name": "Tester",
  "email": "alice@example.com",
  "phone": "+14155552671",
  "password": "Pa55word!",
  "confirm_password": "Pa55word!"
}
```

**Success response — `201 Created`**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "035adede-9166-4067-9eaa-da30deea040b",
      "first_name": "Alice",
      "last_name": "Tester",
      "email": "alice@example.com",
      "phone": "+14155552671",
      "last_login_at": null,
      "created_at": "2026-05-02T08:01:06.168Z",
      "updated_at": "2026-05-02T08:01:06.168Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

The `password_hash` is **never** returned. Store the `token` and treat the user as logged in.

---

### 2.2 `POST /api/v1/auth/login`

Exchanges email + password for a JWT.

**Request body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `email` | string | yes | valid email format |
| `password` | string | yes | non-empty |

**Example request**

```http
POST /api/v1/auth/login
content-type: application/json

{
  "email": "alice@example.com",
  "password": "Pa55word!"
}
```

**Success response — `200 OK`**

Same shape as signup:

```json
{
  "success": true,
  "data": {
    "user": { "...same fields as signup..." },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

`last_login_at` will be the current server time on a successful login.

---

### 2.3 Other auth endpoints (also available)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/auth/me` | Echoes the current user (decoded from the JWT). Use it on app boot to check whether the stored token is still valid. Requires `Authorization: Bearer <token>`. |
| `POST` | `/api/v1/auth/logout` | Returns 200. JWTs are stateless, so server has nothing to do — the frontend just deletes the token from storage. |
| `POST` | `/api/v1/auth/refresh` | Returns `501 NOT_IMPLEMENTED`. Refresh-token flow is not built yet; users will be logged out automatically after 7 days. |

---

## 3. Using the JWT

After signup or login, attach the token to every protected request:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

Required for **everything** under `/api/v1/ads/*` and `/api/v1/auth/me`. Public endpoints (signup, login, logout, /health) don't need it.

If the token is expired or missing, the endpoint returns `401 UNAUTHORIZED`. The frontend should:
1. Delete the stored token.
2. Redirect to the login page.

---

## 4. Where to store the token (frontend)

**For now: `localStorage`.** Simple, works across page reloads.

```ts
// after a successful signup or login
localStorage.setItem('growthos.token', data.token);
localStorage.setItem('growthos.user', JSON.stringify(data.user));

// on logout
localStorage.removeItem('growthos.token');
localStorage.removeItem('growthos.user');

// on every API call
const token = localStorage.getItem('growthos.token');
fetch(url, { headers: { authorization: `Bearer ${token}` } });

// on app boot — verify token still valid
const r = await fetch('http://localhost:4000/api/v1/auth/me', {
  headers: { authorization: `Bearer ${token}` }
});
if (!r.ok) {
  localStorage.removeItem('growthos.token');
  // redirect to /login
}
```

> **Trade-off:** `localStorage` is readable by any JavaScript on the page, so it's vulnerable if the app has an XSS bug. For production, switch to an httpOnly cookie + `/auth/me` boot check. We can change this later without touching the API.

---

## 5. Error responses — the full catalog

Every error response has this shape:

```json
{
  "error": {
    "code": "EMAIL_TAKEN",
    "message": "An account with this email already exists",
    "details": [ /* sometimes — e.g., schema validation issues */ ]
  }
}
```

Map the `error.code` to a UX message. Always prefer the `code` over `message` text — messages may evolve.

### Signup errors

| HTTP | `error.code` | When it happens | What to show the user |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | Schema-level rejection (missing field, malformed email, password < 8 chars at the schema level, etc.). `details` lists the offending field via `instancePath`. | Highlight the offending field. Use the `details` array to know which one. |
| `400` | `WEAK_PASSWORD` | Password lacks a letter or a digit. | "Password must contain at least one letter and one digit." Highlight the password field. |
| `400` | `PASSWORD_MISMATCH` | `password !== confirm_password`. | Inline error on the **confirm password** field: "Passwords do not match." |
| `400` | `INVALID_PHONE` | Phone is not in E.164 format. | "Use international format with country code, e.g., `+14155552671`." Highlight the phone field. |
| `409` | `EMAIL_TAKEN` | An account already exists with this email (case-insensitive). | "An account already exists with this email. [Log in instead?]" with a link to /login. |
| `429` | (no code) | Rate limit hit (10 signups per minute per IP). | "Too many requests. Please wait a minute and try again." |

### Login errors

| HTTP | `error.code` | When it happens | What to show the user |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | Missing email or password, or malformed email. | Highlight the offending field. |
| `401` | `INVALID_CREDENTIALS` | Email is unknown **or** password is wrong. **Both cases return the same response on purpose** — so attackers can't probe whether an email is registered. | "Invalid email or password." Show on the form, not next to a specific field. |
| `429` | (no code) | Rate limit hit (5 login attempts per minute per IP). | "Too many login attempts. Please wait a minute and try again." |

### Auth-required endpoint errors (e.g., `/me`, `/api/v1/ads/*`)

| HTTP | `error.code` | When it happens | What to do |
|---|---|---|---|
| `401` | `UNAUTHORIZED` | Token missing, malformed, or expired. | Delete stored token, redirect to /login. |
| `403` | `FORBIDDEN` | User is logged in but lacks permission for this resource. | Show "You don't have access to this." (Not used yet — there's only one role.) |

---

## 6. Field validation rules — implement these in the form too

Mirror these client-side so the user sees errors before submitting:

| Field | Rule | Example error message |
|---|---|---|
| `first_name`, `last_name` | non-empty, ≤ 100 chars | "Required" |
| `email` | matches a basic email regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), ≤ 255 chars | "Enter a valid email" |
| `phone` | matches `^\+[1-9]\d{1,14}$` (E.164) | "Use format like +14155552671" |
| `password` | length ≥ 8, contains at least one letter and one digit | "At least 8 characters, with a letter and a digit" |
| `confirm_password` | equals `password` | "Passwords do not match" |

The backend re-validates everything — client-side validation is just for UX. **Never trust the client.**

---

## 7. Reference implementation

### Plain `fetch`

```ts
const API = 'http://localhost:4000';

export async function signup(payload: {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  confirm_password: string;
}) {
  const r = await fetch(`${API}/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await r.json();
  if (!r.ok) throw json.error;            // { code, message, details? }
  return json.data;                        // { user, token }
}

export async function login(email: string, password: string) {
  const r = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await r.json();
  if (!r.ok) throw json.error;
  return json.data;
}

export async function authedGet(path: string) {
  const token = localStorage.getItem('growthos.token');
  const r = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (r.status === 401) {
    localStorage.removeItem('growthos.token');
    window.location.href = '/login';
    return;
  }
  const json = await r.json();
  if (!r.ok) throw json.error;
  return json.data;
}
```

### React form glue (sketch)

```tsx
import { useState } from 'react';
import { signup } from './lib/api';

export function SignupForm() {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    password: '', confirm_password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const { user, token } = await signup(form);
      localStorage.setItem('growthos.token', token);
      localStorage.setItem('growthos.user', JSON.stringify(user));
      // navigate to dashboard
    } catch (err: any) {
      // err is { code, message, details? }
      switch (err.code) {
        case 'EMAIL_TAKEN':       setErrors({ email: 'Already registered. Log in instead.' }); break;
        case 'PASSWORD_MISMATCH': setErrors({ confirm_password: 'Passwords do not match' }); break;
        case 'WEAK_PASSWORD':     setErrors({ password: err.message }); break;
        case 'INVALID_PHONE':     setErrors({ phone: 'Use format +14155552671' }); break;
        case 'VALIDATION_ERROR': {
          const fieldErrors: Record<string, string> = {};
          for (const d of err.details ?? []) {
            const field = d.instancePath?.replace(/^\//, '');
            if (field) fieldErrors[field] = d.message;
          }
          setErrors(fieldErrors);
          break;
        }
        default:
          setErrors({ form: err.message ?? 'Something went wrong' });
      }
    } finally {
      setBusy(false);
    }
  }

  // ... render form fields, show errors[field] under each input
}
```

---

## 8. End-to-end test you can paste into the browser console

```js
// Run while the API is up at http://localhost:4000
const r1 = await fetch('http://localhost:4000/api/v1/auth/signup', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    first_name: 'Test', last_name: 'User',
    email: `test+${Date.now()}@example.com`,
    phone: '+14155552671',
    password: 'Pa55word!', confirm_password: 'Pa55word!',
  }),
});
const data = (await r1.json()).data;
console.log('signup', data);

const r2 = await fetch('http://localhost:4000/api/v1/auth/me', {
  headers: { authorization: `Bearer ${data.token}` },
});
console.log('me', await r2.json());
```

Expected: a `user` + `token` from signup, and `/me` echoes the JWT payload (`id`, `email`, `role`, etc.).

---

## 9. Changelog

| Date | Change |
|---|---|
| 2026-05-02 | Initial release: signup, login, logout, me; rate-limit on signup (10/min) and login (5/min); E.164 phone, password ≥ 8 with letter+digit, case-insensitive email uniqueness. |
