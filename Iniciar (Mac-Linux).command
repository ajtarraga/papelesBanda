#!/bin/sh
# Abre Papeles de Banda con un servidor local (necesario para el OCR sin conexión).
cd "$(dirname "$0")" || exit 1
PORT=8765
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT + 1)); done
URL="http://localhost:$PORT/index.html"
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
else
  echo "Hace falta python3 para el servidor local. Abre index.html directamente o usa la versión publicada."
  exit 1
fi
SERVER=$!
sleep 1
echo "Papeles de Banda funcionando en $URL"
echo "Deja esta ventana abierta mientras uses la aplicación. Ciérrala (o pulsa Ctrl+C) para terminar."
(command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") || true
trap 'kill $SERVER 2>/dev/null' INT TERM EXIT
wait $SERVER
