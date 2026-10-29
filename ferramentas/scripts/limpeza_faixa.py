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

OS parcial: cada obra tem uma OS mãe (a primeira criada, que descreve o trecho todo) e pode ter OS parciais criadas
depois (espelho, pagamento parcial, medição) que só detalham a execução da mãe. As parciais não pintam vãos, não somam
km e não contam como OS no mapa: ficam ligadas à mãe ("mae" na parcial, "parciais" na mãe). A obra vem do NUM_OBRA, do
número da obra no texto (041-25-00827), da OS citada no texto de uma parcial ("OS ETO-RD-GU 5455/2025") ou, sem nada
disso, de uma OS com o mesmo km na descrição que cobre os mesmos vãos (90% ou mais) e foi criada até 1 ano depois da mãe.

Atualização automática (sem o acervo de KMZ, scripts/atualiza_bases.py): OS que já está no limpeza.js publicado
mantém a posição de lá (os vãos, o método e os ativos) e só troca situação, datas e descrição; OS nova é localizada
pelas chaves do mapa e pelo índice de ativos do site (dados/ativos: transformadores, chaves e postes com coordenada),
no lugar do KMZ. OS que saiu da planilha sai do site.

Uso:
  python teste/ferramentas/limpeza_faixa.py "OS LIMPEZA DE FAIXA.xlsx" [saida.xlsx] [pasta_kmz ...]
  python scripts/limpeza_faixa.py --site <pasta do site> "OS LIMPEZA DE FAIXA.xlsx"   (sem KMZ: índice do site)
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
from datetime import date

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
    """OS que entra no mapa: pendente de qualquer equipe; executada só das EQUIPES; cancelada nunca."""
    eq = str(numero_os).split()[0] if str(numero_os).split() else ""
    return sit != "CANCELADA" and (sit != "EXECUTADA" or eq in EQUIPES)


def carrega_dados_js(al):
    s = open(os.path.join(RAIZ, "alimentadores", al, "dados.js"), encoding="utf8").read()
    return json.loads(s[s.index("=") + 1:].strip().rstrip(";"))


def usa_site(raiz):
    """Troca a pasta do site (o padrão é a pasta acima de ferramentas/, quando o script está em teste/ferramentas)."""
    global RAIZ
    RAIZ = os.path.abspath(raiz)


def chave_ativo(s):
    """Código como o índice de ativos do site guarda (igual a gera_trechos.chave_ativo)."""
    k = re.sub(r"[^0-9A-Z]", "", str(s).upper())
    return (k.lstrip("0") or "0") if k.isdigit() else k


def fatia(k):
    h = 0                                         # mesma conta de gera_trechos.fatia
    for ch in k:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return f"{h % 256:02x}"


PARCIAL = re.compile(r"parcial|parciais|medi[cç][aã]o|pagamento|espelho|final da obra|prim[aá]ria|principal|referente|o\.?s\.? (criada|gerada|aberta)", re.I)
REF_OS = re.compile(r"ETO-RD-([A-Z]{2})\s*0*(\d{1,6})\s*[/.\-]\s*(20\d\d)")
OBRA_TXT = (re.compile(r"(\d{3})-(\d{2})-(\d{5})"), re.compile(r"OBRA:?\s*0?(\d{9})\b", re.I))


def obra_de(o):
    """Número da obra (9 dígitos, sem zero à esquerda): NUM_OBRA da planilha ou o que a descrição cita."""
    ob = str(o.get("obra") or "").strip().lstrip("0")
    if ob.isdigit():
        return ob
    d = o.get("desc") or ""
    m = OBRA_TXT[0].search(d)
    if m:
        return ("".join(m.groups())).lstrip("0")
    m = OBRA_TXT[1].search(d)
    return m.group(1).lstrip("0") if m else None


