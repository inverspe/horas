"""Dev server for the PWA.

    python serve.py            # http://localhost:8000
    python serve.py 9000       # different port

Binds all interfaces so you can also open it from your iPhone on the same Wi-Fi.
Note: over a LAN IP the browser is NOT a secure context, so the service worker
will not register and offline mode won't work. That's expected — deploy over
HTTPS (GitHub Pages) to test the full installed experience.
"""
import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
    }

    def end_headers(self):
        # Never cache during development, or edits appear not to take effect.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # no packets sent; just picks the outbound iface
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    ip = lan_ip()
    print(f"Serving {ROOT}")
    print(f"  Desktop : http://localhost:{port}       (service worker WORKS here)")
    if ip:
        print(f"  iPhone  : http://{ip}:{port}   (same Wi-Fi; no service worker over plain HTTP)")
    print("Ctrl+C to stop.\n")
    ThreadingHTTPServer(("0.0.0.0", port), partial(Handler, directory=str(ROOT))).serve_forever()
