import requests
import csv
import sys

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

STREETS = [
    "Sandacherweg",
    "Töniweg",
    "Bezirksweg",
    "Schüracherweg",
    "Vorhardstrasse",
]
STREET_HOUSENUMBER_FILTER = {
    "Reinerstrasse": "145",
}

CITY = "Rüfenach"
POSTCODE = "5235"

# Build query: fetch addr:housenumber nodes/ways in area
def build_query():
    # Bounding box covering PLZ 5235 (Rüfenach + Böttstein): south,west,north,east
    bbox = "47.5,8.1,47.65,8.35"
    area_query = f"[out:json][timeout:60];\n(\n"

    for street in STREETS:
        area_query += f'  node["addr:street"="{street}"]["addr:housenumber"]({bbox});\n'
        area_query += f'  way["addr:street"="{street}"]["addr:housenumber"]({bbox});\n'

    for street, hn in STREET_HOUSENUMBER_FILTER.items():
        area_query += f'  node["addr:street"="{street}"]["addr:housenumber"="{hn}"]({bbox});\n'
        area_query += f'  way["addr:street"="{street}"]["addr:housenumber"="{hn}"]({bbox});\n'

    area_query += ");\nout center;\n"
    return area_query


def fetch(query):
    resp = requests.post(
        OVERPASS_URL,
        data={"data": query},
        timeout=90,
        headers={"User-Agent": "chabisberg-fetcher/1.0"},
    )
    resp.raise_for_status()
    return resp.json()


def extract_rows(data):
    rows = []
    seen = set()
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        street = tags.get("addr:street", "")
        housenumber = tags.get("addr:housenumber", "")
        postcode = tags.get("addr:postcode", POSTCODE)
        city = tags.get("addr:city", CITY)

        if el["type"] == "node":
            lat = el.get("lat")
            lon = el.get("lon")
        elif el["type"] == "way":
            center = el.get("center", {})
            lat = center.get("lat")
            lon = center.get("lon")
        else:
            continue

        if not street or not housenumber:
            continue

        # Filter to Rüfenach only
        if postcode and postcode != POSTCODE:
            continue
        if city and "fena" not in city.lower() and postcode != POSTCODE:
            continue

        # Normalize city name
        city = CITY

        key = (street, housenumber)
        if key in seen:
            continue
        seen.add(key)

        adresse = f"{street} {housenumber}, {postcode} {city}"
        rows.append({
            "Adresse": adresse,
            "Strasse": street,
            "Hausnummer": housenumber,
            "Längengrad": lon,
            "Breitengrad": lat,
            "PLZ": postcode,
            "Ort": city,
        })

    rows.sort(key=lambda r: (r["Strasse"], r["Hausnummer"].zfill(10)))
    return rows


def main():
    print("Querying Overpass API...", flush=True)
    query = build_query()
    data = fetch(query)
    rows = extract_rows(data)

    if not rows:
        print("No results found. Check area name or street spelling.")
        sys.exit(1)

    out_file = "adressen_ruefenach.csv"
    with open(out_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["Adresse", "Strasse", "Hausnummer", "Längengrad", "Breitengrad", "PLZ", "Ort"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nGespeichert: {out_file} ({len(rows)} Adressen)\n")
    print(f"{'Strasse':<20} {'Nr':<6} {'Lat':>10} {'Lon':>11}")
    print("-" * 52)
    for r in rows:
        print(f"{r['Strasse']:<20} {r['Hausnummer']:<6} {str(r['Breitengrad']):>10} {str(r['Längengrad']):>11}")


if __name__ == "__main__":
    main()
