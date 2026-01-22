from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
from datetime import datetime, date


# If you're using Docker and mounting a volume, change this to "/app/data/nutrition.db"
DB_PATH = "nutrition.db"

app = Flask(__name__)
CORS(app)


# ----------------------------
# DB helpers
# ----------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()

    # 1) Scan history (keep your original structure)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS scans (
                                             id INTEGER PRIMARY KEY AUTOINCREMENT,
                                             ts TEXT NOT NULL,
                                             barcode TEXT NOT NULL,
                                             name TEXT,
                                             calories REAL,
                                             protein REAL,
                                             carbs REAL,
                                             fat REAL,
                                             image_url TEXT
        )
        """
    )

    # 2) Product cache (one row per barcode)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS products (
                                                barcode TEXT PRIMARY KEY,
                                                name TEXT,
                                                calories REAL,
                                                protein REAL,
                                                carbs REAL,
                                                fat REAL,
                                                image_url TEXT,
                                                source TEXT,
                                                updated_at TEXT
        )
        """
    )

    # Indexes for speed
    cur.execute("CREATE INDEX IF NOT EXISTS idx_scans_ts ON scans(ts)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_scans_barcode ON scans(barcode)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)")

    # Lightweight migrations (in case older DB exists)
    # Add image_url to scans if missing
    try:
        cur.execute("ALTER TABLE scans ADD COLUMN image_url TEXT")
    except sqlite3.OperationalError:
        pass

    # WAL mode for performance (safe to run every boot; it persists)
    try:
        cur.execute("PRAGMA journal_mode=WAL;")
        cur.execute("PRAGMA synchronous=NORMAL;")
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()


# ----------------------------
# Open Food Facts fetch (cache miss)
# ----------------------------
def fetch_openfoodfacts(barcode: str):
    """
    Fetch product from Open Food Facts on cache miss.
    Returns dict with fields compatible with our 'products' table, or None if not found.
    """
    # Import here so your app still runs if requests isn't installed yet.
    import requests

    url = f"https://world.openfoodfacts.net/api/v2/product/{barcode}"
    try:
        r = requests.get(url, timeout=6)
    except requests.RequestException:
        return None

    if r.status_code != 200:
        return None

    payload = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    product = payload.get("product") or {}
    nutr = product.get("nutriments") or {}

    # OFF fields are often per 100g; you're currently storing whatever the client sends.
    # We'll store the per-100g numbers for consistency.
    result = {
        "barcode": barcode,
        "name": product.get("product_name") or product.get("product_name_en"),
        "calories": nutr.get("energy-kcal_100g"),
        "protein": nutr.get("proteins_100g"),
        "carbs": nutr.get("carbohydrates_100g"),
        "fat": nutr.get("fat_100g"),
        "image_url": product.get("image_front_url") or product.get("image_url"),
        "source": "openfoodfacts",
        "updated_at": datetime.utcnow().isoformat(),
    }

    # If there isn't even a name, treat as not found
    if not result["name"]:
        return None

    return result


def get_cached_product(barcode: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM products WHERE barcode=?", (barcode,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def upsert_product(product: dict):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT OR REPLACE INTO products
        (barcode, name, calories, protein, carbs, fat, image_url, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            product.get("barcode"),
            product.get("name"),
            product.get("calories"),
            product.get("protein"),
            product.get("carbs"),
            product.get("fat"),
            product.get("image_url"),
            product.get("source"),
            product.get("updated_at"),
        ),
    )
    conn.commit()
    conn.close()


def lookup_product_local_first(barcode: str):
    cached = get_cached_product(barcode)
    if cached:
        return cached

    fetched = fetch_openfoodfacts(barcode)
    if fetched:
        upsert_product(fetched)
        return fetched

    return None


# ----------------------------
# Routes (API)
# ----------------------------
@app.get("/api/status")
def status():
    return jsonify({"ok": True, "time": datetime.utcnow().isoformat()})


@app.get("/api/product/<barcode>")
def get_product(barcode):
    barcode = str(barcode).strip()
    if not barcode:
        return jsonify({"ok": False, "error": "barcode is required"}), 400

    product = lookup_product_local_first(barcode)
    if not product:
        return jsonify({"ok": False, "error": "not found"}), 404

    return jsonify({"ok": True, "product": product})


@app.post("/api/scan")
def add_scan():
    """
    Compatible with your current client.
    If the client sends only barcode (no nutrition fields), we will try to auto-fill from local cache (and OFF on miss).
    """
    data = request.get_json(force=True) or {}

    barcode = str(data.get("barcode", "")).strip()
    if not barcode:
        return jsonify({"ok": False, "error": "barcode is required"}), 400

    ts = datetime.utcnow().isoformat()

    # Client-provided values (optional)
    name = data.get("name")
    calories = data.get("calories")
    protein = data.get("protein")
    carbs = data.get("carbs")
    fat = data.get("fat")
    image_url = data.get("image_url")

    # Auto-fill if missing
    if name is None and calories is None and protein is None and carbs is None and fat is None and image_url is None:
        product = lookup_product_local_first(barcode)
        if product:
            name = product.get("name")
            calories = product.get("calories")
            protein = product.get("protein")
            carbs = product.get("carbs")
            fat = product.get("fat")
            image_url = product.get("image_url")

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO scans (ts, barcode, name, calories, protein, carbs, fat, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (ts, barcode, name, calories, protein, carbs, fat, image_url),
    )
    conn.commit()
    scan_id = cur.lastrowid
    conn.close()

    return jsonify({"ok": True, "id": scan_id, "ts": ts})


@app.get("/api/scans")
def list_scans():
    # optional: /api/scans?date=YYYY-MM-DD
    q_date = request.args.get("date")
    conn = get_db()
    cur = conn.cursor()

    if q_date:
        cur.execute(
            """
            SELECT * FROM scans
            WHERE substr(ts, 1, 10) = ?
            ORDER BY ts DESC
                LIMIT 200
            """,
            (q_date,),
        )
    else:
        cur.execute("SELECT * FROM scans ORDER BY ts DESC LIMIT 200")

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify({"ok": True, "rows": rows})


@app.get("/api/summary/today")
def summary_today():
    today = date.today().isoformat()
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            COALESCE(SUM(calories), 0) as calories,
            COALESCE(SUM(protein), 0) as protein,
            COALESCE(SUM(carbs), 0) as carbs,
            COALESCE(SUM(fat), 0) as fat,
            COUNT(*) as scans
        FROM scans
        WHERE substr(ts, 1, 10) = ?
        """,
        (today,),
    )
    row = dict(cur.fetchone())
    conn.close()
    return jsonify({"ok": True, "date": today, **row})


# ----------------------------
# Main
# ----------------------------
if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
