"""
convert_excel_to_json.py
Convierte el Excel de ganadería a un JSON compatible con la app PWA offline.
Uso:
  python convert_excel_to_json.py "TuArchivo.xlsx"

Salida:
  ganaderia_import.json
"""
import sys, re, json, datetime
from pathlib import Path
import openpyxl

def norm(s):
    if s is None: return ""
    return str(s).strip()

def parse_date(v):
    if v is None or v == "": return ""
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.date().isoformat() if isinstance(v, datetime.datetime) else v.isoformat()
    s = str(v).strip()
    # Try yyyy-mm-dd
    m = re.match(r"^\d{4}-\d{2}-\d{2}$", s)
    if m: return s
    # Try dd-mm-yy or dd-mm-yyyy
    m = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100: y += 2000
        try:
            return datetime.date(y, mo, d).isoformat()
        except ValueError:
            return ""
    return ""

def uid(prefix, i):
    return f"{prefix}_import_{i}"

def find_header_map(row):
    # row: list of cell values
    mp = {}
    for idx, v in enumerate(row):
        key = norm(v).lower()
        if key:
            mp[key] = idx
    return mp

def safe_get(row, mp, *names):
    for n in names:
        i = mp.get(n.lower())
        if i is not None and i < len(row):
            return row[i]
    return None

