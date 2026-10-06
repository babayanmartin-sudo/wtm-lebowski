import os
import subprocess
import sys
import textwrap
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def test_spa_route_does_not_serve_files_outside_static_dir(tmp_path):
    """STATIC_DIR is read at import time, so exercise the route in a fresh
    interpreter with ET_STATIC_DIR pointed at a temp dir."""
    static = tmp_path / "static"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("INDEX")
    (static / "app.js").write_text("APPJS")
    (tmp_path / "secret.txt").write_text("TOPSECRET")
    data = tmp_path / "data"
    data.mkdir()

    script = textwrap.dedent(
        """
        from fastapi.testclient import TestClient
        from app.main import app

        c = TestClient(app)
        assert c.get("/app.js").text == "APPJS"
        for p in ("/%2e%2e/secret.txt", "/..%2fsecret.txt", "/assets/..%2f..%2fsecret.txt"):
            r = c.get(p)
            assert "TOPSECRET" not in r.text, p
        print("OK")
        """
    )
    env = {**os.environ, "ET_STATIC_DIR": str(static), "ET_DATA_DIR": str(data)}
    out = subprocess.run(
        [sys.executable, "-c", script], cwd=BACKEND_DIR, env=env, capture_output=True, text=True
    )
    assert out.returncode == 0, out.stderr
    assert "OK" in out.stdout
