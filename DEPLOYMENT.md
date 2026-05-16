# POSx Suite — Deployment Guide

> **Build verified:** 2026-05-14 · Main bundle **291.69 kB gzip** · Build time ~22 s

The app has two deployable units:

| Unit | Stack | Build output |
|------|-------|--------------|
| **Frontend** | React 18 + Tailwind (CRACO) | `frontend/build/` (static files) |
| **Backend** | FastAPI + Motor (async MongoDB) | Python ASGI app |
| **Database** | MongoDB | Atlas free tier (M0) recommended |

Three supported deployment targets:

| Target | Best for | Cost |
|--------|----------|------|
| **Render** | Full-stack, easiest setup | Free tier available |
| **Vercel** (frontend) + **Render** (backend) | Fastest CDN for frontend | Free tiers |
| **cPanel** | Existing shared hosting | Depends on host |

---

## 0. Prerequisites

### A. MongoDB Atlas (required for all targets)
1. Create a free cluster at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas/register).
2. Under **Network Access** → add `0.0.0.0/0` (allow all, or lock to your server IPs later).
3. Under **Database Access** → create a user with read/write access.
4. Copy your connection string: `mongodb+srv://USER:PASSWORD@cluster.mongodb.net/?retryWrites=true&w=majority`

### B. Environment variables

**Backend** (`backend/.env` locally, or set in hosting dashboard):
```
MONGO_URL=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/?retryWrites=true&w=majority
DB_NAME=posx_suite
JWT_SECRET=replace-with-64-chars-of-random-text
CORS_ORIGINS=https://your-frontend-domain.com
```

**Frontend** (`frontend/.env.production` locally before building):
```
REACT_APP_BACKEND_URL=https://your-backend-domain.com
```

> If `REACT_APP_BACKEND_URL` is not set, the frontend falls back to `http://localhost:8000`.

---

## 1. Deploy to Render (Recommended — Easiest)

### 1.1 Backend (Web Service)

