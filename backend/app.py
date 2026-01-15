from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
from datetime import datetime, date

DB_PATH = "nutrition.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            barcode TEXT NOT NULL,
            name TEXT,
            calories REAL,
            protein REAL,
            carbs REAL,
            fat REAL
        )
    """)
    conn.commit()
    conn.close()

app = Flask(__name__)
CORS(app)  # allows React dev server to call Flask

@app.get("/api/status")
def status():
    return jsonify({"ok": True, "time": datetime.utcnow().isoformat()})

@app.post("/api/scan")
def add_scan():
    data = request.get_json(force=True)

    barcode = str(data.get("barcode", "")).strip()
    if not barcode:
        return jsonify({"ok": False, "error": "barcode is required"}), 400

    ts = datetime.utcnow().isoformat()

    # Optional nutrition fields (you can fill these from your DB lookup)
    name = data.get("name")
    calories = data.get("calories")
    protein = data.get("protein")
    carbs = data.get("carbs")
    fat = data.get("fat")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO scans (ts, barcode, name, calories, protein, carbs, fat)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (ts, barcode, name, calories, protein, carbs, fat))
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
        cur.execute("""
            SELECT * FROM scans
            WHERE substr(ts, 1, 10) = ?
            ORDER BY ts DESC
            LIMIT 200
        """, (q_date,))
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
    cur.execute("""
        SELECT
            COALESCE(SUM(calories), 0) as calories,
            COALESCE(SUM(protein), 0) as protein,
            COALESCE(SUM(carbs), 0) as carbs,
            COALESCE(SUM(fat), 0) as fat,
            COUNT(*) as scans
        FROM scans
        WHERE substr(ts, 1, 10) = ?
    """, (today,))
    row = dict(cur.fetchone())
    conn.close()
    return jsonify({"ok": True, "date": today, **row})

if __name__ == "__main__":
    init_db()
    # For Pi LAN access: host=0.0.0.0
    app.run(host="0.0.0.0", port=5000, debug=True)
