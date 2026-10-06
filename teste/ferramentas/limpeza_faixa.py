"""Limpeza de faixa por trecho: lê a planilha de OS (MC - LIMPEZA DE FAIXA RD) e grava
teste/alimentadores/<AL>/limpeza.js com os vãos que cada OS cobriu, mais uma planilha-resumo por trecho.

Como a OS vira trecho no mapa (é aproximado: a OS não traz o traçado, só ativos e km):
  1. Ativos citados: códigos de 10 dígitos na DESCRICAO_OS, ELEMENTO, ABRANGENCIA e o Id da ESTRUTURA.
     Cada ativo vira um poste do mapa:
       - chave que existe no mapa (dados/alimentadores/<AL>.json) -> poste dela;
       - senão, ativo do KMZ do mesmo alimentador (chave 88, trafo, proteção, poste...)
         -> poste do mapa mais perto (até 300 m).
  2. Com 2+ pontos: marca a rede que liga esses pontos; se der bem menos que os km da descrição,
     continua a partir deles até completar os km.
     Com 1 ponto: desce a rede a partir dele (rumo ao fim da linha; em fim de linha, sobe) até somar os km da descrição
     ("aproximadamente 15,30 km"); sem km, marca o resto do trecho dele.
     Com 0: tenta MONT_ABRANGENCIA como ponto único; senão fica "sem localização".
Data da limpeza: FIM_EXEC; se o FIM vier mais de 60 dias depois do INICIO (fechamento em lote), usa INICIO_EXEC.
Só OS EXECUTADA conta como limpeza, e só das equipes de EQUIPES (prefixo do NUMERO_OS, ex.: "ETO-RD-GU 004972/2022");
CRIADA / A REPROGRAMAR / REPROGRAMADA aparecem como pendentes, de qualquer equipe.

Uso:
  python teste/ferramentas/limpeza_faixa.py "OS LIMPEZA DE FAIXA.xlsx" [saida.xlsx] [pasta_kmz ...]
  python teste/ferramentas/limpeza_faixa.py --so-equipes [pasta do site]   (aplica EQUIPES nos limpeza.js já gerados)
  pasta_kmz: pasta(s) com o export KMZ_GOOGLE_EARTH (SE_*/AL*/Equipamentos/..., Apoios_e_pontos/Postes.kmz).
"""
import glob
import heapq
import json
import math
import os
import re
import sys
import zipfile
from collections import defaultdict, deque

try:
    import pandas as pd
except ImportError:  # --so-equipes não precisa do pandas
    pd = None

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../teste
REGRA = {"T1": 3, "T2": 4, "T3": 5}
RAIO_M = 300  # distância máxima do ativo do KMZ até o poste do mapa
# equipes de rede de distribuição dos 8 polos: só a limpeza executada por elas conta
EQUIPES = ("ETO-RD-PA", "ETO-RD-PS", "ETO-RD-PO", "ETO-RD-GR", "ETO-RD-AR", "ETO-RD-AG", "ETO-RD-GU", "ETO-RD-DP")


def conta(sit, numero_os):
    """OS que entra no mapa: pendente de qualquer equipe; executada só das EQUIPES."""
    eq = str(numero_os).split()[0] if str(numero_os).split() else ""
    return sit != "EXECUTADA" or eq in EQUIPES


def carrega_dados_js(al):
    s = open(os.path.join(RAIZ, "alimentadores", al, "dados.js"), encoding="utf8").read()
    return json.loads(s[s.index("=") + 1:].strip().rstrip(";"))


def data_exec(r):
    ini, fim = r.INICIO_EXEC, r.FIM_EXEC
    if pd.isna(fim):
        return None
    if not pd.isna(ini) and (fim - ini).days > 60:
        return ini.date().isoformat()
    return fim.date().isoformat()


def km_da_descricao(desc):
    """1º valor de extensão escrito na descrição, em metros ('15,30 KM', '2,7km', '800 metros')."""
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:km|quil[oô]metros?)\b", desc, re.I)
    if m:
        return float(m.group(1).replace(",", ".")) * 1000
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:m|metros)\b", desc, re.I)
    return float(m.group(1).replace(",", ".")) if m else None


