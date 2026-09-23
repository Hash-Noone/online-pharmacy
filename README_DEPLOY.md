# Deploying PharmaHub

## What changed from the uploaded version

- **Order IDs are now UUIDs, not sequential integers** (harder to guess/enumerate).
  This changes the `orders.id` and `order_items.order_id` column types, so
  **your existing `orders`/`order_items` tables need to be dropped and
  recreated** — same as the earlier `subtotal` column fix:
  ```sql
  DROP TABLE IF EXISTS order_items, orders CASCADE;
  ```
  Then just restart the app; `create_all()` rebuilds both tables with the
  new UUID column type.
- **Orders now carry a visible date/time and can be sorted by it**, for both
  the customer's "My Orders" page and the admin Orders tab (`?sort=newest`
  or `?sort=oldest` on `/customer/orders` and `/admin/orders`).
- **The "Create Account" button on the home page hides itself once someone
  is logged in** (customer or admin).
- **`app/database.py` wasn't in the first upload**, and `main.py` /
  `models.py` both import from it, so the app couldn't start at all. It's
  now your own file (Postgres-only via `DATABASE_URL`, `pool_pre_ping`),
  with one addition: a bare `postgres://` URL (what Render/Railway/Heroku
  hand out) is normalized to `postgresql://`, since SQLAlchemy 2.x rejects
  the old scheme outright.
- **Paystack checkout was failing because `PAYSTACK_SECRET_KEY` had no
  startup check.** If it's unset, every payment attempt 401s against
  Paystack with no clear error. It now fails loudly at startup, the same way
  a missing `JWT_SECRET_KEY` already did.
- **The Paystack callback URL used `request.base_url`,** which is unreliable
  behind most hosting providers' proxies (Render, Railway, Heroku, etc.) —
  you can end up redirecting shoppers to a broken internal URL after they
  pay. Set `PUBLIC_BASE_URL` in your `.env` to your real deployed URL and
  it's used instead.
- **Visiting the bare domain showed raw JSON** (`{"message": "Welcome to
  PharmaHub"}`) instead of the site. `/` now redirects to
  `/frontend/index.html`; the JSON welcome moved to `/api`.
- **Added CORS middleware**, off by default (same-origin deployment doesn't
  need it), enabled via `ALLOWED_ORIGINS` if you ever split frontend and API
  across two domains.
- **Dark mode** — toggle button in the nav, persisted in `localStorage`,
  respects system preference on first visit.

## One-service deployment (recommended — simplest, avoids CORS entirely)

The FastAPI app already serves the frontend itself via the `/frontend`
static mount, so frontend and API share one origin. Deploy this as a single
web service on Render, Railway, Fly.io, etc.:

1. Push this whole folder (with the structure below) to a git repo.
2. Set the environment variables from `.env.example` in your host's
   dashboard — **especially `PUBLIC_BASE_URL`**, set to the URL your host
   gives you once the first deploy is up (you may need to deploy once, copy
   the URL, then redeploy with it set).
3. Start command: use the included `Procfile`, or directly:
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"`
   The `--proxy-headers` flag matters — without it, `request.base_url`
   (used as a fallback when `PUBLIC_BASE_URL` isn't set) can report the
   wrong scheme/host behind a proxy.
4. Add a Postgres database and set `DATABASE_URL` to its connection string
   — there's no SQLite fallback, so this is required even for local dev/testing,
   not just production.
5. In your Paystack dashboard, no webhook/callback URL configuration is
   required for this integration (verification happens when the shopper's
   browser hits `/orders/{id}/payment/verify`), but do switch from your
   `sk_test_...` key to `sk_live_...` when you go live.

## Expected project structure

```
app/
  __init__.py
  main.py
  models.py
  database.py
frontend/
  index.html, medicines.html, cart.html, ... (all top-level)
  css/style.css
  js/*.js
requirements.txt
Procfile
.env          (create this from .env.example — do not commit it)
```

## If you ever split frontend and API onto different domains

- Set `ALLOWED_ORIGINS` to the frontend's origin(s).
- Every frontend JS file calls the API with relative paths like
  `fetch("/medicines")`. Those only work same-origin — you'd need to
  introduce a configurable API base URL and prefix every fetch call with it.
  Not done here since it isn't needed for the recommended single-service
  deployment.