def marca_parciais(d):
    """Liga cada OS parcial à OS mãe da obra no limpeza.js (dict d) e tira as parciais do mapa: mãe = primeira OS
    criada da obra; as outras ganham "mae", guardam seus vãos em "vaos_orig" e saem de d["vaos"] e d["sem_local"].
    Pode rodar de novo: os vãos de "vaos_orig" voltam antes de refazer os grupos."""
    os_ = d["os"]
    por_os = {o["os_completa"]: k for k, o in enumerate(os_)}
    ids = defaultdict(list)
    for v, ks in d["vaos"].items():
        for k in ks:
            ids[k].append(v)
    for k, o in enumerate(os_):                   # volta os vãos das parciais de uma rodada anterior
        for v in o.pop("vaos_orig", []):
            ids[k].append(v)
        o.pop("mae", None)
        o.pop("parciais", None)
    pai = {k: k for k in range(len(os_))}

    def raiz(k):
        while pai[k] != k:
            pai[k] = pai[pai[k]]
            k = pai[k]
        return k
    por_obra = defaultdict(list)
    for k, o in enumerate(os_):
        ob = obra_de(o)
        if ob:
            por_obra[ob].append(k)
        desc = o.get("desc") or ""
        if PARCIAL.search(desc):
            for m in REF_OS.finditer(desc):
                r = f"ETO-RD-{m.group(1)} {int(m.group(2)):06d}/{m.group(3)}"
                if r in por_os and por_os[r] != k:
                    pai[raiz(k)] = raiz(por_os[r])
                    break
    for ks in por_obra.values():
        for k in ks[1:]:
            pai[raiz(k)] = raiz(ks[0])
    # cópia da mãe sem número de obra nem palavra de parcial: mesmo km na descrição, mesmos vãos (90% ou mais) e criada até 1 ano depois
    cj = {k: set(v) for k, v in ids.items() if v}
    ordem = sorted(cj, key=lambda k: os_[k].get("criada") or "9999")
    for i, k in enumerate(ordem):
        for j in ordem[i + 1:]:
            a, b = os_[k].get("criada"), os_[j].get("criada")
            if not a or not b or (date.fromisoformat(b) - date.fromisoformat(a)).days > 365:
                continue
            if (os_[k].get("km_desc") and os_[k].get("km_desc") == os_[j].get("km_desc")
                    and len(cj[k] & cj[j]) >= 0.9 * max(len(cj[k]), len(cj[j]))):
                pai[raiz(j)] = raiz(k)
    grupos = defaultdict(list)
    for k in range(len(os_)):
        grupos[raiz(k)].append(k)
    parcial = set()
    for ks in grupos.values():
        if len(ks) < 2:
            continue
        mae = min(ks, key=lambda k: (os_[k].get("criada") or "9999", os_[k]["os_completa"]))
        os_[mae]["parciais"] = len(ks) - 1
        for k in ks:
            if k != mae:
                os_[k]["mae"] = os_[mae]["os_completa"]
                os_[k]["vaos_orig"] = sorted(ids.get(k, []))
                os_[k]["m"] = 0
                parcial.add(k)
    d["vaos"] = {}
    for k, vs in ids.items():
        if k not in parcial:
            for v in vs:
                d["vaos"].setdefault(v, []).append(k)
    d["vaos"] = {v: sorted(ks) for v, ks in d["vaos"].items()}
    d["sem_local"] = [k for k in range(len(os_)) if k not in parcial and not ids.get(k)]
    return d


class IndiceSite:
    """dados/ativos do site no lugar do KMZ: código -> [(lon, lat, tipo, alimentador), ...] (lido por pedaço)."""
    def __init__(self, raiz):
        self.pasta, self.cache = os.path.join(raiz, "dados", "ativos"), {}

    def busca(self, cod):
        k = chave_ativo(cod)
        f = fatia(k)
        if f not in self.cache:
            p = os.path.join(self.pasta, f + ".json")
            self.cache[f] = json.load(open(p, encoding="utf8")) if os.path.exists(p) else {}
        return [(lon, lat, tipo, al) for al, tipo, _t, _papel, lat, lon in self.cache[f].get(k, []) if lat is not None]