def main():
    if len(sys.argv) < 2:
        print("Uso: python convert_excel_to_json.py \"archivo.xlsx\"")
        sys.exit(1)
    xlsx = Path(sys.argv[1]).expanduser().resolve()
    if not xlsx.exists():
        print(f"No existe: {xlsx}")
        sys.exit(2)

    wb = openpyxl.load_workbook(xlsx, data_only=True)

    data = {k: [] for k in [
        "users","animals","milk","healthEvents","boosters","repro",
        "salesCheese","buyMilk","transMilk","fixedCosts"
    ]}

    # Default user
    data["users"].append({"id":"user_import","name":"Importado"})

    # --- Animals from Bovinos_Activos
    if "Bovinos_Activos" in wb.sheetnames:
        ws = wb["Bovinos_Activos"]
        header = [ws.cell(1,c).value for c in range(1, 30)]
        mp = find_header_map(header)
        idx = 0
        for r in range(2, ws.max_row+1):
            row = [ws.cell(r,c).value for c in range(1, 30)]
            arete = safe_get(row, mp, "arete")
            name = safe_get(row, mp, "nombre/arete", "nombre")
            finca = safe_get(row, mp, "finca")
            sexo = safe_get(row, mp, "sexo")
            raza = safe_get(row, mp, "raza")
            if arete is None and name is None:
                continue
            arete_s = norm(arete)
            # If arete empty but name is numeric
            if not arete_s and re.fullmatch(r"\d+", norm(name)):
                arete_s = norm(name)
                name = ""
            if not arete_s and not norm(name):
                continue
            idx += 1
            data["animals"].append({
                "id": uid("ani", idx),
                "arete": arete_s,
                "name": norm(name),
                "finca": norm(finca),
                "sexo": norm(sexo) or "Hembra",
                "raza": norm(raza),
                "createdBy": "user_import",
                "createdAt": 0
            })

    # Helper: map arete->animalId and name->animalId
    by_arete = {a["arete"]: a["id"] for a in data["animals"] if a.get("arete")}
    by_name = {a["name"].lower(): a["id"] for a in data["animals"] if a.get("name")}

    def resolve_animal_id(v):
        s = norm(v)
        if not s: return ""
        # numeric arete
        digits = re.sub(r"[^\d]", "", s)
        if digits and digits in by_arete:
            return by_arete[digits]
        if s in by_arete:
            return by_arete[s]
        low = s.lower()
        if low in by_name:
            return by_name[low]
        return ""

    # --- Milk from Produccion_Diaria (only rows with Fecha)
    if "Produccion_Diaria" in wb.sheetnames:
        ws = wb["Produccion_Diaria"]
        header = [ws.cell(1,c).value for c in range(1, 30)]
        mp = find_header_map(header)
        idx = 0
        for r in range(2, ws.max_row+1):
            row = [ws.cell(r,c).value for c in range(1, 30)]
            fecha = safe_get(row, mp, "fecha")
            arete = safe_get(row, mp, "arete")
            nombre = safe_get(row, mp, "nombre")
            lm = safe_get(row, mp, "litros mañana", "litros manana")
            lt = safe_get(row, mp, "litros tarde")
            if fecha is None and (lm is None and lt is None):
                continue
            date_iso = parse_date(fecha)
            if not date_iso:
                continue
            animal_id = resolve_animal_id(arete) or resolve_animal_id(nombre)
            if not animal_id:
                continue
            m = float(lm or 0) if lm is not None else 0.0
            t = float(lt or 0) if lt is not None else 0.0
            idx += 1
            data["milk"].append({
                "id": uid("milk", idx),
                "date": date_iso,
                "animalId": animal_id,
                "m": m,
                "t": t,
                "total": m+t,
                "createdBy":"user_import",
                "createdAt":0
            })

    # --- Medicamentos -> healthEvents + boosters (extract refuerzo dates from Plan text)
    if "Medicamentos" in wb.sheetnames:
        ws = wb["Medicamentos"]
        header = [ws.cell(1,c).value for c in range(1, 40)]
        mp = find_header_map(header)
        ev_i = 0
        boo_i = 0
        for r in range(2, ws.max_row+1):
            row = [ws.cell(r,c).value for c in range(1, 40)]
            finca = safe_get(row, mp, "finca")
            nombre = safe_get(row, mp, "nombre")
            fecha = safe_get(row, mp, "fecha")
            proc = safe_get(row, mp, "medicamento/procedimiento", "medicamento", "procedimiento")
            plan = safe_get(row, mp, "plan")
            if proc is None and plan is None and fecha is None:
                continue
            date_iso = parse_date(fecha) or ""
            animal_id = resolve_animal_id(nombre)
            if not animal_id:
                # try if nombre cell is arete number
                animal_id = resolve_animal_id(str(nombre))
            if not animal_id:
                continue
            ev_i += 1
            event_id = uid("hev", ev_i)
            data["healthEvents"].append({
                "id": event_id,
                "animalId": animal_id,
                "procedure": norm(proc),
                "date": date_iso,
                "createdBy":"user_import",
                "createdAt":0
            })
            text = f"{norm(plan)} {norm(proc)}"
            # Find all date mentions in text
            for m in re.finditer(r"(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})", text):
                d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
                if y < 100: y += 2000
                try:
                    ref = datetime.date(y, mo, d).isoformat()
                except ValueError:
                    continue
                boo_i += 1
                data["boosters"].append({
                    "id": uid("boo", boo_i),
                    "eventId": event_id,
                    "animalId": animal_id,
                    "procedure": norm(proc) or "Refuerzo",
                    "refDate": ref,
                    "finca": norm(finca),
                    "status": "pending",
                    "createdBy":"user_import",
                    "createdAt":0
                })

    # --- Repro from Control_Reproductivo (if filled)
    if "Control_Reproductivo" in wb.sheetnames:
        ws = wb["Control_Reproductivo"]
        header = [ws.cell(1,c).value for c in range(1, 40)]
        mp = find_header_map(header)
        rep_i = 0
        for r in range(2, ws.max_row+1):
            row = [ws.cell(r,c).value for c in range(1, 40)]
            arete = safe_get(row, mp, "arete")
            nombre = safe_get(row, mp, "nombre")
            parto = safe_get(row, mp, "fecha último parto", "fecha ultimo parto")
            celo = safe_get(row, mp, "fecha último celo", "fecha ultimo celo")
            insem = safe_get(row, mp, "fecha inseminación", "fecha inseminacion")
            pre = safe_get(row, mp, "diagnóstico preñez (si/no)", "diagnostico preñez (si/no)", "diagnóstico preñez", "diagnostico preñez")
            if arete is None and nombre is None and parto is None and celo is None and insem is None and pre is None:
                continue
            animal_id = resolve_animal_id(arete) or resolve_animal_id(nombre)
            if not animal_id:
                continue
            rep_i += 1
            data["repro"].append({
                "id": uid("rep", rep_i),
                "animalId": animal_id,
                "parto": parse_date(parto),
                "celo": parse_date(celo),
                "insem": parse_date(insem),
                "pre": norm(pre).upper(),
                "createdBy":"user_import",
                "createdAt":0
            })

    # --- Finance
    def import_simple(sheet, target, mapping):
        if sheet not in wb.sheetnames: return
        ws = wb[sheet]
        header = [ws.cell(1,c).value for c in range(1, 30)]
        mp = find_header_map(header)
        i=0
        for r in range(2, ws.max_row+1):
            row=[ws.cell(r,c).value for c in range(1, 30)]
            if all(v is None or str(v).strip()=="" for v in row[:len(header)]):
                continue
            rec={}
            for out_key, in_names in mapping.items():
                rec[out_key]=safe_get(row, mp, *in_names)
            i += 1
            yield i, rec

    # Venta_Queso
    i=0
    for idx, rec in import_simple("Venta_Queso","salesCheese",{
        "date":["fecha"],
        "client":["cliente"],
        "lbs":["libras"],
        "price":["precio (cop)","precio"],
        "total":["total (cop)","total"]
    }) or []:
        date_iso=parse_date(rec["date"])
        if not date_iso: continue
        lbs=float(rec["lbs"] or 0)
        price=float(rec["price"] or 0)
        total=float(rec["total"] or (lbs*price))
        data["salesCheese"].append({"id":uid("sale", idx),"date":date_iso,"client":norm(rec["client"]),
                                  "lbs":lbs,"price":price,"total":total,"createdBy":"user_import","createdAt":0})

    # Compra_Leche
    for idx, rec in import_simple("Compra_Leche","buyMilk",{
        "period":["periodo"],
        "liters":["litros"],
        "vl":["valor/litro (cop)","valor/litro"],
        "total":["total (cop)","total"]
    }) or []:
        if not norm(rec["period"]) and rec["liters"] is None: continue
        liters=float(rec["liters"] or 0)
        vl=float(rec["vl"] or 0)
        total=float(rec["total"] or (liters*vl))
        data["buyMilk"].append({"id":uid("buy", idx),"period":norm(rec["period"]),
                               "liters":liters,"vl":vl,"total":total,"createdBy":"user_import","createdAt":0})

    # Transporte_Leche
    for idx, rec in import_simple("Transporte_Leche","transMilk",{
        "period":["periodo"],
        "value":["valor transporte (cop)","valor transporte"],
        "qty":["cantidad"],
        "total":["total (cop)","total"]
    }) or []:
        if not norm(rec["period"]) and rec["value"] is None: continue
        value=float(rec["value"] or 0)
        qty=float(rec["qty"] or 0)
        total=float(rec["total"] or (value*qty))
        data["transMilk"].append({"id":uid("tm", idx),"period":norm(rec["period"]),
                                 "value":value,"qty":qty,"total":total,"createdBy":"user_import","createdAt":0})

    # Gastos_Fijos
    for idx, rec in import_simple("Gastos_Fijos","fixedCosts",{
        "concept":["concepto"],
        "value":["valor mensual (cop)","valor mensual"],
        "notes":["notas"]
    }) or []:
        if not norm(rec["concept"]) and rec["value"] is None: continue
        value=float(rec["value"] or 0)
        data["fixedCosts"].append({"id":uid("fx", idx),"concept":norm(rec["concept"]),
                                  "value":value,"createdBy":"user_import","createdAt":0})

    out = {"exportedAt": datetime.datetime.utcnow().isoformat()+"Z", "data": data}
    Path("ganaderia_import.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print("OK -> ganaderia_import.json creado")

if __name__ == "__main__":
    main()
