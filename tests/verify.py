#!/usr/bin/env python3
"""End-to-end verification script for SyntaxForest using GJS (SpiderMonkey ESM), HTTP server, and pdflatex."""

import json
import os
import re
import subprocess
import sys
import threading
import urllib.request
from http.server import ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server as app_server  # noqa: E402


def main():
    # 1. Run JS module tests via gjs -m
    gjs_res = subprocess.run(
        ["gjs", "-m", os.path.join(ROOT, "tests", "run_gjs.js")],
        capture_output=True,
        text=True,
        timeout=20,
    )
    if gjs_res.returncode != 0:
        print("GJS FAILED:", gjs_res.stderr)
        sys.exit(1)

    report = json.loads(gjs_res.stdout.strip().splitlines()[-1])
    print(f"JS assertions passed: {len(report['passed'])}")
    if report["failed"]:
        print("JS ASSERTION FAILURES:")
        for f in report["failed"]:
            print(" -", f)
        sys.exit(1)

    # 2. Boot HTTP server and test static serving + /api/health + /api/compile on every generated snippet
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), app_server.Handler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()

    try:
        for path in ["/", "/styles.css", "/js/app.js", "/js/renderer.js", "/api/health"]:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=5) as resp:
                assert resp.status == 200, f"HTTP {path} returned {resp.status}"
        print("HTTP static + /api/health checks passed.")

        for name, latex in report["snippets"].items():
            assert latex.startswith("\\begin{forest}") and latex.endswith("\\end{forest}"), f"{name} scope violation"
            req = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/compile",
                data=json.dumps({"latex": latex}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=25) as resp:
                c_res = json.loads(resp.read().decode("utf-8"))
            if not c_res.get("ok"):
                print(f"pdflatex FAIL [{name}]:\n{c_res.get('log', c_res.get('error'))}")
                sys.exit(1)
            print(f"  pdflatex [{name}]: OK ({len(c_res.get('imageBase64', ''))} base64 chars)")

        # 3. Also verify all 5 forest blocks directly extracted from instructions.tex compile cleanly
        with open(os.path.join(ROOT, "instructions.tex"), encoding="utf-8") as f:
            instr = f.read()
        blocks = re.findall(r"\\begin\{forest\}[\s\S]*?\\end\{forest\}", instr)
        assert len(blocks) == 5, f"Expected 5 forest blocks in instructions.tex, got {len(blocks)}"
        for i, blk in enumerate(blocks, 1):
            c_res = app_server.compile_forest_snippet(blk)
            assert c_res.get("ok"), f"instructions.tex block {i} failed: {c_res.get('log')}"
            print(f"  instructions.tex block {i}: OK")
    finally:
        httpd.shutdown()

    print("ALL VERIFICATION CHECKS PASSED.")


if __name__ == "__main__":
    main()
