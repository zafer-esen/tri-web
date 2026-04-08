# TriCera Web Interface

A web-based interface for [TriCera](https://github.com/uuverifiers/tricera), a C program verifier. Uses [Monaco Editor](https://microsoft.github.io/monaco-editor/) (the editor behind VS Code) with syntax highlighting for C + TriCera extensions, inline verification diagnostics (squiggly underlines on failed assertions, green/red status), a configurable options panel, and example programs.

# Requirements

* [TriCera](https://github.com/uuverifiers/tricera) installed and accessible via the `tri` script.
* For local use: Python 3.6+ (standard library only, no pip install needed).
* For server deployment: Apache with PHP 7.4+ and `mod_rewrite`.
* Optional: [Graphviz](https://graphviz.org/) (`dot` command) for graphical Horn clauses and counterexample diagrams.

Installing Graphviz:
```bash
sudo apt install graphviz    # Ubuntu/Debian
sudo dnf install graphviz    # Fedora
brew install graphviz         # macOS
```

No build step is needed for the web interface itself - Monaco Editor loads from a CDN.

# Local usage

```bash
python3 serve.py --tricera /path/to/tri
# Open http://localhost:8000
```

The server auto-detects the `tri` executable by checking `TRICERA_PATH` environment variable, then `../tricera/tri` and `../tri` (if cloned alongside TriCera), then `tri` in PATH.

Other options: `--port PORT`, `--host HOST`, `--server` (enables `nice`, `prlimit`, and strict timeout limits for production use).

# Server deployment (Apache + PHP)

1. Copy the project to your web root (e.g., `/var/www/html/tricera/`).
2. Edit `php/config.php` and set `$TRICERA_PATH` to point to your `tri` executable.
3. Create the `shares/` and `log/` directories, writable by the web server user.
4. Enable `mod_rewrite` (`sudo a2enmod rewrite && sudo systemctl restart apache2`) and ensure `AllowOverride All` is set for the directory in your Apache config.

The Python backend (`serve.py`) and the PHP backend (`php/`) implement the same API, so the frontend works identically with either.

# Sharing

Programs can be shared via permalinks. Small programs are encoded client-side in the URL hash (`#code=...`). Larger programs are saved server-side and accessed via `?share=ID`. Both the code and the selected options are preserved.

# Logging

Verification submissions are logged to `log/submissions.log` (timestamp, IP, result, elapsed time, and a code preview). The log auto-rotates at 50 MB.

# Project structure

```
index.html              Single-page application
serve.py                Python local server (zero dependencies)
css/style.css           Dark theme styling
js/
  app.js                Application init and wiring
  editor.js             Monaco Editor setup, markers, decorations
  tricera-language.js   Monarch tokenizer for C + TriCera syntax
  options.js            Options panel with coupled controls
  verify.js             Verification lifecycle
  output.js             Output panel with tabs
  examples.js           Example loader
  share.js              Permalink generation/restoration
php/                    PHP backend (for Apache deployment)
  config.php            Server configuration
  config-api.php        Version/config endpoint
  verify.php            Verification endpoint
  share.php             Save shared program
  load.php              Load shared program
examples/               Curated example C programs
.htaccess               Apache URL rewriting rules
```
