#!/usr/bin/env python3
"""Coteja la maquetación REAL de PDF y Word renderizado mediante LibreOffice.

El test no compara píxel a píxel dos motores de tipografía distintos:
mide posiciones de la cabecera, continuidad de los filetes exteriores
y ausencia de una línea horizontal interior. Conserva los PNG como evidencia.
"""
import html
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[2] / "artifacts" / "visual"
PDF = OUT / "examinator-print.pdf"
DOCX = OUT / "examinator-visual.docx"
WORD_PDF = OUT / "examinator-visual.pdf"

def run(*args):
    p = subprocess.run(args, capture_output=True, text=True, check=False)
    if p.returncode != 0:
        raise AssertionError(f"Error {p.returncode}: {' '.join(map(str,args))}\n{p.stderr[-2500:]}")
    return p.stdout

def words(pdf):
    xml = run("pdftotext", "-f", "1", "-l", "1", "-bbox", str(pdf), "-")
    tree = ET.fromstring(xml)
    result = []
    for elem in tree.iter():
        if elem.tag.endswith("}word") or elem.tag == "word":
            value = html.unescape("".join(elem.itertext())).strip()
            if value:
                result.append((value, float(elem.attrib["xMin"]),float(elem.attrib["yMin"]),
                               float(elem.attrib["xMax"]),float(elem.attrib["yMax"])))
    return result

def first(ws, term):
    for w in ws:
        if re.sub(r"[^\w]", "", w[0]).casefold() == term.casefold():
            return w
    raise AssertionError(f"No se encuentra {term!r} en las posiciones del PDF: {[x[0] for x in ws[:45]]}")

def raster(pdf, tag):
    prefix = OUT / tag
    run("pdftoppm", "-f", "1", "-l", "1", "-r", "125", "-singlefile", "-png",
        str(pdf), str(prefix))
    result = prefix.with_suffix(".png")
    if not result.exists():
        raise AssertionError(f"Falta captura de {tag}: {result}")
    return Image.open(result).convert("L")

def line_spans(img):
    """Detecta trazos horizontales largos en la zona inicial de la hoja."""
    w,h = img.size
    dark = img.load()
    spans=[]
    for y in range(int(h*.035), int(h*.19)):
        start = None
        best = (0, 0)
        # Un borde fino gris puede antialias; admite huecos de 1 px.
        for x in range(int(w*.05), int(w*.95)):
            ink = dark[x,y] < 205
            if ink:
                if start is None: start = x
            elif start is not None:
                if x-start > best[1]-best[0]: best=(start,x)
                start=None
        if start is not None and w-start > best[1]-best[0]: best=(start,w)
        if best[1]-best[0] >= w*.58:
            spans.append((y,best[0],best[1]))
    # Un único borde antialias ocupa dos o tres filas: agrupar.
    groups=[]
    for item in spans:
        if not groups or item[0] > groups[-1][-1][0]+3: groups.append([item])
        else: groups[-1].append(item)
    return [(round(sum(x[0] for x in g)/len(g),1),max(x[2]-x[1] for x in g)) for g in groups]

def validate():
    assert PDF.is_file() and DOCX.is_file(), "La suite de navegador no generó PDF/Word reales"
    # Perfil de LibreOffice aislado; no altera el equipo ni los archivos del usuario.
    run("libreoffice","-env:UserInstallation=file:///tmp/examinator-visual-lo",
        "--headless","--convert-to","pdf:writer_pdf_Export","--outdir",str(OUT),str(DOCX))
    assert WORD_PDF.exists(), "LibreOffice no produjo PDF del Word"
    left=words(PDF)
    right=words(WORD_PDF)
    for label in ("Examen","final","Nombre","Fecha"):
        a,b=first(left,label),first(right,label)
        assert abs(a[1]-b[1])<38 and abs(a[2]-b[2])<42, (
            f"Cabecera {label}: posiciones incompatibles PDF {(a[1],a[2])} / Word {(b[1],b[2])}"
        )
    for label in ("Latín","trimestre"):
        first(left,label);first(right,label)
    for name,src in [("impresion",PDF),("word",WORD_PDF)]:
        image=raster(src,"cabecera-"+name)
        spans=line_spans(image)
        assert len(spans)>=2, f"{name}: falta borde exterior, líneas halladas: {spans}"
        # El título del texto (bajo la cabecera) también tiene dos filetes
        # próximos; son legítimos y NO deben confundirse con bordes internos.
        ws = words(src)
        factor=image.width/595.28  # PDF A4: puntos a píxeles rasterizados
        exam_y=first(ws,"Examen")[2]*factor
        name_bottom=first(ws,"Nombre")[4]*factor
        above=[s for s in spans if s[0]<exam_y-2]
        below=[s for s in spans if s[0]>name_bottom+2]
        assert above and below, f"{name}: borde sin correspondencia con las dos filas: {spans}"
        top=above[-1][0]
        bottom=below[0][0]
        assert 18<bottom-top<160, f"{name}: marco de altura incorrecta: {spans}"
        internal=[s for s in spans if top+4<s[0]<bottom-4]
        assert not internal, f"{name}: se detectan líneas interiores: {internal}"
        print(name,"marco exterior (píxeles):",(top,bottom),"otras líneas:",spans)
    print("OK: visualizaciones reales de Word y PDF; cabeceras, márgenes y marco exterior coherentes.")

if __name__ == "__main__":
    try: validate()
    except Exception as e:
        print("FAIL visual documentos:",e,file=sys.stderr)
        raise