def publicado(al):
    """limpeza.js já publicado do alimentador: os_completa -> (registro, ids dos vãos)."""
    p = os.path.join(RAIZ, "alimentadores", al, "limpeza.js")
    if not os.path.exists(p):
        return {}
    s = open(p, encoding="utf8").read()
    d = json.loads(s[s.index("=") + 1:].strip().rstrip(";"))
    if not d:
        return {}
    ids = defaultdict(list)
    for v, ks in d["vaos"].items():
        for k in ks:
            ids[k].append(v)
    return {o["os_completa"]: (o, ids.get(k, []) or o.get("vaos_orig", [])) for k, o in enumerate(d["os"])}


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


ESQUEMAS = ("MC - LIMPEZA DE FAIXA RD", "MC - LIMPEZA DE FAIXA LD")


def le_os(arq):
    """Planilha de OS de limpeza de faixa (xlsx, aba Dados) ou o OS status inteiro (.parquet, todas as OS): fica só a
    limpeza de faixa de RD e de LD. NUM_OBRA vira texto sem casas decimais (o parquet guarda como número)."""
    if str(arq).lower().endswith(".parquet"):
        df = pd.read_parquet(arq)
        df = df[df["DESCESQUEMA"].isin(ESQUEMAS)].copy()
        for c in ("ELEMENTO", "ABRANGENCIA", "MONT_ABRANGENCIA", "DESCRICAO_OS", "ESTRUTURA", "ALIMENTADOR", "NUMERO_OS", "SITUACAO"):
            df[c] = df[c].astype(object).where(df[c].notna(), None)
        for c in ("DATA_CRIACAO", "INICIO_EXEC", "FIM_EXEC"):
            df[c] = pd.to_datetime(df[c], errors="coerce")
    else:
        df = pd.read_excel(arq, sheet_name="Dados", dtype={"ELEMENTO": str, "ABRANGENCIA": str, "MONT_ABRANGENCIA": str})
    if "NUM_OBRA" in df:
        df["NUM_OBRA"] = df["NUM_OBRA"].map(lambda v: "" if pd.isna(v) else str(int(float(v))) if str(v).replace(".", "", 1).isdigit() else str(v).strip())
    return df.reset_index(drop=True)


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
    df = le_os(xlsx)
    als = sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(RAIZ, "dados", "alimentadores", "*.json"))
                 if os.path.exists(os.path.join(RAIZ, "alimentadores", os.path.basename(p)[:-5], "dados.js")))
    redes = {a: Rede(a) for a in als}
    kmz = indice_kmz(pastas_kmz)
    site = None if pastas_kmz else IndiceSite(RAIZ)   # sem KMZ: o índice de ativos do site
    antes = {a: publicado(a) for a in als} if site else {}   # sem KMZ: OS já publicada mantém a posição
    id_vao = {a: {v[5]: i for i, v in enumerate(r.D["vaos"])} for a, r in redes.items()} if site else {}

    def candidatos(cod):
        """código -> [(lon, lat, tipo, alimentador)] do KMZ ou, sem KMZ, do índice do site."""
        if site:
            return site.busca(cod)
        return [kmz[cod]] if cod in kmz else []
    dono = defaultdict(set)  # chave -> alimentadores (do mapa) onde ela existe
    for a, r in redes.items():
        for c in r.chave_poste:
            dono[c].add(a)
    perto_cache = {}

    def ponto(rede, a, cod):
        """código do ativo -> (poste do mapa, como achou) ou None."""
        if cod in rede.chave_poste:
            return rede.chave_poste[cod], "chave no mapa"
        cand = [x for x in candidatos(cod) if x[3] == a]   # só ativo do próprio alimentador (no urbano as redes correm lado a lado)
        if cand:
            key = (a, cod)
            if key not in perto_cache:
                lon, lat, tipo, _ = cand[0]
                c0, c1, c2, c3 = rede.caixa
                if not (c0 <= lat <= c1 and c2 <= lon <= c3):
                    perto_cache[key] = None
                    return None
                p, d = rede.poste_perto(lon, lat)
                fonte = "do índice do site" if site else "do KMZ"
                perto_cache[key] = (p, f"{(tipo or 'ativo').lower()} {fonte} a {round(d)} m") if d <= RAIO_M else None
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
            for x in candidatos(c):
                if x[3] in redes and ponto(redes[x[3]], x[3], c):
                    alvo.add(x[3])
        if r.ALIMENTADOR in redes:
            alvo.add(r.ALIMENTADOR)
        num = re.sub(r"\s+", " ", str(r.NUMERO_OS))
        ja = {a for a, ant in antes.items() if num in ant}
        if ja:                                         # já publicada: fica só onde já estava
            alvo = ja

        for a in alvo:
            rede = redes[a]
            if num in antes.get(a, {}):                # já publicada: mantém a posição, atualiza o resto
                o, ids = antes[a][num]
                vs = sorted(id_vao[a][v] for v in ids if v in id_vao[a])
                reg = dict(o, obra=str(r.get("NUM_OBRA") or "").strip() if not pd.isna(r.get("NUM_OBRA")) else o.get("obra", ""), sit=r.SITUACAO, data=data_exec(r) if r.SITUACAO == "EXECUTADA" else None,
                           criada=r.DATA_CRIACAO.date().isoformat() if not pd.isna(r.DATA_CRIACAO) else None,
                           al_os=r.ALIMENTADOR, desc=re.sub(r"\s+", " ", desc.replace("�", "?")).strip()[:400],
                           m=round(sum(rede.D["vaos"][i][8] for i in vs), 1))
                por_al[a].append((reg, vs))
                continue
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
                "obra": str(r.get("NUM_OBRA") or "").strip() if not pd.isna(r.get("NUM_OBRA")) else "",
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
        marca_parciais(out)                         # parciais saem do mapa: a mãe vale pela obra toda
        idx = {v[5]: i for i, v in enumerate(rede.D["vaos"])}
        por_k = defaultdict(list)
        ult = {}
        for v, ks in out["vaos"].items():
            for k in ks:
                por_k[k].append(idx[v])
                if out["os"][k]["data"]:
                    ult[idx[v]] = max(ult.get(idx[v], ""), out["os"][k]["data"])
        lst = [(o, por_k[k]) for k, o in enumerate(out["os"])]
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


