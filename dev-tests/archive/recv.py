"""Tiny local receiver: the browser test POSTs the files it 'downloaded' here so they can be opened and checked."""
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(n)
        name = os.path.basename(self.path.strip("/")) or "file"
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(data)
        self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b"ok")

    def log_message(self, *a):
        pass


ThreadingHTTPServer(("127.0.0.1", 9000), H).serve_forever()
