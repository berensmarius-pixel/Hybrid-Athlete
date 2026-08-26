#!/usr/bin/env bash
# =============================================================
# Hybrid Athlete - Pi-Installer (alles-in-einem)
# Macht auf dem Raspberry Pi automatisch:
#   1. alte Waagen-Dienste/Prozesse stoppen
#   2. Python-Paket "bleak" installieren
#   3. Bluetooth-Gruppe setzen
#   4. systemd-Dienst anlegen, aktivieren, starten
#
# Ausfuehren auf dem Pi:      bash /tmp/pi_install.sh
# Andere App-URL:             APP_URL=http://... bash /tmp/pi_install.sh
# =============================================================
set -uo pipefail

APP_URL="${APP_URL:-http://192.168.178.38:3000}"
DAEMON="$HOME/hybrid-athlete/scripts/scale_daemon.py"
SECRET_FILE="$HOME/.scale_env"
SERVICE_NAME="hybrid-scale"

echo "==================================================="
echo " Hybrid Athlete - Scale-Daemon Setup"
echo " Ziel-App : $APP_URL/api/metrics/weight"
echo " Skript   : $DAEMON"
echo "==================================================="

# ── 0. Voraussetzungen pruefen ────────────────────────────────
if [ ! -f "$DAEMON" ]; then
    echo "FEHLER: $DAEMON nicht gefunden!"
    echo "  Bitte zuerst von Windows kopieren:"
    echo '  scp scripts\scale_daemon.py pi@<PI-IP>:/home/pi/hybrid-athlete/scripts/'
    exit 1
fi

if [ ! -s "$SECRET_FILE" ]; then
    echo "FEHLER: $SECRET_FILE fehlt oder ist leer."
    echo "  Bitte zuerst den Secret-Schritt von Windows ausfuehren."
    exit 1
fi

# ── 1. Alte Dienste & Prozesse stoppen (Doppel-Messungen!) ────
echo "-> Stoppe alte Waagen-Dienste ..."
for svc in hybrid-scale-bridge scale-bridge pi-scale-bridge insmart-scale scale_daemon; do
    systemctl disable --now "$svc.service" >/dev/null 2>&1 && echo "   gestoppt: $svc"
done
pkill -f pi_zero_scale_bridge.py 2>/dev/null && echo "   alter Bridge-Prozess beendet"
pkill -f "scale_daemon.py --app-url" 2>/dev/null && echo "   alter Daemon-Prozess beendet"

# ── 2. bleak installieren ─────────────────────────────────────
if ! python3 -c "import bleak" >/dev/null 2>&1; then
    echo "-> Installiere bleak ..."
    pip3 install bleak --break-system-packages 2>/dev/null \
        || pip3 install bleak 2>/dev/null \
        || { sudo apt-get update -qq && sudo apt-get install -y -qq python3-pip; pip3 install bleak --break-system-packages 2>/dev/null || pip3 install bleak; }
fi
python3 -c "import bleak" >/dev/null 2>&1 || { echo "FEHLER: bleak konnte nicht installiert werden."; exit 1; }
echo "-> bleak OK"

# ── 3. Bluetooth-Gruppe ───────────────────────────────────────
if id -nG "$USER" | grep -qw bluetooth; then
    echo "-> Bluetooth-Gruppe OK"
else
    sudo usermod -aG bluetooth "$USER"
    echo "-> Benutzer zur Bluetooth-Gruppe hinzugefuegt (gilt nach Neustart)"
fi

# ── 4. systemd-Dienst anlegen ─────────────────────────────────
echo "-> Lege systemd-Dienst an ..."
sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" > /dev/null <<EOF
[Unit]
Description=Hybrid Athlete BLE Scale Daemon (Insmart FG260, Offline-First SQLite + Cloud-Sync)
After=network-online.target bluetooth.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
Group=$USER
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 $DAEMON --athlete --app-url $APP_URL --db-path $HOME/.scale_data/measurements.db --api-secret-file $SECRET_FILE
Restart=always
RestartSec=5
StartLimitIntervalSec=300
StartLimitBurst=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME.service"
sleep 2

echo ""
echo "== Status =="
systemctl --no-pager -l status "$SERVICE_NAME.service" | head -n 10 || true
echo ""
echo "== FERTIG =="
echo "Logs live ansehen : journalctl -u $SERVICE_NAME -f"
echo "Test              : Auf die Waage stellen -> Log muss 'lokal gespeichert' zeigen."
echo "Falls BLE-Fehler im Log stehen: einmal 'sudo reboot' ausfuehren."
