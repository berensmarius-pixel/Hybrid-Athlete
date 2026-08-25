#!/usr/bin/env bash
# Installations-Skript fuer den Raspberry Pi (ausfuehren auf dem PI, nicht am PC!)
# Voraussetzung: scale_daemon.py liegt in /home/pi, Raspberry Pi OS mit BlueZ.
set -euo pipefail

APP_DIR="/home/pi"
VENV_DIR="$APP_DIR/scale-env"
SERVICE_NAME="hybrid_scale.service"

echo "== 1/4: Python-vEnv + bleak installieren =="
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip >/dev/null
"$VENV_DIR/bin/pip" install bleak

echo "== 2/4: Bluetooth-Rechte ohne root setzen (setcap) =="
PYBIN="$(readlink -f "$VENV_DIR/bin/python3")"
sudo setcap cap_net_raw,cap_net_admin+eip "$PYBIN" && echo "setcap OK auf $PYBIN"
if command -v getcap >/dev/null 2>&1; then getcap "$PYBIN"; fi

echo "== 3/4: Bluetooth-Dienst pruefen =="
sudo systemctl enable --now bluetooth
sudo hciconfig hci0 up || true

echo "== 4/4: systemd-Service installieren =="
if [ -f "$APP_DIR/$SERVICE_NAME" ]; then
    sudo cp "$APP_DIR/$SERVICE_NAME" "/etc/systemd/system/$SERVICE_NAME"
    sudo systemctl daemon-reload
    sudo systemctl enable --now "$SERVICE_NAME"
    echo "Service aktiv:  systemctl status $SERVICE_NAME"
    echo "Live-Logs:      journalctl -u $SERVICE_NAME -f"
else
    echo "Hinweis: $SERVICE_NAME nicht gefunden - Service-Manuell-Step uebersprungen."
fi

echo
echo "== Fertig. Manuelle Tests: =="
echo "  Sniffer : $VENV_DIR/bin/python $APP_DIR/scale_sniffer.py --mac <MAC> --jsonl /tmp/scale.jsonl"
echo "  Daemon  : $VENV_DIR/bin/python $APP_DIR/scale_daemon.py --mac <MAC>"