def indice_kmz(pastas):
    """código/Id do ativo -> (lon, lat, tipo de ativo, alimentador). Lê só equipamentos e postes."""
    idx = {}
    pm = re.compile(r"<Placemark>(.*?)</Placemark>", re.S)
    val = lambda b, k: (re.search(r'<Data name="' + k + r'"><value>(.*?)</value>', b) or [None, None])[1]
    for pasta in pastas:
        for f in glob.glob(os.path.join(pasta, "**", "*.kmz"), recursive=True):
            if not (("Equipamentos" in f and "Sentidos" not in f) or f.endswith("Postes.kmz")):
                continue
            z = zipfile.ZipFile(f)
            s = z.read(next(n for n in z.namelist() if n.endswith(".kml"))).decode("utf8", "replace")
            for b in pm.findall(s):
                c = re.search(r"<coordinates>\s*([-\d.]+),([-\d.]+)", b)
                if not c:
                    continue
                nome = re.search(r"<name>(\S+)", b)
                for k in {val(b, "Name"), val(b, "Id"), nome.group(1) if nome else None}:
                    if k:
                        idx.setdefault(k, (float(c.group(1)), float(c.group(2)), val(b, "Ativo"), val(b, "Alimentador Exportacao")))
    return idx


class Rede:
    def __init__(self, al):
        self.D = carrega_dados_js(al)
        js = json.load(open(os.path.join(RAIZ, "dados", "alimentadores", al + ".json"), encoding="utf8"))
        self.chave_poste = {c["nome"]: c["poste"] for c in js["chaves"]}
        self.viz = defaultdict(list)  # poste -> [(outro poste, índice do vão)]
        self.coord = {}  # poste -> (lat, lon)
        for i, v in enumerate(self.D["vaos"]):
            self.viz[v[6]].append((v[7], i))
            self.viz[v[7]].append((v[6], i))
            self.coord[v[6]] = (v[0], v[1])
            self.coord[v[7]] = (v[2], v[3])
        # árvore a partir do DJ: pai de cada poste e vão que sobe até ele
        raiz = self.D["trechos"][0]["inicio_poste"]
        self.pai = {raiz: (None, None)}
        fila = deque([raiz])
        while fila:
            p = fila.popleft()
            for q, i in self.viz[p]:
                if q not in self.pai:
                    self.pai[q] = (p, i)
                    fila.append(q)
        self.filhos = defaultdict(list)
        for q, (p, i) in self.pai.items():
            if p is not None:
                self.filhos[p].append((q, i))
        self.inicio_trecho = {t["inicio"]: k for k, t in enumerate(self.D["trechos"])}
        la = [c[0] for c in self.coord.values()]
        lo = [c[1] for c in self.coord.values()]
        folga = RAIO_M / 111320 * 1.5
        self.caixa = (min(la) - folga, max(la) + folga, min(lo) - folga, max(lo) + folga)

    def poste_perto(self, lon, lat):
        k = math.cos(math.radians(lat))
        melhor, dmin = None, float("inf")
        for p, (la, lo) in self.coord.items():
            d = ((lo - lon) * k) ** 2 + (la - lat) ** 2
            if d < dmin:
                melhor, dmin = p, d
        return melhor, math.sqrt(dmin) * 111320

    def entre(self, postes):
        """Vãos da rede que liga os postes (árvore mínima: vão com alguns, mas não todos, os postes abaixo)."""
        cont = defaultdict(int)
        for p in set(postes):
            while self.pai.get(p, (None,))[0] is not None:
                p, i = self.pai[p][0], self.pai[p][1]
                cont[i] += 1
        n = len(set(postes))
        return sorted(i for i, c in cont.items() if 0 < c < n)

    def trecho_de(self, p):
        desce = self.filhos.get(p, [])
        i = desce[0][1] if desce else self.pai.get(p, (None, None))[1]
        return self.D["vaos"][i][4] if i is not None else None

    def crescer(self, postes, vaos, metros):
        """Completa até `metros`: soma aos `vaos` os vãos mais perto dos `postes`, primeiro rumo ao fim
        da linha; se acabar a rede para baixo (fim de linha), cresce também para cima."""
        out = set(vaos)
        soma = sum(self.D["vaos"][i][8] for i in out)
        for so_descendo in (True, False):
            fila = [(0.0, p) for p in set(postes) | {x for i in out for x in self.D["vaos"][i][6:8]}]
            heapq.heapify(fila)
            visto = {p for _, p in fila}
            while fila and soma < metros:
                d, x = heapq.heappop(fila)
                lig = self.filhos.get(x, []) if so_descendo else self.viz[x]
                for q, i in lig:
                    if soma >= metros or i in out:
                        continue
                    out.add(i)
                    soma += self.D["vaos"][i][8]
                    if q not in visto:
                        visto.add(q)
                        heapq.heappush(fila, (d + self.D["vaos"][i][8], q))
            if soma >= metros:
                break
        return sorted(out)

    def zona(self, p, chave=None):
        """Sem km: o trecho que começa na chave; senão, o resto do trecho do ponto rumo ao fim da linha."""
        if chave in self.inicio_trecho:
            k = self.inicio_trecho[chave]
            return [i for i, v in enumerate(self.D["vaos"]) if v[4] == k]
        k = self.trecho_de(p)
        if not self.filhos.get(p):  # fim de linha: o trecho inteiro
            return [i for i, v in enumerate(self.D["vaos"]) if v[4] == k]
        out, pilha = [], [p]
        while pilha:
            x = pilha.pop()
            for q, i in self.filhos.get(x, []):
                if self.D["vaos"][i][4] == k:
                    out.append(i)
                    pilha.append(q)
        return sorted(out)


