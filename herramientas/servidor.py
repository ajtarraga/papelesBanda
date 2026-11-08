#!/usr/bin/env python3
"""
Servidor local de Papeles de Banda (Mac y Linux).

- Sirve la aplicación web (index.html, transportar.html...).
- Ofrece el reconocimiento de PDF con Audiveris, si está instalado en el ordenador:
    GET  /api/omr/status        -> {"available": true/false, "command": "..."}
    POST /api/omr?name=x.pdf    -> cuerpo: el PDF; respuesta: {"files": [{"name", "base64"}], "log": "..."}

Solo escucha en 127.0.0.1 (nadie más de la red puede usarlo).
Ruta de Audiveris: se busca sola; también se puede indicar con la variable de entorno AUDIVERIS.
"""
import base64
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAX_PDF = 300 * 1024 * 1024
OMR_TIMEOUT = 60 * 60  # una hora como máximo por PDF
omr_lock = threading.Lock()


def find_audiveris():
    """Devuelve la orden para ejecutar Audiveris (lista) o None."""
    env = os.environ.get('AUDIVERIS')
    if env:
        return env.split('|') if '|' in env else [env]
    candidates = [
        '/Applications/Audiveris.app/Contents/MacOS/Audiveris',
        os.path.expanduser('~/Applications/Audiveris.app/Contents/MacOS/Audiveris'),
        '/opt/audiveris/bin/Audiveris',
        '/usr/bin/audiveris',
        '/usr/local/bin/audiveris',
    ]
    for c in candidates:
        if os.path.isfile(c) and os.access(c, os.X_OK):
            return [c]
    for name in ('audiveris', 'Audiveris'):
        p = shutil.which(name)
        if p:
            return [p]
    if shutil.which('flatpak'):
        try:
            out = subprocess.run(['flatpak', 'info', 'org.audiveris.audiveris'], capture_output=True, timeout=10)
            if out.returncode == 0:
                return ['flatpak', 'run', 'org.audiveris.audiveris']
        except Exception:
            pass
    return None


def run_omr(pdf_bytes, name):
    cmd = find_audiveris()
    if not cmd:
        raise RuntimeError('Audiveris no está instalado en este ordenador.')
    work = tempfile.mkdtemp(prefix='papeles-omr-')
    try:
        base = os.path.splitext(os.path.basename(name or 'partitura.pdf'))[0] or 'partitura'
        safe = ''.join(ch if ch.isalnum() or ch in ' ._-' else '_' for ch in base).strip() or 'partitura'
        src = os.path.join(work, safe + '.pdf')
        out = os.path.join(work, 'salida')
        os.makedirs(out)
        with open(src, 'wb') as f:
            f.write(pdf_bytes)
        args = cmd + ['-batch', '-export', '-output', out, '--', src]
        proc = subprocess.run(args, capture_output=True, text=True, timeout=OMR_TIMEOUT)
        log = (proc.stdout or '') + (proc.stderr or '')
        found = sorted(glob.glob(os.path.join(out, '**', '*.mxl'), recursive=True) +
                       glob.glob(os.path.join(out, '**', '*.xml'), recursive=True) +
                       glob.glob(os.path.join(out, '**', '*.musicxml'), recursive=True))
        files = []
        for p in found:
            with open(p, 'rb') as f:
                files.append({'name': os.path.basename(p), 'base64': base64.b64encode(f.read()).decode('ascii')})
        if not files:
            raise RuntimeError('Audiveris no ha generado ningún MusicXML.\n' + log[-4000:])
        return {'files': files, 'log': log[-4000:]}
    finally:
        shutil.rmtree(work, ignore_errors=True)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):  # silencioso
        pass

    def send_json(self, code, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split('?')[0] == '/api/omr/status':
            cmd = find_audiveris()
            return self.send_json(200, {'available': bool(cmd), 'command': ' '.join(cmd) if cmd else None})
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != '/api/omr':
            return self.send_json(404, {'error': 'No existe'})
        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0 or length > MAX_PDF:
            return self.send_json(400, {'error': 'PDF vacío o demasiado grande'})
        data = self.rfile.read(length)
        if not data.startswith(b'%PDF'):
            return self.send_json(400, {'error': 'El archivo no es un PDF'})
        name = urllib.parse.parse_qs(parsed.query).get('name', ['partitura.pdf'])[0]
        if not omr_lock.acquire(blocking=False):
            return self.send_json(409, {'error': 'Ya se está reconociendo otro PDF; espera a que termine.'})
        try:
            return self.send_json(200, run_omr(data, name))
        except subprocess.TimeoutExpired:
            return self.send_json(500, {'error': 'Audiveris ha tardado demasiado.'})
        except Exception as e:  # noqa: BLE001
            return self.send_json(500, {'error': str(e)})
        finally:
            omr_lock.release()


Handler.extensions_map.update({'.mjs': 'text/javascript', '.wasm': 'application/wasm', '.gz': 'application/octet-stream'})


def main():
    nums = [a for a in sys.argv[1:] if a.isdigit()]
    port = int(nums[0]) if nums else 8765
    server = None
    for p in range(port, port + 30):
        try:
            server = ThreadingHTTPServer(('127.0.0.1', p), Handler)
            port = p
            break
        except OSError:
            continue
    if not server:
        print('No se pudo abrir ningún puerto local.')
        sys.exit(1)
    url = f'http://localhost:{port}/index.html'
    print(f'Papeles de Banda funcionando en {url}')
    cmd = find_audiveris()
    print('Reconocimiento de PDF (Audiveris): ' + (' '.join(cmd) if cmd else 'no instalado'))
    print('Deja esta ventana abierta mientras uses la aplicación. Ciérrala (o pulsa Ctrl+C) para terminar.')
    if '--no-browser' not in sys.argv:
        try:
            import webbrowser
            webbrowser.open(url)
        except Exception:
            pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
