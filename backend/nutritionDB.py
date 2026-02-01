from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import sqlite3
import queue
import json
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
                                                     fat REAL,
                                                     image_url TEXT
                )
                """)
    conn.commit()

    # lightweight migration if scans table existed before image_url was added
    try:
        cur.execute("ALTER TABLE scans ADD COLUMN image_url TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        # column already exists
        pass

    conn.close()

app = Flask(__name__)
CORS(app)  # allows React dev server to call Flask

@app.get("/api/status")
def status():
    return jsonify({"ok": True, "time": datetime.utcnow().isoformat()})

scan_events = queue.Queue()

@app.post("/api/scan")
def add_scan():
    data = request.get_json(force=True)

    barcode = str(data.get("barcode", "")).strip()
    if not barcode:
        return jsonify({"ok": False, "error": "barcode is required"}), 400

    ts = datetime.utcnow().isoformat()

    name = data.get("name")
    calories = data.get("calories")
    protein = data.get("protein")
    carbs = data.get("carbs")
    fat = data.get("fat")
    image_url = data.get("image_url")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
                INSERT INTO scans (ts, barcode, name, calories, protein, carbs, fat, image_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (ts, barcode, name, calories, protein, carbs, fat, image_url))
    conn.commit()
    scan_id = cur.lastrowid
    conn.close()

    scan_events.put({"barcode": barcode})
    return jsonify({"ok": True, "id": scan_id, "ts": ts, "barcode": barcode})
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

@app.get("/api/stream")
def stream():
    def gen():
        while True:
            event = scan_events.get()  # blocks until a scan arrives
            yield f"data: {json.dumps(event)}\n\n"

    return Response(stream_with_context(gen()), mimetype="text/event-stream")

if __name__ == "__main__":
    init_db()
    # For Pi LAN access: host=0.0.0.0
    app.run(host="0.0.0.0", port=5000, debug=True)
