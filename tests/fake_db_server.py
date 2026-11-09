"""Stand-in for Firestore used only in tests: serves the app folder and a tiny JSON API that
enforces the same permissions as firestore.rules (owner-only edits, admin-only settings,
scanning closed blocks non-admin writes).

    python3 fake_db_server.py <app-folder> <port>
"""
import json, sys, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial

ADMIN = "admin@example.com"
DB = {"sheets": {}, "shared": {}}
LOCK = threading.Lock()
FIELDS = {"examId", "by", "byName", "file", "name", "age", "role", "lang", "place", "sub", "q", "g", "x", "d", "auto", "t"}


class H(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _who(self):
        return self.headers.get("x-uid") or None, (self.headers.get("x-email") or "").lower()

    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def _deny(self, why):
        self._send(403, {"error": why})

    def _body(self):
        n = int(self.headers.get("content-length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def _open(self, exam):
        return DB["shared"].get(exam, {}).get("session", {"open": True}).get("open", True)

    def do_GET(self):
        if not self.path.startswith("/api/"):
            return super().do_GET()
        uid, _ = self._who()
        if not uid:
            return self._deny("not signed in")
        exam = self.path.split("exam=")[-1]
        from urllib.parse import unquote
        exam = unquote(exam)
        with LOCK:
            self._send(200, {"sheets": {k: v for k, v in DB["sheets"].items() if v["examId"] == exam}, "shared": DB["shared"].get(exam, {})})

    def do_PUT(self):
        uid, email = self._who(); admin = email == ADMIN
        sid = self.path.split("/api/sheets/")[-1]; d = self._body()
        if not uid: return self._deny("not signed in")
        if set(d) - FIELDS or len(d.get("q", "")) > 50 or len(d.get("name", "")) > 80: return self._deny("invalid sheet")
        with LOCK:
            cur = DB["sheets"].get(sid)
            if not admin:
                if d.get("by") != uid: return self._deny("not owner")
                if cur and cur["by"] != uid: return self._deny("not owner")
                if not self._open(d["examId"]): return self._deny("scanning closed")
            DB["sheets"][sid] = d
        self._send(200, {"ok": True})

    def do_DELETE(self):
        uid, email = self._who(); admin = email == ADMIN
        sid = self.path.split("/api/sheets/")[-1]
        with LOCK:
            cur = DB["sheets"].get(sid)
            if not cur: return self._send(200, {"ok": True})
            if not admin and (cur["by"] != uid or not self._open(cur["examId"])): return self._deny("not allowed")
            del DB["sheets"][sid]
        self._send(200, {"ok": True})

    def do_PATCH(self):
        uid, email = self._who()
        if email != ADMIN: return self._deny("admin only")
        from urllib.parse import unquote
        exam = unquote(self.path.split("/api/shared/")[-1]); d = self._body()
        with LOCK:
            DB["shared"].setdefault(exam, {}).update(d)
        self._send(200, {"ok": True})

    def do_POST(self):
        uid, email = self._who()
        if email != ADMIN: return self._deny("admin only")
        exam = self._body()["examId"]
        with LOCK:
            for k in [k for k, v in DB["sheets"].items() if v["examId"] == exam]: del DB["sheets"][k]
            DB["shared"].setdefault(exam, {}).update({"places": {}, "subs": {}})
        self._send(200, {"ok": True})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[2])), partial(H, directory=sys.argv[1])).serve_forever()