def main(xlsx, pastas_kmz=()):
    df = pd.read_excel(xlsx, sheet_name="Dados", dtype={"ELEMENTO": str, "ABRANGENCIA": str, "MONT_ABRANGENCIA": str})
    als = sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(RAIZ, "dados", "alimentadores", "*.json")))
    redes = {a: Rede(a) for a in als}
    kmz = indice_kmz(pastas_kmz)
    dono = defaultdict(set)  # chave -> alimentadores (do mapa) onde ela existe
    for a, r in redes.items():
        for c in r.chave_poste:
            dono[c].add(a)
    perto_cache = {}

    def ponto(rede, a, cod):
        """código do ativo -> (poste do mapa, como achou) ou None."""
        if cod in rede.chave_poste:
            return rede.chave_poste[cod], "chave no mapa"
        if cod in kmz and kmz[cod][3] == a:  # só ativo do próprio alimentador (no urbano as redes correm lado a lado)
            key = (a, cod)
            if key not in perto_cache:
                lon, lat, tipo, _ = kmz[cod]
                c0, c1, c2, c3 = rede.caixa
                if not (c0 <= lat <= c1 and c2 <= lon <= c3):
                    perto_cache[key] = None
                    return None
                p, d = rede.poste_perto(lon, lat)
                perto_cache[key] = (p, f"{(tipo or 'ativo').lower()} do KMZ a {round(d)} m") if d <= RAIO_M else None
            return perto_cache[key]
        return None

    por_al = {a: [] for a in als}
    for _, r in df.iterrows():
        if not conta(r.SITUACAO, r.NUMERO_OS):
            continue
        desc = str(r.DESCRICAO_OS) if not pd.isna(r.DESCRICAO_OS) else ""
        cod_desc = list(dict.fromkeys(re.findall(r"(?<!\d)\d{10}(?!\d)", desc)))
        extra = [str(r[c]).strip() for c in ("ELEMENTO", "ABRANGENCIA") if not pd.isna(r[c])]
        if isinstance(r.ESTRUTURA, str) and "-" in r.ESTRUTURA:
            extra.append(r.ESTRUTURA.split("-")[-1])
        mont = str(r.MONT_ABRANGENCIA).strip() if not pd.isna(r.MONT_ABRANGENCIA) else None
        metros = km_da_descricao(desc)

        alvo = {a for c in cod_desc + extra for a in dono.get(c, ())}
        for c in cod_desc + extra:  # ativo do KMZ que cai em cima de um alimentador do mapa
            if c in kmz and kmz[c][3] in redes and ponto(redes[kmz[c][3]], kmz[c][3], c):
                alvo.add(kmz[c][3])
        if r.ALIMENTADOR in redes:
            alvo.add(r.ALIMENTADOR)

        for a in alvo:
            rede = redes[a]
            pts = {}  # código -> (poste, como)
            for c in cod_desc:
                p = ponto(rede, a, c)
                if p:
                    pts[c] = p
            if len({p for p, _ in pts.values()}) < 2:
                for c in extra:
                    p = ponto(rede, a, c)
                    if p and c not in pts:
                        pts[c] = p
            postes = list(dict.fromkeys(p for p, _ in pts.values()))
            if len(postes) >= 2:
                vs, metodo = rede.entre(postes), "entre ativos"
                if metros and sum(rede.D["vaos"][i][8] for i in vs) < 0.67 * metros:
                    vs, metodo = rede.crescer(postes, vs, metros), f"entre ativos + continuação até {metros / 1000:g} km"
            elif len(postes) == 1:
                c0 = next(iter(pts))
                vs, metodo = ((rede.crescer(postes, [], metros), f"{metros / 1000:g} km a partir do ativo") if metros
                              else (rede.zona(postes[0], c0), "resto do trecho a partir do ativo"))
            elif mont and ponto(rede, a, mont):
                pts = {mont: ponto(rede, a, mont)}
                p0 = pts[mont][0]
                vs, metodo = ((rede.crescer([p0], [], metros), f"{metros / 1000:g} km a partir da chave a montante (aprox.)")
                              if metros else (rede.zona(p0, mont), "chave a montante (aprox.)"))
            else:
                vs, metodo = [], "sem localização"
            reg = {
                "os": r.NUMERO_OS.split()[-1] if isinstance(r.NUMERO_OS, str) else "",
                "os_completa": re.sub(r"\s+", " ", str(r.NUMERO_OS)),
                "sit": r.SITUACAO,
                "data": data_exec(r) if r.SITUACAO == "EXECUTADA" else None,
                "criada": r.DATA_CRIACAO.date().isoformat() if not pd.isna(r.DATA_CRIACAO) else None,
                "al_os": r.ALIMENTADOR,
                "desc": re.sub(r"\s+", " ", desc.replace("�", "?")).strip()[:400],
                "ativos": [f"{c} ({como})" for c, (_, como) in pts.items()],
                "metodo": metodo,
                "km_desc": round(metros / 1000, 2) if metros else None,
                "m": round(sum(rede.D["vaos"][i][8] for i in vs), 1),
            }
            por_al[a].append((reg, vs))

    hoje = pd.Timestamp.now().normalize()
    linhas = []
    for a, lst in por_al.items():
        rede = redes[a]
        lst.sort(key=lambda ov: ov[0]["data"] or ov[0]["criada"] or "")
        out = {"regra_anos": REGRA, "fonte": os.path.basename(xlsx), "gerado": hoje.date().isoformat(), "equipes": list(EQUIPES),
               "os": [o for o, _ in lst], "vaos": {}, "sem_local": []}
        ult = {}  # vão -> data da última limpeza executada
        for k, (o, vs) in enumerate(lst):
            if not vs:
                out["sem_local"].append(k)
            for i in vs:
                out["vaos"].setdefault(rede.D["vaos"][i][5], []).append(k)
                if o["data"]:
                    ult[i] = max(ult.get(i, ""), o["data"])
        open(os.path.join(RAIZ, "alimentadores", a, "limpeza.js"), "w", encoding="utf8").write(
            "window.LIMPEZA = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")

        # resumo por trecho para a planilha
        for k, t in enumerate(rede.D["trechos"]):
            classe = t["nome"].split("-")[0]
            anos = REGRA[classe]
            vs = [i for i, v in enumerate(rede.D["vaos"]) if v[4] == k]
            ext = sum(rede.D["vaos"][i][8] for i in vs)
            m = {"em dia": 0, "vence em 12 meses": 0, "vencida": 0, "sem registro": 0}
            for i in vs:
                d = ult.get(i)
                if not d:
                    m["sem registro"] += rede.D["vaos"][i][8]
                    continue
                venc = pd.Timestamp(d) + pd.DateOffset(years=anos)
                m["vencida" if venc < hoje else "vence em 12 meses" if venc < hoje + pd.DateOffset(years=1) else "em dia"] += rede.D["vaos"][i][8]
            datas = sorted({ult[i] for i in vs if i in ult})
            oss = sorted({o["os_completa"] for o, v in lst if set(v) & set(vs)})
            linhas.append({
                "Alimentador": a, "Trecho": t["nome"], "Classe": classe, "Periodicidade (anos)": anos,
                "Início": t["inicio"], "Fim": " / ".join(t["fim"]), "Extensão (km)": round(ext / 1000, 2),
                "Última limpeza": datas[-1] if datas else "", "Limpeza mais antiga no trecho": datas[0] if datas else "",
                "Próxima (pela última)": (pd.Timestamp(datas[-1]) + pd.DateOffset(years=anos)).date().isoformat() if datas else "",
                **{f"km {s}": round(v / 1000, 2) for s, v in m.items()},
                "% limpo no prazo": round(100 * (m["em dia"] + m["vence em 12 meses"]) / ext) if ext else 0,
                "OS": ", ".join(oss),
            })
    return linhas, por_al


