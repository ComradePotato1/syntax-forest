#!/usr/bin/env python3
"""
Lightweight local server for SyntaxForest.
Serves static files and provides optional /api/compile using pdflatex + pdftoppm
so students can verify exact LaTeX rendering against ling-200b styles.
"""

import base64
import json
import os
import shutil
import subprocess
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
HAS_PDFLATEX = shutil.which("pdflatex") is not None and shutil.which("pdftoppm") is not None

# Fallback preamble reproducing ling-200b.cls tree/TikZ macros when libertine.sty is absent
FALLBACK_PREAMBLE = r"""
\documentclass[border=12pt]{standalone}
\usepackage[utf8]{inputenc}
\usepackage{tikz}
\usepackage[linguistics]{forest}
\usepackage{soulutf8}
\usepackage{pifont}
\usepackage{xspace}
\usetikzlibrary{arrows,decorations.markings,decorations.pathreplacing,positioning}

\newcommand{\ol}[2][]{\textit{#2}\ifx&#1&\else\ `#1'\fi}
\newcommand{\br}[1]{$[$\,#1\,$]$}
\newcommand{\lb}[2]{\ensuremath{[_\text{#1}\,\text{#2}\,]}}
\newcommand{\gap}[0]{\rule[-1.25pt]{1.5em}{0.75pt}\,}
\newcommand{\ind}[1]{\ensuremath{_{#1}}}
\newcommand{\unpronounced}[1]{\st{\mbox{#1}}}
\newcommand{\tr}[1]{\ensuremath{t\ind{#1}}}
\newcommand{\primary}[1]{\textbf{#1}}
\newcommand{\secondary}[1]{\textit{#1}}
\newcommand{\pbr}[1]{\br{\primary{#1}}}
\newcommand{\sbr}[1]{\br{\secondary{#1}}}
\newcommand{\head}[1]{#1$^0$}
\newcommand{\spec}[1]{\mbox{[Spec, #1]}}
\newcommand{\comp}[1]{\mbox{[Comp, #1]}}
\newcommand{\xbar}[1]{\ensuremath{\overline{\textrm{#1}}}}
\newcommand{\ja}[0]{\ding{51}}
\newcommand{\nej}[0]{\ding{55}}
\newcommand{\feature}[1]{{\scshape [#1]}}
\newcommand{\hf}[1]{\feature{$+$#1$+$}}
\newcommand{\mf}[1]{\feature{$\bullet$#1$\bullet$}}
\newcommand{\mvf}[1]{\feature{$\wedge$#1$\wedge$}}
\newcommand{\af}[1]{\feature{$\star$#1$\star$}}
\newcommand{\shf}[1]{\hphantom{\scriptsize\,\ja}\hf{#1}{\scriptsize\,\ja}}
\newcommand{\smf}[1]{\hphantom{\scriptsize\,\ja}\mf{#1}{\scriptsize\,\ja}}
\newcommand{\smvf}[1]{\hphantom{\scriptsize\,\ja}\mvf{#1}{\scriptsize\,\ja}}
\newcommand{\saf}[1]{\hphantom{\scriptsize\,\ja}\af{#1}{\scriptsize\,\ja}}
\newcommand{\vP}[0]{\textit{v}P\xspace}
\newcommand{\littlev}[0]{\textit{v}\xspace}
\newcommand{\Merge}[0]{\textsc{Merge}\xspace}
\newcommand{\Agree}[0]{\textsc{Agree}\xspace}
\newcommand{\wh}[0]{\textit{wh}}
\newcommand{\Wh}[0]{\textit{Wh}}
\newcommand{\abar}[0]{\xbar{A}}
\newcommand{\pres}[0]{Tns$_{\textsc{pres}}$}
\newcommand{\past}[0]{Tns$_{\textsc{past}}$}

\tikzset{
    text height=0.65em,
    >=stealth,
    mvt/.style = {->, rounded corners=1pt, semithick},
    binding/.style = {o, rounded corners=1pt, semithick},
    agree/.style = {o, rounded corners=1pt, dotted, very thick},
    reconstruct/.style = {densely dashed},
    o/.style = {
        shorten >=#1, shorten <=#1,
        decoration={markings,
            mark=at position 0 with {\fill circle [xshift=#1,radius=#1];},
            mark=at position 1 with {\fill circle [xshift=-#1,radius=#1];},
        },
        postaction=decorate
    },
    o/.default=1.75pt,
    pics/proj-feature/.style 2 args={code={\draw node [right=-0.75em of #1] {#2};}},
}
\forestset{
    default preamble={for tree={
        edge={semithick},
        inner ysep=0.5ex,
        l sep=1em,
        s sep=0em,
        text depth={},
        text height=1em,
    }},
    unpronounced/.style = {text=gray, for descendants={text=gray, edge=gray}},
}
"""


def compile_forest_snippet(forest_code: str):
    if not HAS_PDFLATEX:
        return {"ok": False, "error": "pdflatex or pdftoppm is not available on this machine."}

    with tempfile.TemporaryDirectory() as tmp:
        cls_src = os.path.join(ROOT_DIR, "ling-200b.cls")
        use_cls = False
        if os.path.exists(cls_src):
            # Check if libertine.sty is available; if so use ling-200b.cls directly
            kp = subprocess.run(["kpsewhich", "libertine.sty"], capture_output=True, text=True)
            if kp.returncode == 0 and kp.stdout.strip():
                shutil.copy(cls_src, os.path.join(tmp, "ling-200b.cls"))
                use_cls = True

        if use_cls:
            doc = (
                "\\documentclass{ling-200b}\n"
                "\\title{Preview}\\author{Student}\\classnum{ling 200b}\\classtitle{Syntax}\n"
                "\\pagestyle{empty}\n"
                "\\begin{document}\n"
                f"{forest_code}\n"
                "\\end{document}\n"
            )
        else:
            doc = FALLBACK_PREAMBLE + "\n\\begin{document}\n" + forest_code + "\n\\end{document}\n"

        tex_path = os.path.join(tmp, "tree.tex")
        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(doc)

        proc = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "tree.tex"],
            cwd=tmp,
            capture_output=True,
            text=True,
            timeout=20,
        )
        pdf_path = os.path.join(tmp, "tree.pdf")
        if proc.returncode != 0 or not os.path.exists(pdf_path):
            return {"ok": False, "log": proc.stdout[-3000:] + "\n" + proc.stderr[-1000:]}

        png_prefix = os.path.join(tmp, "out")
        subprocess.run(
            ["pdftoppm", "-png", "-r", "200", "-singlefile", pdf_path, png_prefix],
            cwd=tmp,
            capture_output=True,
            timeout=15,
            check=True,
        )
        png_path = png_prefix + ".png"
        with open(png_path, "rb") as img:
            b64 = base64.b64encode(img.read()).decode("ascii")
        return {"ok": True, "imageBase64": b64}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def do_GET(self):
        if self.path == "/api/health":
            payload = json.dumps({"ok": True, "pdflatex": HAS_PDFLATEX}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/compile":
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            try:
                body = json.loads(raw.decode("utf-8"))
                result = compile_forest_snippet(body.get("latex", ""))
            except Exception as exc:
                result = {"ok": False, "error": str(exc)}
            payload = json.dumps(result).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        self.send_error(404)


def main():
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"SyntaxForest running at http://127.0.0.1:{port} (pdflatex={HAS_PDFLATEX})")
    server.serve_forever()


if __name__ == "__main__":
    main()