def so_parciais(raiz=RAIZ):
    """Aplica marca_parciais nos limpeza.js já gerados, sem a planilha de OS."""
    n = mae = parc = 0
    for f in sorted(glob.glob(os.path.join(raiz, "alimentadores", "*", "limpeza.js"))):
        s = open(f, encoding="utf8").read()
        d = json.loads(s[s.index("=") + 1:].strip().rstrip(";"))
        if not d:
            continue
        marca_parciais(d)
        n += len(d["os"])
        mae += sum(1 for o in d["os"] if o.get("parciais"))
        parc += sum(1 for o in d["os"] if o.get("mae"))
        open(f, "w", encoding="utf8").write("window.LIMPEZA = " + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + ";\n")
    return n, mae, parc


if __name__ == "__main__":
    if sys.argv[1] == "--parciais":
        n, mae, parc = so_parciais(*sys.argv[2:3])
        print(f"{n} OS: {mae} obras com parciais, {parc} OS parciais fora das contagens")
        sys.exit(0)
    if sys.argv[1] == "--so-equipes":
        antes, depois = so_equipes(*sys.argv[2:3])
        print(f"{antes} OS antes, {depois} depois (executadas só de {', '.join(EQUIPES)})")
        sys.exit(0)
    if sys.argv[1] == "--site":                    # sem KMZ: índice do site e posição já publicada
        usa_site(sys.argv[2])
        xlsx, saida, pastas = sys.argv[3], None, []
    else:
        xlsx, saida, pastas = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else None), sys.argv[3:]
    linhas, por_al = main(xlsx, pastas)
    if saida:
        with pd.ExcelWriter(saida) as w:
            pd.DataFrame(linhas).to_excel(w, sheet_name="Trechos", index=False)
            pd.DataFrame([{"Alimentador": a, **o, "ativos": "; ".join(o["ativos"])} for a, lst in por_al.items()
                          for o, _ in lst]).to_excel(w, sheet_name="OS localizadas", index=False)
    for a, lst in por_al.items():
        s = sum(1 for _, v in lst if not v)
        print(f"{a}: {len(lst)} OS ({len(lst) - s} no mapa, {s} sem localizacao)")
