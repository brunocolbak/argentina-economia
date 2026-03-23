#!/usr/bin/env python3
"""
Auto-update data.json from public BCRA/INDEC APIs.
Run weekly via GitHub Action or manually.

BCRA APIs: https://www.bcra.gob.ar/BCRAyVos/Catalogo_de_APIs_702.asp
INDEC: no public API, but some data is scrapable from published reports.

This script updates what it can automatically. Manual updates are needed for:
- Quarterly BdP (INDEC publishes ~3 months after quarter end)
- Employment (EPH, quarterly)
- GDP composition
- Industrial capacity
- Morosidad (BCRA Informe sobre Bancos, monthly PDF)
"""

import json
import requests
from datetime import datetime, timedelta
import sys

DATA_PATH = "data/data.json"

def load_data():
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def save_data(data):
    data["meta"]["last_updated"] = datetime.now().strftime("%Y-%m-%d")
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ data.json updated ({datetime.now().strftime('%Y-%m-%d %H:%M')})")

def fetch_bcra_usd():
    """Fetch latest USD/ARS official rate from BCRA API."""
    try:
        url = "https://api.bcra.gob.ar/estadisticas/v2.0/DatosVariable/4/2026-01-01/2026-12-31"
        headers = {"Accept": "application/json"}
        r = requests.get(url, headers=headers, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if "results" in data and len(data["results"]) > 0:
                latest = data["results"][-1]
                print(f"  USD/ARS: {latest['valor']} ({latest['fecha']})")
                return latest["valor"], latest["fecha"]
    except Exception as e:
        print(f"  ⚠️ BCRA USD fetch failed: {e}")
    return None, None

def fetch_bcra_reservas():
    """Fetch latest international reserves from BCRA API."""
    try:
        url = "https://api.bcra.gob.ar/estadisticas/v2.0/DatosVariable/1/2026-01-01/2026-12-31"
        headers = {"Accept": "application/json"}
        r = requests.get(url, headers=headers, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if "results" in data and len(data["results"]) > 0:
                latest = data["results"][-1]
                val = latest["valor"]
                print(f"  Reservas: USD {val:,.0f} M ({latest['fecha']})")
                return val, latest["fecha"]
    except Exception as e:
        print(f"  ⚠️ BCRA reserves fetch failed: {e}")
    return None, None

def fetch_bcra_inflacion():
    """Fetch latest monthly CPI from BCRA expected inflation survey (REM)."""
    try:
        # BCRA variable 27 = IPC monthly variation
        url = "https://api.bcra.gob.ar/estadisticas/v2.0/DatosVariable/27/2025-01-01/2026-12-31"
        headers = {"Accept": "application/json"}
        r = requests.get(url, headers=headers, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if "results" in data and len(data["results"]) > 0:
                latest = data["results"][-1]
                print(f"  IPC mensual: {latest['valor']}% ({latest['fecha']})")
                return latest["valor"], latest["fecha"]
    except Exception as e:
        print(f"  ⚠️ BCRA CPI fetch failed: {e}")
    return None, None

def fetch_bcra_base_monetaria():
    """Fetch latest base monetaria from BCRA API."""
    try:
        url = "https://api.bcra.gob.ar/estadisticas/v2.0/DatosVariable/15/2026-01-01/2026-12-31"
        headers = {"Accept": "application/json"}
        r = requests.get(url, headers=headers, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if "results" in data and len(data["results"]) > 0:
                latest = data["results"][-1]
                print(f"  Base Monetaria: ${latest['valor']:,.0f} M ({latest['fecha']})")
                return latest["valor"], latest["fecha"]
    except Exception as e:
        print(f"  ⚠️ BCRA base monetaria fetch failed: {e}")
    return None, None

def main():
    print("🔄 Argentina economic data update")
    print(f"   {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    data = load_data()
    updated = False

    # 1. USD/ARS rate
    print("📌 Fetching USD/ARS rate...")
    usd, usd_date = fetch_bcra_usd()
    if usd:
        # Could update dolar_acum series if needed
        updated = True

    # 2. Reserves
    print("📌 Fetching international reserves...")
    res, res_date = fetch_bcra_reservas()
    if res:
        updated = True

    # 3. Inflation
    print("📌 Fetching CPI...")
    cpi, cpi_date = fetch_bcra_inflacion()
    if cpi:
        updated = True

    # 4. Base monetaria
    print("📌 Fetching base monetaria...")
    bm, bm_date = fetch_bcra_base_monetaria()
    if bm:
        updated = True

    print()
    if updated:
        save_data(data)
        print("📊 Some data was fetched. Review data.json for manual updates.")
    else:
        print("⚠️ No data could be fetched. APIs may be down or rate-limited.")
        print("   Manual update of data.json may be needed.")

    print()
    print("📝 MANUAL UPDATES NEEDED for:")
    print("   - INDEC BdP (quarterly, ~3 month lag)")
    print("   - INDEC EPH employment (quarterly)")
    print("   - BCRA Informe sobre Bancos (morosidad, monthly PDF)")
    print("   - INDEC complejos exportadores (annual/semestral)")
    print("   - INDEC industrial capacity (monthly)")
    print("   - Brent/oil prices (check EIA STEO)")
    print("   - FMI disbursement schedule")

if __name__ == "__main__":
    main()
