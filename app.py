"""
Flask photo browser: Recent and Favorite albums, view/delete/fav actions.
"""
import os
import shutil
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, abort, jsonify, render_template, request, send_file

load_dotenv()

app = Flask(__name__)

# Album roots (must exist at startup)
RECENT_PATH = os.environ.get("ALBUM_RECENT_PATH")
FAV_PATH = os.environ.get("ALBUM_FAV_PATH")

for name, path in [("ALBUM_RECENT_PATH", RECENT_PATH), ("ALBUM_FAV_PATH", FAV_PATH)]:
    if not path or not os.path.isdir(path):
        raise SystemExit(f"{name} must be set to an existing directory. Got: {path!r}")

RECENT_ROOT = Path(RECENT_PATH).resolve()
FAV_ROOT = Path(FAV_PATH).resolve()

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def get_album_root(album: str) -> Path:
    if album == "recent":
        return RECENT_ROOT
    if album == "favorite":
        return FAV_ROOT
    abort(400, "Invalid album")


def safe_join_root(root: Path, relative: str) -> Path:
    """Resolve path under root; abort if outside."""
    # Normalize: no leading slash, no ..
    parts = Path(relative).parts
    if any(p == ".." or os.path.isabs(p) for p in parts):
        abort(403, "Invalid path")
    full = (root / relative).resolve()
    if not str(full).startswith(str(root)):
        abort(403, "Path outside album")
    return full


def list_images(root: Path) -> list[tuple[str, float]]:
    """Yield (relative_path, mtime) for each image under root."""
    out = []
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS:
            try:
                rel = p.relative_to(root)
                out.append((str(rel).replace("\\", "/"), p.stat().st_mtime))
            except ValueError:
                pass
    return out


def group_by_day(items: list[tuple[str, float]]) -> dict[str, list[str]]:
    """Group relative paths by date string (YYYY-MM-DD). Newest day first."""
    from datetime import datetime

    by_day: dict[str, list[str]] = defaultdict(list)
    for rel, mtime in items:
        day = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d")
        by_day[day].append(rel)
    # Sort days descending (newest first), sort paths within day by mtime descending
    sorted_days = sorted(by_day.keys(), reverse=True)
    result = {}
    for day in sorted_days:
        paths = by_day[day]
        result[day] = paths
    return result


@app.route("/")
def index():
    album = request.args.get("album", "recent")
    if album not in ("recent", "favorite"):
        album = "recent"
    root = get_album_root(album)
    items = list_images(root)
    by_day = group_by_day(items)
    return render_template(
        "index.html",
        album=album,
        by_day=by_day,
        is_recent=(album == "recent"),
    )


@app.route("/view")
def view():
    album = request.args.get("album")
    path_arg = request.args.get("path")
    if not album or not path_arg:
        abort(400, "Missing album or path")
    root = get_album_root(album)
    full = safe_join_root(root, path_arg)
    if not full.is_file():
        abort(404)
    return send_file(full, mimetype="application/octet-stream", as_attachment=False)


@app.route("/delete", methods=["POST"])
def delete():
    # Support both form (single) and JSON (bulk)
    if request.is_json:
        data = request.get_json() or {}
        album = data.get("album")
        paths = data.get("paths")
        if not album or not isinstance(paths, list):
            return jsonify({"ok": False, "error": "Missing album or paths"}), 400
        root = get_album_root(album)
        deleted = 0
        errors = []
        for p in paths:
            if not isinstance(p, str):
                continue
            try:
                full = safe_join_root(root, p)
                if full.is_file():
                    full.unlink()
                    deleted += 1
            except Exception as e:
                errors.append({"path": p, "error": str(e)})
        return jsonify({"ok": True, "deleted": deleted, "errors": errors})
    # Single delete
    album = request.form.get("album")
    path_arg = request.form.get("path")
    if not album or not path_arg:
        return jsonify({"ok": False, "error": "Missing album or path"}), 400
    root = get_album_root(album)
    full = safe_join_root(root, path_arg)
    if not full.is_file():
        return jsonify({"ok": False, "error": "File not found"}), 404
    try:
        full.unlink()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/fav", methods=["POST"])
def fav():
    path_arg = request.form.get("path") or (request.get_json() or {}).get("path")
    if not path_arg:
        return jsonify({"ok": False, "error": "Missing path"}), 400
    src = safe_join_root(RECENT_ROOT, path_arg)
    if not src.is_file():
        return jsonify({"ok": False, "error": "File not found"}), 404
    # Move to FAV_ROOT with same filename (no subpath)
    dest = FAV_ROOT / src.name
    # Avoid overwrite: append _1, _2 if needed
    base = dest.stem
    ext = dest.suffix
    n = 0
    while dest.exists():
        n += 1
        dest = FAV_ROOT / f"{base}_{n}{ext}"
    try:
        shutil.move(str(src), str(dest))
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
