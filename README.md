# ShopNova

ShopNova is a React + Vite storefront with an Express API and MongoDB Atlas. The API provides the product catalog, user registration and sign-in, persistent sessions, and demo orders. The catalog starts with 20 sample products.

## Requirements

- Node.js 20.19 or later
- npm
- A MongoDB Atlas cluster and database user

## Run locally

```powershell
npm install
$env:MONGODB_URI = "mongodb+srv://<database-user>:<password>@<cluster-host>/?retryWrites=true&w=majority"
$env:MONGODB_DB = "shopnova"
npm run dev
```

Replace the placeholder URI with your Atlas connection string in your local PowerShell window; do not commit it or share it in chat. In Atlas, allow your development machine's IP in Network Access and create a database user with permissions for the `shopnova` database. Open the Vite URL (usually http://localhost:5173). The development server proxies `/api` requests to the backend on port 3001. The backend creates indexes and seeds the 20 sample products at startup.

The first page is sign-in. Users must sign in or create an account before the storefront opens; the login password field is retained for secure account authentication. Signing out returns to the sign-in page.

If characters in your database username or password are reserved in a URI (for example `@`, `:`, `/`, or `#`), percent-encode them in the connection string. Atlas provides a driver connection string under **Connect → Drivers**.

## Admin dashboard

Configure an initial admin account in PowerShell before starting the app:

```powershell
$env:MONGODB_URI = "mongodb+srv://<database-user>:<password>@<cluster-host>/?retryWrites=true&w=majority"
$env:MONGODB_DB = "shopnova"
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PASSWORD = "Use-a-private-password-with-12-or-more-characters"
npm run dev
```

Sign in with that account, then select **Admin** in the header. The dashboard shows registered customer accounts, members who signed in during the last 30 days, and the total demo orders. It lists customer emails and signup/last-sign-in dates; it never exposes password hashes. Admin credentials are not committed to the project. Configure environment variables using your hosting provider's secret settings in production.

If `ADMIN_EMAIL` already belongs to a registered user, startup grants that account admin access and keeps its existing password. Otherwise, startup creates the admin account using the configured email and password. With neither variable configured, no admin account is created.

The app stores records in the MongoDB `shopnova` database, in the `users`, `sessions`, `products`, and `orders` collections. You can inspect them in MongoDB Atlas Data Explorer. Passwords are salted hashes, not recoverable passwords. The dashboard's active-member count reflects sign-ins, not anonymous visitors; there is no visitor analytics. Demo orders are not associated with individual accounts.

To reset an existing admin password, stop the app with Ctrl+C, set `MONGODB_URI` (and `MONGODB_DB` if needed) in PowerShell, then run `npm run admin:reset-password`. Enter the admin email and a new password of 12–128 characters when prompted; password input is hidden. Existing sessions are signed out. Do not put passwords in source files or command arguments.

To run only one side, use `npm run dev:web` for the Vite frontend or `npm run dev:api` for the backend.

## API

- `GET /api/health` — backend health check
- `GET /api/products` — products available in the catalog
- `POST /api/auth/register` — create an account with an email and password (minimum 8 characters)
- `POST /api/auth/login` — sign in and receive an HTTP-only session cookie
- `GET /api/auth/me` — check the current sign-in session
- `POST /api/auth/logout` — end the current session
- `GET /api/admin/dashboard` — admin-only member activity and demo order totals
- `POST /api/orders` — saves a demo order from `{ "items": [{ "id": 1, "qty": 2 }] }`

Passwords are stored as salted scrypt hashes; session tokens are random, stored as hashes, and expire after seven days. Login and registration requests are rate-limited. Order totals are calculated from the database, not client-submitted prices. Demo orders do not collect payment or customer details.

## Production build

```powershell
npm run build
npm start
```

The Express server serves the built frontend from `dist` and the API from `/api`. Configure `MONGODB_URI`, optionally set `MONGODB_DB` (defaults to `shopnova`), and set `PORT` if needed. Keep secrets in the host's environment/secret settings.

The previous SQLite file, if present, is left untouched; this change starts a fresh MongoDB catalog and does not migrate old users or orders. This learning/demo project does not include inventory management, payment processing, or production order fulfillment.
