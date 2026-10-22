"""Server messages come out in Portuguese (default) or English, following the X-Lang header and set_lang()."""
import http.client
import json
import os
import subprocess
import sys
import tempfile
import time

BACKEND = os.getcwd()
sys.path.insert(0, BACKEND)
fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (" -> " + str(detail)[:200] if detail != "" else ""), flush=True)
    if not ok:
        fails.append(name)


# ── direct: the same refusal in both languages ──
from utils.lang import set_lang   # noqa: E402
import services.frf_service as frf   # noqa: E402
from utils import limits   # noqa: E402


def refusal():
    try:
        frf.analyse("lang-s1", dict(excitation=None, responses=[], response_type="none", show_as="none"))
    except frf.FrfError as exc:
        return str(exc)
    except Exception as exc:
        return "other:" + repr(exc)
    return ""


set_lang("pt")
pt = refusal()
set_lang("en")
en = refusal()
check("FRF refusal in Portuguese", pt == "Escolha ao menos um canal de resposta.", pt)
check("FRF refusal in English", en == "Choose at least one response channel.", en)
set_lang("pt")
check("FRF refusal back to Portuguese", refusal() == pt)

limits.MAX_EXPORT_CELLS = 10
for lg, word in (("pt", "Use CSV: ele"), ("en", "Use CSV instead")):
    set_lang(lg)
    try:
        limits.check_export_size(1000)
        check(f"export limit ({lg})", False, "no error")
    except limits.ResourceLimitError as exc:
        check(f"export limit ({lg})", word in str(exc), str(exc))
set_lang("pt")
check("limit label follows the language", limits.label("spectrum") == "O espectro")
set_lang("en")
check("limit label in English", limits.label("spectrum") == "The spectrum")
set_lang("pt")


# ── through HTTP ──
class Server:
    def __init__(self, port):
        self.port = port
        self.tmp = tempfile.mkdtemp(prefix="pysqa-lang-")
        e = dict(os.environ)
        for k in ("PYSQA_MEMORY_MB", "RENDER"):
            e.pop(k, None)
        e["PYSQA_TMP_DIR"] = self.tmp
        e["PYTHONDONTWRITEBYTECODE"] = "1"
        self.proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(port)],
                                     cwd=BACKEND, env=e, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(60):
            try:
                if self.req("GET", "/api/health")[0] == 200:
                    return
            except Exception:
                time.sleep(1)
        raise RuntimeError("server did not start")

    def req(self, method, path, lang=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        c.request(method, path, headers={"X-Lang": lang} if lang else {})
        r = c.getresponse()
        raw = r.read()
        c.close()
        try:
            return r.status, json.loads(raw)
        except Exception:
            return r.status, raw[:100]

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(10)
        except Exception:
            self.proc.kill()


s = Server(8231)
try:
    for path, pt_text, en_text in (
        ("/api/frf/bad/xx", "Identificador de sessão inválido.", "Invalid session id."),
        ("/api/audio/session-ok-1/audio-ok-1/stream", "Áudio não encontrado", "Audio not found"),
    ):
        method = "DELETE" if "frf" in path else "GET"
        st1, d1 = s.req(method, path, "pt")
        st2, d2 = s.req(method, path, "en")
        st3, d3 = s.req(method, path)
        check(f"{path}: X-Lang pt", isinstance(d1, dict) and d1.get("detail") == pt_text, d1)
        check(f"{path}: X-Lang en", isinstance(d2, dict) and d2.get("detail") == en_text, d2)
        check(f"{path}: no header means Portuguese", isinstance(d3, dict) and d3.get("detail") == pt_text, d3)
finally:
    s.stop()

print("FAILS:", len(fails), fails)
sys.exit(1 if fails else 0)