1. Push repo to GitHub.
2. On [Render](https://render.com) → **New → Web Service** → connect repo.
3. Set:
   - **Root Directory:** `backend`
   - **Environment:** `Python 3.11`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn server:app --host 0.0.0.0 --port $PORT`
4. Under **Environment** tab, add:
   ```
   MONGO_URL=...
   DB_NAME=posx_suite
   JWT_SECRET=...
   CORS_ORIGINS=https://your-frontend-render-url.onrender.com
   ```
5. Click **Deploy** → note your URL, e.g. `https://posx-backend.onrender.com`.

### 1.2 Frontend (Static Site)

1. On Render → **New → Static Site** → connect same repo.
2. Set:
   - **Root Directory:** `frontend`
   - **Build Command:** `yarn install && yarn build`
   - **Publish Directory:** `build`
3. Under **Environment** tab, add:
   ```
   REACT_APP_BACKEND_URL=https://posx-backend.onrender.com
   ```
4. The `frontend/public/_redirects` file (already in this repo) handles SPA routing automatically — **no extra rewrite rules needed**.
5. Click **Deploy**.

### 1.3 Update CORS
After the frontend deploys, update `CORS_ORIGINS` on the backend to match your frontend URL and redeploy backend.

---

## 2. Deploy to Vercel (Frontend) + Render (Backend)

### 2.1 Backend on Render
Follow **Section 1.1** above.

### 2.2 Frontend on Vercel

1. On [Vercel](https://vercel.com) → **Add New → Project** → import repo.
2. Set:
   - **Root Directory:** `frontend`
   - **Framework Preset:** `Create React App`
   - **Build Command:** `yarn build`
   - **Output Directory:** `build`
3. Under **Environment Variables**, add:
   ```
   REACT_APP_BACKEND_URL=https://posx-backend.onrender.com
   ```
4. The `frontend/vercel.json` (already in this repo) handles SPA routing:
   ```json
   {
     "rewrites": [{ "source": "/(.*)", "destination": "/" }]
   }
   ```
5. Click **Deploy**.

> **Tip:** Vercel auto-deploys on every push to `main`. Set up a preview environment variable for non-production branches.

---

## 3. Deploy to cPanel (Shared Hosting)

Most shared hosts only support Python via **Passenger/WSGI** and don't host MongoDB. Architecture:

- **Database** → MongoDB Atlas (free tier)
- **Backend** → cPanel "Setup Python App" (Passenger WSGI)
- **Frontend** → static files in `public_html/`

### 3.1 Backend on cPanel

1. **cPanel → Setup Python App → Create Application**:
   - Python version: `3.11` (or newest available)
   - Application root: `posx-backend`
   - Application URL: `api` → serves at `https://yourdomain.com/api`
   - Startup file: `passenger_wsgi.py`
   - Entry point: `application`

2. Upload `/backend/` folder contents to `~/posx-backend/`.

3. In cPanel **Terminal** (or SSH):
   ```bash
   cd ~/posx-backend
   source /home/USERNAME/virtualenv/posx-backend/3.11/bin/activate
   pip install -r requirements.txt
   ```

4. The `backend/passenger_wsgi.py` (already in this repo) wraps FastAPI for Passenger:
   ```python
   import sys
   from pathlib import Path
   sys.path.insert(0, str(Path(__file__).parent))
   from server import app
   from a2wsgi import ASGIMiddleware
   application = ASGIMiddleware(app)
   ```

5. In **Setup Python App → Environment Variables**, add:
   ```
   MONGO_URL=mongodb+srv://...
   DB_NAME=posx_suite
   JWT_SECRET=...
   CORS_ORIGINS=https://yourdomain.com
   ```

6. Click **Restart** in the Python App panel.

### 3.2 Frontend on cPanel

1. **Locally**, build the frontend:
   ```bash
   cd frontend
   echo "REACT_APP_BACKEND_URL=https://yourdomain.com/api" > .env.production
   yarn install
   yarn build
   ```
   > Build output: `frontend/build/` (~280 kB gzip, ~1 MB uncompressed)

2. Upload **contents** of `frontend/build/` to `public_html/` (not the folder itself).

3. The `frontend/public/.htaccess` (already in this repo) is automatically copied into `frontend/build/` during `yarn build`. Upload it along with the other build files — it handles React Router SPA support:
   ```apache
   Options -MultiViews
   RewriteEngine On
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteRule ^ index.html [QSA,L]
   ```
   If you need to create it manually on the server, place it at `public_html/.htaccess`.

4. Visit `https://yourdomain.com` — the app should load.

> **Note:** WSGI wrapping reduces throughput vs `uvicorn` directly. For > 50 concurrent users, use a VPS running `uvicorn` behind Nginx instead.

---

## 4. Local Build Reference

```bash
# Install dependencies
cd frontend && yarn install

# Development server (hot reload, connects to localhost:8000)
yarn start

# Production build (output → frontend/build/)
REACT_APP_BACKEND_URL=https://your-backend.com yarn build

# Preview production build locally
yarn global add serve
serve -s build
```

**Backend local dev:**
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

---

## 5. Post-Deployment Checklist

### First Run
- [ ] Setup Wizard appears on first visit → creates Admin account + business config
- [ ] Admin PIN login works → lands on `/admin`
- [ ] Cashier/Waiter PIN login works → lands on `/tables` or `/cashier`

### Core POS
- [ ] Products list loads with images
- [ ] Add item to cart → checkout flow completes
- [ ] Held orders create and reopen correctly
- [ ] Stock deducts on order completion

### Table Service (Restaurant / Café / Bar / Nightclub)
- [ ] Tables / Bar Tabs page loads and shows correct status colours
- [ ] Waiter can only open tables assigned to them
- [ ] Admin / Manager can open and manage any occupied table
- [ ] **Transfer Table** button visible on occupied cards → reassigns to another staff member
- [ ] **Release Table** button visible on occupied cards → clears table
- [ ] **Print Bill** button appears in Table POS for applicable business types
- [ ] Popup blocker is disabled or allowed for print to work

### Admin
- [ ] User Types → Permissions module includes **Print Bill** under Tables
- [ ] CSV import populates brand / unit / outlet / terminal correctly
- [ ] Reports sub-routes navigate correctly
- [ ] Terminal-specific pricing works (set Active Terminal in Cashier → Settings)
- [ ] Settings → **Receipt & Bill** page loads with Receipt/Bill tab toggle
- [ ] Bill settings (header, footer, layout, toggles) save independently from Receipt settings
- [ ] Print Bill output reflects configured Bill header, footer, and tax visibility

### Settings & Security
- [ ] **Change all default PINs** from `123456` / `1111` / `2222` immediately
- [ ] `JWT_SECRET` is a 64+ character random string
- [ ] `CORS_ORIGINS` is set to your exact frontend domain (no wildcard in production)
- [ ] HTTPS is active (auto on Render/Vercel; use Let's Encrypt on cPanel)
- [ ] MongoDB Atlas → Network Access is locked to server IPs (remove `0.0.0.0/0`)

---

## 6. Production Hardening

1. **JWT_SECRET** — generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
2. **CORS** — set `CORS_ORIGINS` to exactly `https://your-frontend-domain.com`.
3. **HTTPS** — Render and Vercel provision SSL automatically. cPanel → SSL/TLS → Let's Encrypt.
4. **MongoDB backups** — enable Atlas continuous backup (free on M10+; manual snapshots on M0).
5. **Custom domain** — add a CNAME in your DNS pointing to Render/Vercel URL.
6. **Connection pool** — append `?maxPoolSize=50` to `MONGO_URL` for higher concurrency.
7. **Rate limiting** — add `slowapi` to FastAPI for public-facing instances.

---

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Blank screen after deploy | Check browser console — usually `REACT_APP_BACKEND_URL` mismatch |
| `CORS error` in console | Update `CORS_ORIGINS` in backend env to include your frontend URL |
| `404` on page refresh | Confirm `_redirects` (Render), `vercel.json` (Vercel), or `.htaccess` (cPanel) is in place |
| MongoDB `ServerSelectionTimeoutError` | Whitelist your server IP in Atlas → Network Access |
| Setup Wizard on every load | DB connection failure — verify `MONGO_URL` and `DB_NAME` |
| Cashier prices same on all terminals | Set Active Terminal via Cashier → Settings dialog |
| Print Bill popup blocked | Allow popups for your domain in browser settings |
| Settings → clicks go to Admin instead of Terminal modal | Ensure the page passes `onSettingsClick` to `<Sidebar>` — fixed in TablesPage as of this build |
| cPanel Python app 502 | Check `~/posx-backend/passenger_wsgi.py` exists; restart the app in Setup Python App |

---

Need help? File an issue in the repo and include the error from your hosting provider's log viewer.