def so_equipes(raiz=RAIZ):
    """Aplica EQUIPES nos limpeza.js já gerados, sem refazer a localização das OS (cada OS é localizada sozinha,
    então tirar uma OS depois dá o mesmo que não ler a linha dela)."""
    antes = depois = 0
    for f in sorted(glob.glob(os.path.join(raiz, "alimentadores", "*", "limpeza.js"))):
        s = open(f, encoding="utf8").read()
        d = json.loads(s[s.index("=") + 1:].strip().rstrip(";"))
        if not d:
            continue
        fica = [k for k, o in enumerate(d["os"]) if conta(o["sit"], o["os_completa"])]
        novo = {k: i for i, k in enumerate(fica)}
        antes, depois = antes + len(d["os"]), depois + len(fica)
        d["os"] = [d["os"][k] for k in fica]
        vaos = {v: [novo[k] for k in ks if k in novo] for v, ks in d["vaos"].items()}
        d["vaos"] = {v: ks for v, ks in vaos.items() if ks}
        d["sem_local"] = [novo[k] for k in d["sem_local"] if k in novo]
        d["equipes"] = list(EQUIPES)
        open(f, "w", encoding="utf8").write("window.LIMPEZA = " + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + ";\n")
    return antes, depois


if __name__ == "__main__":
    if sys.argv[1] == "--so-equipes":
        antes, depois = so_equipes(*sys.argv[2:3])
        print(f"{antes} OS antes, {depois} depois (executadas só de {', '.join(EQUIPES)})")
        sys.exit(0)
    xlsx = sys.argv[1]
    saida = sys.argv[2] if len(sys.argv) > 2 else None
    linhas, por_al = main(xlsx, sys.argv[3:])
    if saida:
        with pd.ExcelWriter(saida) as w:
            pd.DataFrame(linhas).to_excel(w, sheet_name="Trechos", index=False)
            pd.DataFrame([{"Alimentador": a, **o, "ativos": "; ".join(o["ativos"])} for a, lst in por_al.items()
                          for o, _ in lst]).to_excel(w, sheet_name="OS localizadas", index=False)
    for a, lst in por_al.items():
        s = sum(1 for _, v in lst if not v)
        print(f"{a}: {len(lst)} OS ({len(lst) - s} no mapa, {s} sem localizacao)")
