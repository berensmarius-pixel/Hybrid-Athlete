# Hybrid Athlete

Ganzheitlicher Trainings-, Erholungs- und Ernährungsplaner für Hybrid-Athleten (Kraft + Ausdauer) – als Offline-fähige PWA mit Garmin-, Strava- und Smart-Scale-Integration.

## Tech-Stack

- **Next.js 16** (App Router, Proxy statt Middleware) + **React 19** + TypeScript (strict)
- **Tailwind CSS v4** + shadcn/ui-Komponenten
- **State**: React Context + `usePersistentState`-Hook (localStorage-Persistenz mit Quota-Behandlung)
- **KI**: Google Gemini via auth-gated Server-Proxy (`/api/gemini/*`) – der API-Key bleibt serverseitig
- **Companion-Skripte**: Python (Garmin-Sync, Raspberry-Pi-BLE-Waagen-Bridge)

## Setup

```bash
npm install
cp .env.local.example .env.local   # Werte eintragen
npm run dev
```

### Pflicht: API-Zugriff absichern (`APP_API_SECRET`)

Alle `/api/*`-Routen sind durch `src/proxy.ts` geschützt, sobald `APP_API_SECRET` in `.env.local` gesetzt ist:

- **Browser**: Beim ersten Besuch fragt die App einmalig das Passwort ab (HttpOnly-Cookie, 30 Tage).
- **Geräte** (Pi-Bridge): senden `Authorization: Bearer <APP_API_SECRET>` bzw. Env-Var `HA_API_SECRET`.
- Ohne `APP_API_SECRET` läuft die App offen (nur für lokale Entwicklung gedacht).

Secret generieren (PowerShell):

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object { $_.ToString("x2") }) -join ""
```

### Strava & Garmin

- Strava-OAuth: `STRAVA_CLIENT_ID`/`SECRET` + `NEXT_PUBLIC_STRAVA_CLIENT_ID`; der Callback validiert den OAuth-`state` (CSRF-Schutz). Tokens werden ausschließlich serverseitig gespeichert (Supabase app_state, Fallback `.server_state/`) und verlassen den Server nie.
- Garmin: Login über die App; Tokens landen außerhalb von Cloud-Sync-Ordnern (`%LOCALAPPDATA%\hybrid-athlete\garmin_tokens` bzw. XDG-State-Dir, überschreibbar via `GARMIN_TOKEN_DIR`). Alte `.garmin_tokens/` werden beim ersten Lauf automatisch migriert.

### Kalender-Abo (ICS)

Der Feed `/api/calendar/feed.ics` ist über ein **separates, rotierbares Feed-Token** geschützt (unabhängig vom Session-Cookie). Die URL inkl. Token zeigt das Kalender-Modal; dort kann das Token auch rotiert werden (alte Abo-Links werden damit ungültig). Der Feed nutzt den tatsächlichen Wochenplan aus dem app_state.

## Raspberry Pi Scale Bridge

```bash
python scripts/pi_zero_scale_bridge.py --app-url http://<host>:3000
# Env: HA_API_SECRET=<APP_API_SECRET>  (Pflicht, wenn API-Schutz aktiv)
```

## Verifikation

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint (in src/lib + src/app/api sind explizite `any` verboten)
npm test           # Vitest (Kernlogik: PRs, Calculator, Rate Limit, Parser)
npm run build      # Produktions-Build
```

## Sicherheit im Überblick

- Alle `/api/*`-Routen laufen durch den Proxy (`src/proxy.ts`) mit Session-Cookie oder Bearer-Secret; zusätzlich IP-basiertes Rate Limiting (Login 5/min, Garmin 8/min).
- Secrets (Gemini-Key, Strava-Tokens) haben dedizierte Endpoints unter `/api/settings/*` und laufen bewusst NICHT über `/api/state` – ein GET auf App-State kann niemals Credentials ausliefern.
- Bild-Uploads werden serverseitig per Magic Bytes validiert und mit `nosniff`/CSP-Sandbox ausgeliefert.
- Garmin-Workout-Planung übergibt JSON per stdin statt argv (kein Windows-32k-Limit, nichts in der Prozessliste).

## Bekannte Folge-Aufgaben

- `noUncheckedIndexedAccess` in tsconfig aktivieren (~177 Fundstellen nachschärfen).
- Große Collections (Sessions, Nutrition) langfristig von localStorage zu IndexedDB migrieren (Chat-Historie ist bereits auf 200 Nachrichten gedeckelt).
- UI-Komponenten (FoodSearchModal, GarminHubModal) weiter in Subkomponenten zerlegen; `no-explicit-any` langfristig projektweit auf "error".
