#!/bin/sh
# Abre Papeles de Banda con un servidor local: necesario para el OCR sin conexión
# y para reconocer PDF con Audiveris (si está instalado).
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 herramientas/servidor.py
fi
echo "Hace falta python3 para el servidor local. Abre index.html directamente o usa la versión publicada."
echo "Pulsa Intro para salir."
read -r _
