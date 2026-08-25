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

- Strava-OAuth: `STRAVA_CLIENT_ID`/`SECRET` + `NEXT_PUBLIC_STRAVA_CLIENT_ID`; der Callback validiert den OAuth-`state` (CSRF-Schutz).
- Garmin: Login über die App; Tokens landen serverseitig in `.garmin_tokens/`. Credentials werden nie als URL-Parameter oder argv übergeben.

### Kalender-Abo (ICS)

Der Feed `/api/calendar/feed.ics` ist token-geschützt; die URL inkl. Token zeigt das Kalender-Modal.

## Raspberry Pi Scale Bridge

```bash
python scripts/pi_zero_scale_bridge.py --app-url http://<host>:3000
# Env: HA_API_SECRET=<APP_API_SECRET>  (Pflicht, wenn API-Schutz aktiv)
```

## Verifikation

```bash
npx tsc --noEmit   # Typcheck
npm run lint       # ESLint
npm run build      # Produktions-Build
```

## Bekannte Folge-Aufgaben

- Vitest-Grundsuite für Pure-Logic (`detectNewPRs`, `stravaToEnduranceSession`, `getWeekStats`, `calculatePearson`) – noch nicht eingerichtet.
- Große Collections (Chat, Sessions, Nutrition) langfristig von localStorage zu IndexedDB migrieren.
