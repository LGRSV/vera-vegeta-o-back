#!/usr/bin/env python3
"""VERA · trechos por município: KMLs do Daimon → regras da skill trechos-alimentador (T1, T2, T2-A…, T3-A…)
→ municípios (malha do IBGE, amostra a cada 20 m) → dados JSON, páginas Município → Alimentador → Trecho, KMZ e
relatório de validação. Determinístico: as mesmas entradas geram os mesmos arquivos.

    python scripts/gera_trechos.py --kml <pasta com SE-XXXX_Circ-*.kml> --vegetacao <clone do vera-vegetacao> \\
        --saida <pasta do site> [--critica 'Critica-*.txt'] [--malha arquivo.geojson]
        [--todos | --municipio Araguaína | --alimentador AL04010004 ...]
    python scripts/gera_trechos.py --saida <pasta do site> --validar           só confere dados e páginas já gerados
    python scripts/gera_trechos.py --saida <pasta do site> --so-interface      refaz páginas, índice e relatório
    python scripts/gera_trechos.py --saida <pasta do site> --comparar <clone gh-pages publicado>

Sem --malha, baixa a malha municipal do Tocantins da API do IBGE na 1ª vez e guarda em --cache.
Com --so-interface, as divisas no mapa do alimentador (municipios.js) saem da malha de --malha ou do --cache; baixa
só se alguma página ainda está sem elas.
Nada é publicado: o script só grava em --saida. Ver scripts/README-gera_trechos.md.
"""
import argparse
import glob
import gzip
import hashlib
import html
import json
import math
import re
import shutil
import sys
import tempfile
import unicodedata
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
from alimentador import critica, daimon, regras, trechos  # noqa: E402  (regras da skill, sem cópia)
from alimentador.gerar_trechos import nomes as nomes_kml  # noqa: E402

PKG = RAIZ / 'alimentador'
IBGE_MALHA = ('https://servicodados.ibge.gov.br/api/v3/malhas/estados/17?intrarregiao=municipio'
              '&formato=application/vnd.geo+json&qualidade=maxima')
IBGE_NOMES = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados/17/municipios'
IBGE_ORIGEM = 'IBGE, API de malhas v3 (qualidade máxima)'
PASSO_M = 20          # amostra ao longo de cada vão (README do vera-vegetacao)
MIN_M = 100           # extensão mínima dentro do município para o alimentador aparecer nele
LON, LAT = (-51.0, -45.0), (-14.0, -5.0)     # caixa do Tocantins, para conferir a ordem [lon, lat]
CLASSES = ('T1', 'T2', 'T3')


FASE_TXT = {1: 'monofásico', 2: 'bifásico', 3: 'trifásico'}


def fase_txt(letras: str) -> str:
    """'ABC' -> trifásico, 'AB' -> bifásico, 'A' -> monofásico."""
    return FASE_TXT.get(len(letras), 'não informado')


def classe(nome):
    return nome.split('-')[0]


def slug(texto):
    t = unicodedata.normalize('NFKD', texto).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')


def grava_json(caminho, obj):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


# ---------------------------------------------------------------- malha municipal

class Malha:
    """Ponto → código IBGE do município. Ray casting com as arestas de cada polígono em faixas de latitude."""
    G = 0.25

    def __init__(self, municipios, origem):
        self.nome, self.origem, self.polis, self.grade = {}, origem, [], {}
        self.aneis, self._simples, self._donos = {}, {}, None     # contornos para as divisas no mapa (divisas_js)
        for cod, nome, poligonos in sorted(municipios):
            self.nome[cod] = nome
            self.aneis.setdefault(cod, []).extend(tuple((p[0], p[1]) for p in anel) for aneis in poligonos for anel in aneis)
            for aneis in poligonos:
                arestas = [(x1, y1, x2, y2) for anel in aneis for (x1, y1, *_), (x2, y2, *_) in zip(anel, anel[1:])
                           if y1 != y2]
                if not arestas:
                    continue
                xs = [c for a in arestas for c in (a[0], a[2])]
                ys = [c for a in arestas for c in (a[1], a[3])]
                caixa = (min(xs), min(ys), max(xs), max(ys))
                nf = max(1, len(arestas) // 4)
                h = (caixa[3] - caixa[1]) / nf or 1.0
                faixas = [[] for _ in range(nf)]
                for a in arestas:
                    for k in range(int((min(a[1], a[3]) - caixa[1]) / h), min(nf - 1, int((max(a[1], a[3]) - caixa[1]) / h)) + 1):
                        faixas[k].append(a)
                i = len(self.polis)
                self.polis.append((caixa, h, faixas, cod))
                for gx in range(math.floor(caixa[0] / self.G), math.floor(caixa[2] / self.G) + 1):
                    for gy in range(math.floor(caixa[1] / self.G), math.floor(caixa[3] / self.G) + 1):
                        self.grade.setdefault((gx, gy), []).append(i)
        self.caixas = {cod: (min(p[0] for a in aneis for p in a), min(p[1] for a in aneis for p in a),
                             max(p[0] for a in aneis for p in a), max(p[1] for a in aneis for p in a))
                       for cod, aneis in self.aneis.items() if aneis}

    def municipio(self, lon, lat):
        for i in self.grade.get((math.floor(lon / self.G), math.floor(lat / self.G)), ()):
            caixa, h, faixas, cod = self.polis[i]
            if not (caixa[0] <= lon <= caixa[2] and caixa[1] <= lat <= caixa[3]):
                continue
            dentro = False
            for x1, y1, x2, y2 in faixas[min(len(faixas) - 1, int((lat - caixa[1]) / h))]:
                if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
                    dentro = not dentro
            if dentro:
                return cod
        return None


def carregar_malha(arquivo, cache):
    if arquivo:
        geo, nomes, origem = json.loads(Path(arquivo).read_text(encoding='utf-8')), {}, Path(arquivo).name
    else:
        cache = Path(cache)
        cache.mkdir(parents=True, exist_ok=True)
        for url, nome in ((IBGE_MALHA, 'malha-TO.geojson'), (IBGE_NOMES, 'municipios-TO.json')):
            if not (cache / nome).exists():
                print(f'baixando {url}')
                with urllib.request.urlopen(url, timeout=120) as r:
                    corpo = r.read()
                if corpo[:2] == b'\x1f\x8b':          # a API do IBGE às vezes responde em gzip
                    corpo = gzip.decompress(corpo)
                (cache / nome).write_bytes(corpo)
        geo = json.loads((cache / 'malha-TO.geojson').read_text(encoding='utf-8'))
        nomes = {str(m['id']): m['nome'] for m in json.loads((cache / 'municipios-TO.json').read_text(encoding='utf-8'))}
        origem = IBGE_ORIGEM
    municipios = []
    for f in geo['features']:
        p = f['properties']
        cod = str(p.get('codarea') or p.get('id') or p.get('CD_MUN'))
        g = f['geometry']
        municipios.append((cod, nomes.get(cod) or p.get('name') or p.get('nome') or p.get('NM_MUN') or cod,
                           g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]))
    return Malha(municipios, origem)


def malha_salva(arquivo, cache, saida):
    """--so-interface: a malha de --malha ou a do cache. Baixa do IBGE só se alguma página medida com a malha do IBGE
    ainda está sem as divisas (municipios.js); sem internet, segue sem elas (as já gravadas ficam como estão)."""
    if arquivo or all((Path(cache) / f).exists() for f in ('malha-TO.geojson', 'municipios-TO.json')):
        return carregar_malha(arquivo, cache)
    sem = lambda al: not (saida / 'alimentadores' / al / 'municipios.js').exists() or \
        (saida / 'alimentadores' / al / 'municipios.js').read_text(encoding='utf-8') == 'window.MUNICIPIOS = null;\n'
    if not any(c['validacao']['status'] != 'falha' and c['origem'].get('malha') == IBGE_ORIGEM and sem(c['alimentador'])
               for c in carregar_dados(saida)):
        return None
    try:
        return carregar_malha(None, cache)
    except (OSError, ValueError) as e:
        print(f'aviso: malha do IBGE não baixou ({e}); páginas sem as divisas dos municípios')
        return None


def por_municipio(malha, a, b, ext):
    """Metros do vão (a, b em [lat, lon]) em cada município, amostrando a cada PASSO_M (meio de cada pedaço)."""
    n = max(1, math.ceil(ext / PASSO_M))
    m = {}
    for k in range(n):
        f = (k + .5) / n
        cod = malha.municipio(a[1] + (b[1] - a[1]) * f, a[0] + (b[0] - a[0]) * f)
        m[cod] = m.get(cod, 0) + ext / n
    return m


# ---------------------------------------------------------------- divisas no mapa do alimentador

DIVISA_TOL = (25, 40, 60, 100, 150, 250, 400)   # m do Douglas–Peucker: a 1ª que deixa o arquivo abaixo de DIVISA_MAX
DIVISA_MAX = 60000                              # bytes do municipios.js de um alimentador (rede muito grande passa)
DIVISA_FOLGA = (3000, 15000)                    # área em volta da rede: 35% do lado maior, entre 3 e 15 km
KX, KY = 111320 * math.cos(math.radians(10)), 110574     # m por grau no Tocantins (folga e tolerância)


def _dp(pts, tol):
    """Douglas–Peucker (pontas mantidas), com a distância em metros."""
    manter, pilha, t2 = [False] * len(pts), [(0, len(pts) - 1)], (tol / KY) ** 2
    manter[0] = manter[-1] = True
    while pilha:
        i, j = pilha.pop()
        ax, ay = pts[i][0] * KX / KY, pts[i][1]
        dx, dy = pts[j][0] * KX / KY - ax, pts[j][1] - ay
        l2, dmax, k = dx * dx + dy * dy, t2, None
        for m in range(i + 1, j):
            px, py = pts[m][0] * KX / KY - ax, pts[m][1] - ay
            f = max(0, min(1, (px * dx + py * dy) / l2)) if l2 else 0
            d = (px - f * dx) ** 2 + (py - f * dy) ** 2
            if d > dmax:
                dmax, k = d, m
        if k is not None:
            manter[k] = True
            pilha += [(i, k), (k, j)]
    return [p for p, f in zip(pts, manter) if f]


def _simplifica(malha, cod, tol):
    """Anéis do município simplificados por arco (pedaço de divisa com os mesmos vizinhos), cada arco num sentido fixo:
    a divisa de dois municípios sai com os mesmos pontos nos dois. Devolve também os lados (simplificados) que nenhum
    outro município usa: a divisa do Tocantins."""
    if (cod, tol) in malha._simples:
        return malha._simples[cod, tol]
    if malha._donos is None:                         # aresta → municípios que a usam (uma vez por malha)
        malha._donos = {}
        for c, aneis in malha.aneis.items():
            for anel in aneis:
                for p, q in zip(anel, anel[1:]):
                    malha._donos.setdefault((min(p, q), max(p, q)), set()).add(c)
    out, uf = [], set()
    for anel in malha.aneis[cod]:
        anel = list(anel) + ([anel[0]] if anel[0] != anel[-1] else [])
        if len(anel) < 4:
            continue
        dono = [frozenset(malha._donos.get((min(p, q), max(p, q)), ())) for p, q in zip(anel, anel[1:])]
        cortes = [i for i in range(len(dono)) if dono[i] != dono[i - 1]]
        if not cortes:                               # anel inteiro com o mesmo vizinho: começa no menor ponto
            k = anel.index(min(anel[:-1]))
            arco = anel[k:-1] + anel[:k + 1]
            if arco[1] > arco[-2]:
                arco.reverse()
            novo = _dp(arco, tol)
            if len(dono[0]) == 1:
                uf |= {(min(p, q), max(p, q)) for p, q in zip(novo, novo[1:])}
        else:
            cortes0 = cortes[0]
            gira = anel[cortes0:-1] + anel[:cortes0 + 1]
            cortes = [i - cortes0 for i in cortes] + [len(gira) - 1]
            novo = [gira[0]]
            for i, j in zip(cortes, cortes[1:]):
                arco = gira[i:j + 1]
                pedaco = _dp(arco, tol) if arco[0] <= arco[-1] else _dp(arco[::-1], tol)[::-1]
                if len(dono[(i + cortes0) % len(dono)]) == 1:
                    uf |= {(min(p, q), max(p, q)) for p, q in zip(pedaco, pedaco[1:])}
                novo += pedaco[1:]
        if len(novo) >= 4:
            out.append(novo)
    malha._simples[cod, tol] = out, uf
    return out, uf


def _cruza(p, q, eixo, val):
    if q < p:                                        # a mesma conta nos dois sentidos (divisa em comum sai igual)
        p, q = q, p
    f = (val - p[eixo]) / (q[eixo] - p[eixo])
    r = [0.0, 0.0]
    r[eixo], r[1 - eixo] = val, p[1 - eixo] + (q[1 - eixo] - p[1 - eixo]) * f
    return tuple(r)


def _recorta(anel, caixa):
    """Sutherland–Hodgman: o anel recortado pela caixa (oeste, sul, leste, norte) continua fechado; os lados novos ficam
    em cima da borda da caixa (a página não desenha esses)."""
    pts = anel[:-1]
    for eixo, val, sentido in ((0, caixa[0], 1), (0, caixa[2], -1), (1, caixa[1], 1), (1, caixa[3], -1)):
        dentro, novo = lambda p: (p[eixo] - val) * sentido >= 0, []
        for i, q in enumerate(pts):
            p = pts[i - 1]
            if dentro(q) != dentro(p):
                novo.append(_cruza(p, q, eixo, val))
            if dentro(q):
                novo.append(q)
        pts = novo
    return pts + pts[:1]


def _lado_uf(p, q, lados_uf, na_borda):
    """O lado p→q do anel recortado é (parte de) um lado da divisa do Tocantins?"""
    if (min(p, q), max(p, q)) in lados_uf:
        return True
    if not (na_borda(p) or na_borda(q)):
        return False
    mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2       # pedaço recortado: o meio dele fica em cima do lado original
    for a, b in lados_uf:
        if min(a[0], b[0]) - 1e-9 <= mx <= max(a[0], b[0]) + 1e-9 and min(a[1], b[1]) - 1e-9 <= my <= max(a[1], b[1]) + 1e-9 \
                and abs((b[0] - a[0]) * (my - a[1]) - (b[1] - a[1]) * (mx - a[0])) <= 1e-9 * math.hypot(b[0] - a[0], b[1] - a[1]):
            return True
    return False


def divisas_js(malha, c):
    """municipios.js do alimentador: window.MUNICIPIOS = [{cod, nome, corte, linhas: [[[lat, lon], ...], ...], uf}] com
    os municípios que a rede cruza e os vizinhos que aparecem em volta dela. Anéis fechados, recortados na área em volta
    da rede (`corte`, [[sul, oeste], [norte, leste]]) e simplificados (Douglas–Peucker, DIVISA_TOL), 5 casas decimais.
    `uf` (só quando há): [anel, de, até] = os lados de linhas[anel][de] a linhas[anel][até] que são a divisa do Tocantins
    (lado que nenhum outro município da malha usa)."""
    xs = [x for v in c['vaos'] for x in (v[0], v[2])]
    ys = [y for v in c['vaos'] for y in (v[1], v[3])]
    folga = min(DIVISA_FOLGA[1], max(DIVISA_FOLGA[0], .35 * max((max(xs) - min(xs)) * KX, (max(ys) - min(ys)) * KY)))
    caixa = (round(min(xs) - folga / KX, 5), round(min(ys) - folga / KY, 5),
             round(max(xs) + folga / KX, 5), round(max(ys) + folga / KY, 5))
    ordem = {m['cod']: i for i, m in enumerate(c['municipios'])}     # os da rede primeiro (mais rede antes)
    cods = sorted((cod for cod, b in malha.caixas.items()
                   if b[0] <= caixa[2] and b[2] >= caixa[0] and b[1] <= caixa[3] and b[3] >= caixa[1]),
                  key=lambda cod: (ordem.get(cod, len(ordem)), slug(malha.nome[cod]), cod))
    na_borda = lambda p: p[0] in (caixa[0], caixa[2]) or p[1] in (caixa[1], caixa[3])
    for tol in DIVISA_TOL:
        muns = []
        for cod in cods:
            linhas, uf = [], []
            aneis, lados_uf = _simplifica(malha, cod, tol)
            for anel in aneis:
                r, eh_uf = [], []
                pts = _recorta(anel, caixa)
                for k, (x, y) in enumerate(pts):
                    p = [round(y, 5), round(x, 5)]
                    if r and p == r[-1]:
                        continue
                    if r:
                        eh_uf.append(_lado_uf(pts[k - 1], pts[k], lados_uf, na_borda))
                    r.append(p)
                area = sum(a[1] * b[0] - b[1] * a[0] for a, b in zip(r, r[1:]))
                if len(r) >= 4 and abs(area) > 1e-9:
                    for k, f in enumerate(eh_uf):         # trechos seguidos de lados da divisa do TO
                        if f and (k == 0 or not eh_uf[k - 1]):
                            uf.append([len(linhas), k, k + 1])
                        elif f:
                            uf[-1][2] = k + 1
                    linhas.append(r)
            if linhas:
                muns.append(dict(cod=cod, nome=malha.nome[cod], corte=[[caixa[1], caixa[0]], [caixa[3], caixa[2]]],
                                 linhas=linhas, **({'uf': uf} if uf else {})))
        js = 'window.MUNICIPIOS = ' + json.dumps(muns, ensure_ascii=False, separators=(',', ':')) + ';\n'
        if len(js.encode('utf-8')) <= DIVISA_MAX:
            break
    return js


# ---------------------------------------------------------------- fontes

class Fontes:
    def __init__(self, a):
        self.kmls = {}
        for pasta in a.kml or []:
            for k in sorted(Path(pasta).rglob('*_Circ-*.kml')):
                al = nomes_kml(k)[1]
                if al in self.kmls:
                    print(f'aviso: {al} em dois KMLs; fica {self.kmls[al]}')
                    continue
                self.kmls[al] = k
        veg = Path(a.vegetacao) if a.vegetacao else None
        self.veg = veg
        self.indice = {}
        if veg and (veg / 'dados' / 'indice.json').exists():
            for polo, als in json.loads((veg / 'dados' / 'indice.json').read_text(encoding='utf-8')).items():
                for al, d in als.items():
                    self.indice[al] = dict(d, polo=polo)
        arqs = sorted({f for p in a.critica or [] for f in glob.glob(p)})
        if a.critica and not arqs:
            raise SystemExit(f'nenhum arquivo da Crítica em {a.critica}')
        self.critica_arqs = arqs
        self.nae_filtro = a.nae
        self.critica = critica.ler(arqs) if arqs else None
        # todos os meses de competência da Crítica: o seletor mostra cada mês, mesmo com zero ocorrência
        self.meses = sorted({f'20{d["DTA_CMPT_HDE"].strip()[6:8]}-{d["DTA_CMPT_HDE"].strip()[3:5]}'
                             for ls in (self.critica or {}).values() for d in ls})
        self._pontos = {}

    def postes(self, al):
        d = self.indice.get(al)
        arq = self.veg / 'dados' / d['polo'] / f'{al}.json' if d and self.veg else None
        if not arq or not arq.exists():
            return None, None
        dados = json.loads(arq.read_text(encoding='utf-8'))
        if isinstance(dados, dict):
            dados = dados.get('postes') or dados.get('features') or next(iter(dados.values()))
        return dados, f'vera-vegetacao dados/{d["polo"]}/{al}.json'

    def pontos(self, al):
        if al not in self._pontos:
            self._pontos[al] = critica.pontos_kml(self.kmls[al])
        return self._pontos[al]

    def outros(self, al):
        fontes = self

        class Outros:                                  # carrega os KMLs vizinhos só se alguma ocorrência precisar
            def items(self):
                return ((x, fontes.pontos(x)) for x in sorted(fontes.kmls) if x != al)
        return Outros()


# ---------------------------------------------------------------- processamento de um alimentador

def kmz_fixo(nos, res, al, destino, nomes_fixos=None):
    """KMZ dos trechos (da skill) regravado com data fixa no zip, para sair igual a cada execução."""
    with tempfile.TemporaryDirectory() as d:
        trechos.kmz(nos, res, al, Path(d) / 'x.kmz', nomes_fixos)
        doc = zipfile.ZipFile(Path(d) / 'x.kmz').read('doc.kml')
    destino.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destino, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(zipfile.ZipInfo('doc.kml', (1980, 1, 1, 0, 0, 0)), doc, zipfile.ZIP_DEFLATED)


def sem_topologia(pontos, res, cel=0.002):
    """Pontos do KML que a topologia não usa (chave de tipo não reconhecido, sem suporte ou fora da árvore):
    [código, lon, lat, trecho do vão com a ponta mais perto, distância em m]. É a conta de critica.por_trecho (todas as
    pontas, sem limite); guardada no JSON, a Crítica nova acha o trecho deles sem o KML (scripts/atualiza_critica.py)."""
    usados, vs = {a['nome'] for a in res['ativos']}, res['vaos']
    grade = {}
    for i, v in enumerate(vs):
        for q in (v['a'], v['b']):
            grade.setdefault((int(q[0] // cel), int(q[1] // cel)), set()).add(i)
    out = []
    for nome, p in sorted(pontos.items()):
        if nome in usados or not vs:
            continue
        gy, gx, cand, r, melhor = int(p[0] // cel), int(p[1] // cel), set(), 0, None
        lim = cel * 111195 * math.cos(math.radians(abs(p[0]) + 1)) * 0.999      # metros de uma célula, por baixo
        while True:
            cand |= {i for dy in range(-r, r + 1) for dx in range(-r, r + 1) if max(abs(dy), abs(dx)) == r
                     for i in grade.get((gy + dy, gx + dx), ())}
            if cand:
                melhor = min((min(regras.haversine(p, vs[i]['a']), regras.haversine(p, vs[i]['b'])), i) for i in cand)
                if melhor[0] <= r * lim:                 # fora dos anéis 0..r, tudo está a mais de r células
                    break
            r += 1
            if r > 3000:                                 # ponto muito longe da rede: todas as pontas
                melhor = min((min(regras.haversine(p, v['a']), regras.haversine(p, v['b'])), i) for i, v in enumerate(vs))
                break
        out.append([nome, round(p[1], 7), round(p[0], 7), vs[melhor[1]]['trecho'], round(melhor[0], 1)])
    return out


def processar(al, fontes, malha, saida, data_ref):
    kml = fontes.kmls[al]
    se, _ = nomes_kml(kml)
    ind = fontes.indice.get(al, {})
    postes, origem_postes = fontes.postes(al)
    base = dict(versao=1, alimentador=al, se=se, se_nome=ind.get('se', ''), polo=ind.get('polo', ''),
                origem=dict(kml=kml.name, sha256=hashlib.sha256(kml.read_bytes()).hexdigest()[:16],
                            data=data_ref or date.fromtimestamp(kml.stat().st_mtime).isoformat(),
                            postes=origem_postes, critica=[Path(f).name for f in fontes.critica_arqs] or None,
                            nae_filtro=fontes.nae_filtro if fontes.critica_arqs else None,
                            malha=malha.origem if malha else None))
    try:
        nos, vaos, raiz, info = daimon.ler_circuito(kml, postes)
        res = regras.analisar(nos, vaos, raiz)
        # segmentar também entra no try: a checagem de coerência dela levanta
        # ValueError e, fora daqui, derrubava a rodada inteira em vez de
        # marcar só este alimentador como falha.
        ts = trechos.segmentar(nos, res)
        base['origem']['observacao'] = info.get('observacao') or None
    except (ValueError, regras.RedeInvalida) as e:
        c = dict(base, erro=str(e), validacao=dict(status='falha', criticas=[f'não processado: {e}'], avisos=[]),
                 chaves_sem_topologia=[[n, round(p[1], 7), round(p[0], 7), None, None]      # 'hoje no X' da Crítica
                                       for n, p in sorted(fontes.pontos(al).items())])
        grava_json(saida / 'dados' / 'alimentadores' / f'{al}.json', c)
        return c
    oc = None
    if fontes.critica is not None:
        oc = critica.ocorrencias(fontes.critica.get(al, []))
        if fontes.nae_filtro == 'arvore':
            oc = [o for o in oc if critica.arvore_na_rede(o)]
        oc = critica.por_trecho(oc, res, ts, fontes.pontos(al), fontes.outros(al))
    ts, D = trechos.dados_mapa(nos, res, oc)
    if oc is not None:
        D['nae']['meses'] = fontes.meses
    idx = {t['nome']: i for i, t in enumerate(ts)}
    avisos = info['avisos'] + res['avisos']

    # municípios de cada vão (amostra a cada 20 m) e de cada trecho
    mun_vao, m_trecho, m_total, limitrofes = [], [{} for _ in ts], {}, []
    for i, v in enumerate(res['vaos']):
        m = por_municipio(malha, v['a'], v['b'], v['ext']) if malha else {None: v['ext']}
        principal = max(sorted(m, key=str), key=lambda c: m[c])
        mun_vao.append(principal)
        if len(m) > 1:
            limitrofes.append(dict(vao=i, trecho=v['trecho'], m={str(c): round(x, 1) for c, x in sorted(m.items(), key=str)}))
        for c, x in m.items():
            t = m_trecho[idx[v['trecho']]]
            t[c] = t.get(c, 0) + x
            m_total[c] = m_total.get(c, 0) + x

    nome_mun = (lambda c: malha.nome.get(c, 'fora do Tocantins')) if malha else (lambda c: 'sem malha')
    municipios = [dict(cod=c, nome=nome_mun(c), m=round(x, 1)) for c, x in
                  sorted(m_total.items(), key=lambda kv: (-kv[1], str(kv[0]))) if c is not None]

    # caminho a partir do DJ e confiança da classificação
    por_nome = {t['nome']: t for t in ts}

    def caminho(t):
        c = [t['nome']]
        while por_nome[c[-1]]['pai']:
            c.append(por_nome[c[-1]]['pai'])
        return c[::-1]

    def confianca(t):
        motivos = [a for a in avisos if re.search(rf'\b{re.escape(t["inicio"])}\b', a)]
        if t['nome'] == 'T2' and any('sem 2º religador' in a for a in avisos):
            motivos.append('alimentador sem 2º religador: fim do T2 decidido pela regra')
        return ('revisar', motivos) if motivos else ('alta', [])

    # fases de cada trecho (metros por combinação; a predominante nomeia)
    f_trecho = [{} for _ in ts]
    for v in res['vaos']:
        f = info.get('fases_vaos', {}).get((v['_p'], v['_c']), '')
        d = f_trecho[idx[v['trecho']]]
        d[f] = d.get(f, 0) + v['ext']

    for i, t in enumerate(D['trechos']):           # a página lê o D, não o canônico
        t['fase'] = fase_txt(max(sorted(f_trecho[i]), key=lambda k: f_trecho[i][k]) if f_trecho[i] else '')
        t['fases'] = {(k or 'não informado'): round(x, 1) for k, x in sorted(f_trecho[i].items())}

    ativos = {a['nome'] for a in res['ativos']}
    sem_corresp = [n for n in info['nomes_chaves'] if n not in ativos and n not in info['abertas']
                   and n[:2] not in ('90', '31', '68') and not n.startswith('DJ_')]
    canon_trechos = []
    for i, t in enumerate(ts):
        conf, motivos = confianca(t)
        canon_trechos.append(dict(
            nome=t['nome'], classe=classe(t['nome']), ordem=i, zona=t['zona'], tipo=t['tipo'], tronco=t['tronco'],
            inicio=dict(chave=t['inicio'], tipo=t['inicio_tipo'], poste=t['inicio_poste'],
                        lonlat=[t['inicio_lon'], t['inicio_lat']]),
            fim=t['fim'], fim_lonlat=[[p[1], p[0]] for p in t['fim_pts']], pai=t['pai'], caminho=caminho(t),
            passa=t['passa'], derivacoes=t['derivacoes'], ext_m=t['ext'], vaos=t['qtd'],
            municipios={str(c): round(x, 1) for c, x in sorted(m_trecho[i].items(), key=str)},
            fase=fase_txt(max(sorted(f_trecho[i]), key=lambda k: f_trecho[i][k]) if f_trecho[i] else ''),
            fases={(k or 'não informado'): round(x, 1) for k, x in sorted(f_trecho[i].items())},
            confianca=conf, motivos=motivos))

    resumo = dict(extensao_m=round(res['total_m'], 1), trechos=len(ts),
                  religadores=sum(a['tipo'] == '79' for a in res['ativos']),
                  fusiveis=sum(a['tipo'] in regras.FUSIVEIS for a in res['ativos']),
                  seccionamentos=sum(a['tipo'] == 'SEC' for a in res['ativos']),
                  fusiveis_tronco=sum(a['tipo'] == 'FTR' for a in res['ativos']))
    for k in CLASSES:
        resumo[k] = dict(n=sum(classe(t['nome']) == k for t in ts),
                         m=round(sum(t['ext'] for t in ts if classe(t['nome']) == k), 1))
    por_fase = {}
    for d in f_trecho:
        for k, x in d.items():
            t = fase_txt(k)
            por_fase[t] = por_fase.get(t, 0) + x
    resumo['fases'] = {k: round(x, 1) for k, x in sorted(por_fase.items(), key=lambda kv: -kv[1])}
    soltos = sum(int(x) for a in avisos for x in re.findall(r'(\d+) ponto\(s\) sem ligação', a))
    c = dict(base, dj=info['dj'], resumo=resumo, municipios=municipios,
             fora_do_to_m=round(m_total.get(None, 0), 1) if malha else None,
             trechos=canon_trechos,
             vaos=[[v['a'][1], v['a'][0], v['b'][1], v['b'][0], idx[v['trecho']], round(v['ext'], 1), v['ini'], v['fim'],
                    mun_vao[i]] for i, v in enumerate(res['vaos'])],
             chaves=[dict(nome=a['nome'], tipo=a['tipo'], lonlat=[a['lon'], a['lat']], poste=a['poste'])
                     for a in res['ativos']],
             chaves_sem_topologia=sem_topologia(fontes.pontos(al), res),
             nae=D.get('nae'), limitrofes=limitrofes, continuidades_estimadas=[],
             topologia=dict(pontos_sem_ligacao=soltos, vaos_fora_da_arvore=info['fora_da_arvore'],
                            chaves_abertas=info['abertas'], chaves_sem_correspondencia=sem_corresp,
                            postes_ligados=info['postes_ligados']),
             avisos=avisos)
    c['validacao'] = validar(c)
    grava_json(saida / 'dados' / 'alimentadores' / f'{al}.json', c)
    pasta = saida / 'alimentadores' / al
    D['meta'] = meta_interface(c)
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / 'dados.js').write_text('window.D = ' + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n',
                                    encoding='utf-8')
    kmz_fixo(nos, res, al, pasta / f'{al}-trechos.kmz')
    return c


def meta_interface(c):
    """O que a página do alimentador usa além do D do mapa: municípios, resumo, avisos, validação e origem."""
    return dict(al=c['alimentador'], se=c['se'], se_nome=c['se_nome'], polo=c['polo'], origem=c['origem'],
                resumo=c['resumo'], avisos=c['avisos'], validacao=c['validacao'],
                municipios=[dict(m, slug=slug(m['nome'])) for m in c['municipios']],
                trecho_mun={t['nome']: sorted(k for k in t['municipios'] if k != 'None') for t in c['trechos']},
                continuidades_estimadas=c['continuidades_estimadas'])


# ---------------------------------------------------------------- validação

def validar(c):
    """Falha crítica tira o alimentador das páginas; aviso aparece na página e no relatório."""
    cri, av = [], []
    if not c.get('dj'):
        cri.append('sem DJ (raiz)')
    nomes = [t['nome'] for t in c['trechos']]
    if len(nomes) != len(set(nomes)):
        cri.append('nomes de trecho repetidos')
    if any(v[4] is None for v in c['vaos']):
        cri.append('vãos sem trecho')
    soma = sum(t['ext_m'] for t in c['trechos'])
    if abs(soma - c['resumo']['extensao_m']) > 0.05 * len(c['trechos']) + 0.2:   # cada trecho vem arredondado a 0,1 m
        cri.append(f'soma dos trechos ({soma:.1f} m) ≠ extensão total ({c["resumo"]["extensao_m"]:.1f} m)')
    if not all(LON[0] <= v[0] <= LON[1] and LAT[0] <= v[1] <= LAT[1] and LON[0] <= v[2] <= LON[1]
               and LAT[0] <= v[3] <= LAT[1] for v in c['vaos']):
        cri.append('coordenada fora do Tocantins ou fora da ordem [lon, lat]')
    if c.get('fora_do_to_m'):
        (cri if c['fora_do_to_m'] > c['resumo']['extensao_m'] / 2 else av).append(
            f'{c["fora_do_to_m"]:.0f} m fora da malha municipal do Tocantins')
    seg = [tuple(sorted(((v[0], v[1]), (v[2], v[3])))) for v in c['vaos']]
    if len(seg) != len(set(seg)):
        av.append(f'{len(seg) - len(set(seg))} vão(s) duplicado(s)')
    tp = c['topologia']
    if tp['pontos_sem_ligacao']:
        av.append(f'{tp["pontos_sem_ligacao"]} ponto(s) sem ligação com o DJ (fora da classificação)')
    if tp['chaves_sem_correspondencia']:
        av.append(f'{len(tp["chaves_sem_correspondencia"])} chave(s) do KML sem vão correspondente na rede')
    if not c['origem']['postes']:
        av.append('sem arquivo de postes: nós sem número de poste')
    if c['limitrofes']:
        av.append(f'{len(c["limitrofes"])} vão(s) na divisa entre municípios (medidos por amostragem de {PASSO_M} m)')
    # chave de proteção que não abriu trecho: era o defeito que mais escondia
    # erro de fonte (90 religadores sumindo sem um aviso)
    inicios = {t['inicio']['chave'] for t in c['trechos']}
    orfas = [a['nome'] for a in c['chaves']
             if a['tipo'] in regras.FUSIVEIS + ('79',) and a['nome'] not in inicios]
    if orfas:
        rl = [n for n in orfas if n[:2] == '79']
        av.append(f'{len(orfas)} chave(s) de proteção sem trecho (não seccionam a rede): '
                  + ', '.join(orfas[:10]) + ('…' if len(orfas) > 10 else '')
                  + (f' — {len(rl)} religador(es)' if rl else ''))
    # Rede descartada: o Dijkstra joga fora o que não chega no DJ, e isso não
    # era checado em lugar nenhum — havia página publicada com 0,30 km
    # classificados de uma rede de dezenas de km.
    fora = tp.get('vaos_fora_da_arvore') or 0
    dentro = len(c['vaos'])
    perda = fora / (fora + dentro) if (fora + dentro) else 0
    if perda:
        texto = f'{perda * 100:.0f}% da rede fora da árvore do DJ ({fora} de {fora + dentro} vãos)'
        (cri if perda > 0.25 else av).append(texto)

    # Crítica quando a classificação está estruturalmente quebrada: trecho
    # grande demais em média (um T1 engolindo o alimentador), rede
    # classificada irrelevante, ou religador no cadastro sem nenhum T2.
    km = c['resumo']['extensao_m'] / 1000
    n = c['resumo']['trechos'] or 1
    if km > 5 and km / n > 50:
        cri.append(f'classificação colapsada: {km / n:.0f} km por trecho ({n} trecho(s) para {km:.1f} km)')
    # (um alimentador pequeno de verdade é legítimo; o que denuncia os casos
    # de 7 m publicados é a perda de rede acima, não o tamanho absoluto)
    n_rl = sum(1 for a in c['chaves'] if a['tipo'] == '79')
    if n_rl and not c['resumo']['T2']['n']:
        cri.append(f'{n_rl} religador(es) no cadastro e nenhum T2: nenhum deles secciona a rede')
    if any(t['confianca'] != 'alta' for t in c['trechos']):
        av.append('trechos a revisar: ' + ', '.join(t['nome'] for t in c['trechos'] if t['confianca'] != 'alta'))
    # Avisos do daimon/regras (tronco decidido sem 2º religador, seccionamento,
    # laço fora da árvore, chave em paralelo) também contam: sem isso um
    # alimentador cujo tronco saiu de heurística aparecia como "ok".
    for a in c.get('avisos') or []:
        if a not in av:
            av.append(a)
    return dict(status='falha' if cri else 'aviso' if av else 'ok', criticas=cri, avisos=av)


# ---------------------------------------------------------------- interface

def ativos_interface(saida):
    """Assets compartilhados: CSS e JS do mapa saem do modelo da skill (mapa_trechos.html), sem cópia à mão."""
    modelo = (PKG / 'mapa_trechos.html').read_text(encoding='utf-8')
    css = re.search(r'<style>\n(.*?)</style>', modelo, re.S).group(1)
    js = re.search(r'<script>\nconst D = %%DADOS%%;\n(.*?)</script>', modelo, re.S).group(1)
    a = saida / 'assets'
    (a / 'leaflet').mkdir(parents=True, exist_ok=True)
    for f in ('leaflet.js', 'leaflet.css', 'LICENSE'):
        shutil.copyfile(PKG / 'leaflet' / f, a / 'leaflet' / f)
    (a / 'alimentador.css').write_text(css, encoding='utf-8')
    (a / 'alimentador.js').write_text('const D = window.D;\n' + js, encoding='utf-8')
    for f in ('extras.js', 'municipios.js', 'chaves.js', 'site.css', 'mapa-municipios.js', 'limpeza.js', 'inspecao.js', 'manutencao.js', 'executadas.js',
              'telacheia.js', 'busca-ativo.js', 'ranking-polos.js', 'croqui.js', 'croqui-modelo.js', 'menu.js'):
        shutil.copyfile(PKG / 'site' / f, a / f)
    pacote_trechos(a / 'scripts' / 'trechos-kml.zip')
    return modelo


LEIA_ME = '''Trechos a partir do KML (T1, T2, T2-A..., T3-A...)

Precisa só do Python 3.9 ou mais novo (nenhuma biblioteca extra).

1. Descompacte este arquivo: fica a pasta "alimentador".
2. Na pasta onde está "alimentador", rode:
       python -m alimentador.gerar_trechos SE-XXXX_Circ-AL01005098.kml --saida saida
   Vários de uma vez:
       python -m alimentador.gerar_trechos "kmls/*.kml" --saida saida
3. Em saida/<alimentador>/ ficam:
       mapa-trechos.html          mapa com satélite e a lista de trechos (abre no navegador)
       <alimentador>-trechos.kmz  os mesmos trechos para o Google Earth

Opcional:
   --postes <pasta ou JSON>        número dos postes (ex.: vera-vegetacao/dados)
   --critica "Critica-*.txt"       NAE por trecho e mês, da Crítica
   --mes 2026-01                   mostra no terminal o NAE por trecho daquele mês

O KML é o do alimentador no formato do Daimon (nome SE-XXXX_Circ-<alimentador>.kml).
As regras de divisão estão no começo de alimentador/regras.py.
'''


def pacote_trechos(destino):
    """Zip do script que divide o KML do alimentador em trechos (menu do site): o pacote alimentador da skill, do jeito
    que está agora (mesmas regras do site), com data fixa para sair igual a cada execução."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    arqs = [f'{n}.py' for n in ('__init__', 'critica', 'daimon', 'gerar_trechos', 'regras', 'trechos')] + \
        ['mapa_trechos.html', 'site_indice.html', 'leaflet/leaflet.css', 'leaflet/leaflet.js', 'leaflet/LICENSE']
    def item(nome):
        zi = zipfile.ZipInfo(nome, (2026, 1, 1, 0, 0, 0))
        zi.external_attr, zi.compress_type = 0o644 << 16, zipfile.ZIP_DEFLATED
        return zi
    with zipfile.ZipFile(destino, 'w') as z:
        z.writestr(item('LEIA-ME.txt'), LEIA_ME.replace('\n', '\r\n'))
        for f in arqs:
            z.writestr(item(f'alimentador/{f}'), (PKG / f).read_bytes())
    return destino


def pagina_alimentador(modelo, c):
    al = c['alimentador']
    cdn = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/'
    h = modelo
    for x, y in [
            ('<title>Trechos · %%TITULO%%</title>', f'<title>{html.escape(al)} · trechos</title>'),
            ('<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
             '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
             '<meta name="robots" content="noindex, nofollow">'),
            (f'<link rel="stylesheet" href="{cdn}leaflet.css">', '<link rel="stylesheet" href="../../assets/leaflet/leaflet.css">'),
            (f'<script src="{cdn}leaflet.js"></script>', '<script src="../../assets/leaflet/leaflet.js"></script>'),
            ('%%ROTULO%%', html.escape(f'{c["se"]} {c["se_nome"]} · Alimentador {al}')),
            ('Chaves 88 não aparecem.', 'Chaves que não dividem trecho (88, faca e outras) só aparecem com o mapa de perto.')]:
        assert h.count(x) == 1, x[:50]
        h = h.replace(x, y)
    h = re.sub(r'<style>\n.*?</style>', '<link rel="stylesheet" href="../../assets/alimentador.css">', h, count=1, flags=re.S)
    h = re.sub(r'<script>\nconst D = %%DADOS%%;\n.*?</script>',
               '<script src="dados.js"></script>\n<script src="../../assets/alimentador.js"></script>\n'
               '<script src="../../assets/extras.js"></script>\n'
               # divisas dos municípios em tracejado: municipios.js do alimentador sai da interface, com a malha
               '<script src="municipios.js"></script>\n<script src="../../assets/municipios.js"></script>\n'
               # chaves que não dividem trecho (88, faca…): chaves.js do alimentador sai da interface, dos dados do site
               '<script src="chaves.js"></script>\n<script src="../../assets/chaves.js"></script>\n'
               # limpeza de faixa: limpeza.js do alimentador vem de scripts/limpeza_faixa.py (sem ele, a camada não aparece)
               '<script src="limpeza.js"></script>\n<script src="../../assets/limpeza.js"></script>\n'
               # inspeção visual de MT: inspecao.js do alimentador vem de scripts/inspecao.py (sem ele, o card não aparece)
               '<script src="inspecao.js"></script>\n<script src="../../assets/inspecao.js"></script>\n'
               # OS de manutenção geradas pela inspeção: manutencao.js do alimentador vem de scripts/manutencao.py
               '<script src="manutencao.js"></script>\n<script src="../../assets/manutencao-polos.js"></script>\n'
               '<script src="../../assets/manutencao.js"></script>\n'
               # OS de manutenção executadas nos ativos: executadas.js do alimentador vem de scripts/executadas.py
               '<script src="executadas.js"></script>\n<script src="../../assets/executadas.js"></script>\n'
               '<script src="../../assets/telacheia.js"></script>\n'
               # croqui de limpeza de faixa (o modelo, assets/croqui-modelo.js, só carrega quando pedido)
               '<script src="../../assets/croqui.js"></script>\n<script src="../../assets/menu.js"></script>', h, count=1, flags=re.S)
    assert '%%' not in h
    return h


FONTES = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
          '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
          '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600'
          '&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">\n')


def migalhas(inicio, atual):
    """Caminho no topo das páginas: Municípios › página atual (inicio = link da página inicial)."""
    return (f'<nav class="migalhas" aria-label="Caminho"><a href="{inicio}">Municípios</a><span aria-hidden="true">›</span>'
            f'<span aria-current="page">{html.escape(atual)}</span></nav>\n')


def casca(titulo, corpo, raiz, rodape=''):
    return (f'<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8">\n'
            f'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            f'<meta name="robots" content="noindex, nofollow">\n<title>{html.escape(titulo)}</title>\n'
            f'{FONTES}<link rel="stylesheet" href="{raiz}assets/site.css"></head><body><div class="wrap">\n{corpo}\n'
            f'<footer class="rodape">{rodape}<p><a href="{raiz}relatorio.html">Relatório de validação</a> · '
            f'<a href="{raiz}manifesto.json">manifesto.json</a></p></footer>\n</div>\n'
            '<script>const b=document.getElementById("busca");if(b)b.addEventListener("input",()=>{const q=b.value'
            '.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase();document.querySelectorAll("[data-busca]")'
            '.forEach(e=>{e.hidden=!e.dataset.busca.includes(q)});document.querySelectorAll(".grade").forEach(g=>{let v=g.nextElementSibling;'
            'if(!v||!v.classList.contains("sem-res")){v=document.createElement("p");v.className="sem-res";v.setAttribute("role","status");'
            'g.after(v)}v.textContent=!q||g.querySelector("[data-busca]:not([hidden])")?"":"Nada encontrado para “"+b.value.trim()+"”."})});'
            f'</script>\n<script src="{raiz}assets/menu.js"></script>\n</body></html>\n')


def km(m):
    return f'{m / 1000:,.1f}'.replace(',', 'X').replace('.', ',').replace('X', '.')


def carregar_dados(saida):
    return [json.loads(p.read_text(encoding='utf-8')) for p in sorted((saida / 'dados' / 'alimentadores').glob('*.json'))]


def le_js(caminho):
    """window.X = {...}; → dict (None se o arquivo não existe ou é null)."""
    if not caminho.exists():
        return None
    s = caminho.read_text(encoding='utf-8')
    return json.loads(s[s.index('=') + 1:].strip().rstrip(';'))


def ultima_limpeza(lp, al):
    """Data da última OS executada no alimentador: localizada no mapa dele ou aberta para ele."""
    if not lp:
        return None
    no_mapa = {k for ks in lp['vaos'].values() for k in ks}
    ds = [o['data'] for k, o in enumerate(lp['os']) if o['sit'] == 'EXECUTADA' and o['data']
          and (k in no_mapa or o['al_os'] == al)]
    return max(ds) if ds else None


def nae_por_municipio(dados):
    """NAE de cada município (código IBGE → ocorrências): cada ocorrência conta no município onde o trecho dela tem mais
    rede; sem trecho, no município onde o alimentador tem mais rede (mesma ideia do polo em ranking_polos)."""
    nae = {}
    for c in dados:
        if c['validacao']['status'] == 'falha':
            continue
        tot, do_t = {}, {}
        for t in c['trechos']:
            mm = {k: m for k, m in (t.get('municipios') or {}).items() if k != 'None'}
            for k, m in mm.items():
                tot[k] = tot.get(k, 0) + m
            do_t[t['nome']] = max(mm, key=mm.get) if mm else None
        principal = max(tot, key=tot.get) if tot else None
        for o in (c.get('nae') or {}).get('oc', []):
            cod = do_t.get(o.get('trecho')) or principal
            if cod:
                nae[cod] = nae.get(cod, 0) + 1
    return nae


def contorno_regionais(geo_muns, reg_de):
    """Contorno de cada regional no mapa da página inicial (path SVG): as arestas dos municípios da regional que não são
    divididas com outro município da mesma regional. Os contornos dos 139 municípios vêm da mesma malha, então os
    vizinhos têm as arestas iguais."""
    por_reg = {}
    for m in geo_muns:
        r = reg_de.get(m['cod'])
        if not r:
            continue
        cont = por_reg.setdefault(r, {})
        for anel in re.findall(r'M([^MZz]+)', m['d']):
            v = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', anel)]
            pts = list(zip(v[::2], v[1::2]))
            for a, b in zip(pts, pts[1:] + pts[:1]):
                if a != b:
                    k = (a, b) if a < b else (b, a)
                    cont[k] = cont.get(k, 0) + 1
    fmt = lambda x: f'{x:g}'
    return {r: ''.join(f'M{fmt(a[0])},{fmt(a[1])}L{fmt(b[0])},{fmt(b[1])}' for (a, b), n in sorted(cont.items()) if n == 1)
            for r, cont in por_reg.items()}


def mapa_e_ranking(saida, dados, man):
    """assets/mapa-municipios-dados.js (window.MUN) e assets/ranking-nae.js (window.RANK).

    A geometria dos 139 municípios é estática (contornos já projetados, em
    alimentador/site/mapa-municipios-geo.json); o que a rodada preenche é
    quais municípios têm alimentador (`slug`, `als`), a regional e o polo de cada um (`reg`, `polo`, de polos.json),
    a NAE de cada município (`nae`, nae_por_municipio: o mapa pinta por ela), o contorno das regionais (`regs`) e dos
    polos (`pols`: clicar numa regional abre ela dividida nos polos) e o
    ranking por NAE (ranking-nae.js: lido pelo atualiza_bases;
    a página inicial não mostra mais o ranking, que fica na página dos polos, visão ETO).
    """
    geo = json.loads((PKG / 'site' / 'mapa-municipios-geo.json').read_text(encoding='utf-8'))
    por_cod = {m['cod']: m for m in man['municipios']}
    cfg = json.loads((PKG / 'site' / 'polos.json').read_text(encoding='utf-8'))
    polo_de = {cod: p for p in cfg['polos'] for cod in p['municipios']}
    nae_mun = nae_por_municipio(dados)
    muns = []
    for g in geo['muns']:
        m = por_cod.get(g['cod'])
        g = dict(g, nae=nae_mun.get(g['cod'], 0))
        if g['cod'] in polo_de:
            g = dict(g, reg=polo_de[g['cod']]['regional'], polo=polo_de[g['cod']]['nome'])
        if m:
            g = dict(g, nome=m['nome'], slug=m['slug'], als=[dict(cod=a['cod'], se=a['se_nome'], m=a['m_no_municipio'])
                                             for a in m['alimentadores']])
        muns.append(g)
    (saida / 'assets' / 'mapa-municipios-dados.js').write_text(
        'window.MUN=' + json.dumps(dict(w=geo['w'], h=geo['h'], muns=muns,
                                        regs=contorno_regionais(geo['muns'], {c: p['regional'] for c, p in polo_de.items()}),
                                        pols=contorno_regionais(geo['muns'], {c: p['nome'] for c, p in polo_de.items()})),
                                   ensure_ascii=False,
                                   separators=(',', ':')) + ';\n', encoding='utf-8')
    vb = f'-6 -6 {geo["w"] + 12} {geo["h"] + 12}'      # mesmo viewBox de assets/mapa-municipios.js

    als, meses = [], set()
    for c in dados:
        if c['validacao']['status'] == 'falha':
            continue
        oc = (c.get('nae') or {}).get('oc', [])
        meses |= {o['mes'] for o in oc}
        als.append(dict(
            al=c['alimentador'], se=c['se_nome'] or c.get('se') or '',
            nae=len(oc), col=sum(1 for o in oc if o.get('col')),
            cons=sum(o.get('cons') or 0 for o in oc),
            chi=round(sum((o.get('cons') or 0) * (o.get('dur') or 0) for o in oc) / 60),
            km=round(c['resumo']['extensao_m'] / 1000, 4),      # NAE/100 km com a extensão inteira (a tela arredonda)
            ult_limpeza=ultima_limpeza(le_js(saida / 'alimentadores' / c['alimentador'] / 'limpeza.js'),
                                       c['alimentador']),   # limpeza.js de scripts/limpeza_faixa.py (sem ele: None)
            muns=[m['cod'] for m in c['municipios'] if m['m'] >= MIN_M]))
    als.sort(key=lambda a: (-a['nae'], a['al']))
    (saida / 'assets' / 'ranking-nae.js').write_text(
        'window.RANK=' + json.dumps(dict(meses=[min(meses), max(meses)] if meses else [],
                                         als=als), ensure_ascii=False, separators=(',', ':')) + ';\n',
        encoding='utf-8')
    return vb


def polo_principal(c, polo_de):
    """Polo onde o alimentador tem mais rede (km dos trechos por município); None se não tem rede em polo nenhum."""
    km = {}
    for t in c['trechos']:
        for cod, m in (t.get('municipios') or {}).items():
            if cod in polo_de:
                km[polo_de[cod]] = km.get(polo_de[cod], 0) + m
    return max(km, key=km.get) if km else None


def manutencao_polos(saida, dados):
    """assets/manutencao-polos.js (window.MANUT_POLOS): OS geradas pela inspeção somadas por polo, para o bloco Insp→manut
    comparar o alimentador com o polo dele. Cada alimentador conta inteiro no polo onde tem mais rede (polo_principal).
    Por polo: alimentadores com página, OS executadas e, das não executadas, quantas por data limite (vencida ou no prazo
    a página decide com a data do dia, como no manutencao.js). Sem nenhum manutencao.js com OS: window.MANUT_POLOS = null."""
    cfg = json.loads((PKG / 'site' / 'polos.json').read_text(encoding='utf-8'))
    polo_de = {cod: p['id'] for p in cfg['polos'] for cod in p['municipios']}
    polos = {p['id']: dict(nome=p['nome'], regional=p['regional'], als=0, exec=0, lim={}) for p in cfg['polos']}
    al_polo, base, tem = {}, None, False
    for c in dados:
        if c['validacao']['status'] == 'falha':
            continue
        pid = polo_principal(c, polo_de)
        if not pid:
            continue
        al_polo[c['alimentador']] = pid
        q = polos[pid]
        q['als'] += 1
        mn = le_js(saida / 'alimentadores' / c['alimentador'] / 'manutencao.js')
        if not mn:
            continue
        base = max(filter(None, [base, mn.get('base_ate')]), default=None)
        for o in mn['os']:
            tem = True
            if o['sit'] == 'EXECUTADA':
                q['exec'] += 1
            else:
                d = o.get('limite') or ''
                q['lim'][d] = q['lim'].get(d, 0) + 1
    for q in polos.values():
        q['lim'] = dict(sorted(q['lim'].items()))
    obj = dict(base_ate=base, polos=polos, al=al_polo) if tem else None
    (saida / 'assets' / 'manutencao-polos.js').write_text(
        'window.MANUT_POLOS = ' + json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    return obj


def ranking_polos(saida, dados, man):
    """polos/index.html e assets/ranking-polos-dados.js (window.POLOS): os alimentadores de cada polo por NAE.

    O polo vem do município (alimentador/site/polos.json, da planilha de cidades por polo DCMD). O alimentador entra
    em cada polo onde tem rede (≥ MIN_M) ou NAE: km e NAE de cada trecho contam no polo do município onde o trecho tem
    mais rede; NAE sem trecho conta no polo onde o alimentador tem mais rede. Limpeza: metros de cada classe pela data
    da última limpeza executada de cada vão (a situação, em dia ou vencida, é calculada na página com a data do dia).
    """
    cfg = json.loads((PKG / 'site' / 'polos.json').read_text(encoding='utf-8'))
    geo = json.loads((PKG / 'site' / 'mapa-municipios-geo.json').read_text(encoding='utf-8'))['muns']
    polo_de = {cod: p['id'] for p in cfg['polos'] for cod in p['municipios']}
    slug_mun = {m['cod']: m['slug'] for m in man['municipios']}
    nome_de = {m['cod']: m['nome'] for m in man['municipios']}       # nome com acento (IBGE) quando há dados
    linhas = {p['id']: [] for p in cfg['polos']}
    trechos_p = {p['id']: [] for p in cfg['polos']}       # trechos com NAE, no polo do município de mais rede
    meses, regra, equipes = set(), {'T1': 3, 'T2': 4, 'T3': 5}, None
    for c in dados:
        if c['validacao']['status'] == 'falha':
            continue
        al, ts = c['alimentador'], c['trechos']
        mun_km, km = {}, {}
        for t in ts:
            for cod, m in (t.get('municipios') or {}).items():
                mun_km[cod] = mun_km.get(cod, 0) + m
        for cod, m in mun_km.items():
            if cod in polo_de:
                km[polo_de[cod]] = km.get(polo_de[cod], 0) + m
        if not km:
            continue
        principal = max(km, key=km.get)
        mun_t = {t['nome']: {k: m for k, m in (t.get('municipios') or {}).items() if k != 'None'} for t in ts}   # 'None': fora do TO
        polo_t = {n: polo_de.get(max(mm, key=mm.get)) if mm else None for n, mm in mun_t.items()}
        nae = {}                                        # polo → [NAE, consumidores, consumidor×min, NAE sem trecho]
        for o in (c.get('nae') or {}).get('oc', []):
            meses.add(o['mes'])
            x = nae.setdefault(polo_t.get(o.get('trecho')) or principal, [0, 0, 0, 0])
            x[0] += 1
            x[1] += o.get('cons') or 0
            x[2] += (o.get('cons') or 0) * (o.get('dur') or 0)
            x[3] += 0 if o.get('trecho') else 1
        limp = {}                                       # polo → classe → data da última limpeza ('' = sem) → metros
        limp_t = {}                                     # trecho → data da última limpeza ('' = sem) → metros
        lp = le_js(saida / 'alimentadores' / al / 'limpeza.js')
        mapa = le_js(saida / 'alimentadores' / al / 'dados.js') if lp else None
        if lp and mapa and len(mapa['vaos']) == len(c['vaos']):     # mesma ordem de vãos nos dois arquivos
            regra, equipes = lp.get('regra_anos') or regra, lp.get('equipes') or equipes
            ult = {}
            for vid, ks in lp['vaos'].items():
                ds = [lp['os'][k]['data'] for k in ks if lp['os'][k]['sit'] == 'EXECUTADA' and lp['os'][k]['data']]
                if ds:
                    ult[vid] = max(ds)
            for v, d in zip(c['vaos'], mapa['vaos']):
                dt = ult.get(str(d[5]), '')
                q = limp_t.setdefault(ts[v[4]]['nome'], {})
                q[dt] = q.get(dt, 0) + v[5]
                if polo_de.get(v[8]):
                    q = limp.setdefault(polo_de[v[8]], {}).setdefault(classe(ts[v[4]]['nome']), {})
                    q[dt] = q.get(dt, 0) + v[5]
        por_t = {}                                      # trecho → [NAE, consumidores, consumidor×min]
        # NAE de todos os ativos do trecho: as deste alimentador e as de outro cujo ativo hoje está aqui ('ext')
        for o in (c.get('nae') or {}).get('oc', []) + (c.get('nae') or {}).get('ext', []):
            if o.get('trecho'):
                x = por_t.setdefault(o['trecho'], [0, 0, 0])
                x[0] += 1
                x[1] += o.get('cons') or 0
                x[2] += (o.get('cons') or 0) * (o.get('dur') or 0)
        for t in ts:
            if t['nome'] in por_t:
                n, mm = por_t[t['nome']], mun_t[t['nome']]
                mun = max(mm, key=mm.get) if mm else None
                trechos_p[polo_t.get(t['nome']) or principal].append(dict(
                    al=al, t=t['nome'], se=c['se_nome'] or c.get('se') or '', mun=mun, m=slug_mun.get(mun), km=round(t['ext_m'], 1), nae=n[0],
                    cons=n[1], chi=round(n[2] / 60),
                    lp={classe(t['nome']): {d: round(m) for d, m in sorted(limp_t.get(t['nome'], {}).items())}} if limp_t else {}))
        for p in sorted(set(km) | set(nae)):
            if km.get(p, 0) < MIN_M and p not in nae:
                continue
            n = nae.get(p, [0, 0, 0, 0])
            muns = sorted((cod for cod in mun_km if polo_de.get(cod) == p and mun_km[cod] >= MIN_M), key=lambda k: -mun_km[k])
            linhas[p].append(dict(
                al=al, se=c['se_nome'] or c.get('se') or '', km=round(km.get(p, 0), 1), km_total=round(c['resumo']['extensao_m'], 1),
                nae=n[0], cons=n[1], chi=round(n[2] / 60), sem=n[3], muns=muns,
                m=next((slug_mun[k] for k in muns if k in slug_mun), None),
                lp={cl: {d: round(m) for d, m in sorted(ds.items())} for cl, ds in sorted(limp.get(p, {}).items())}))
    dados_js = dict(meses=[min(meses), max(meses)] if meses else [], regra=regra, equipes=equipes, fonte=cfg['fonte'],
                    fora=cfg['fora'], muns={g['cod']: nome_de.get(g['cod'], g['nome']) for g in geo},
                    polos=[dict(id=p['id'], nome=p['nome'], regional=p['regional'], equipe=p['equipe'],
                                n_muns=len(p['municipios']),
                                als=sorted(linhas[p['id']], key=lambda a: (-a['nae'], -a['km'], a['al'])),
                                trs=sorted(trechos_p[p['id']], key=lambda a: (-a['nae'], -a['chi'], a['al'], a['t'])))
                           for p in cfg['polos']])
    (saida / 'assets' / 'ranking-polos-dados.js').write_text(
        'window.POLOS=' + json.dumps(dados_js, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    corpo = (migalhas('../', 'Ranking por polo') +
             '<header><h1>Ranking por polo</h1><p>Alimentadores e trechos com mais NAE (árvore/eucalipto na rede) na ETO, '
             'em cada regional e em cada polo.</p></header>\n<div id="polos"></div>\n'
             '<script src="../assets/ranking-polos-dados.js"></script>\n<script src="../assets/ranking-polos.js"></script>')
    p = saida / 'polos' / 'index.html'
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(casca('Alimentadores por polo', corpo, '../'), encoding='utf-8')


def manifesto(dados):
    muns = {}
    for c in dados:
        if c['validacao']['status'] == 'falha':
            continue
        for m in c['municipios']:
            if m['m'] >= MIN_M:
                muns.setdefault(m['cod'], dict(cod=m['cod'], nome=m['nome'], slug=slug(m['nome']), alimentadores=[]))
                muns[m['cod']]['alimentadores'].append(dict(
                    cod=c['alimentador'], polo=c['polo'], se=c['se'], se_nome=c['se_nome'], m_no_municipio=m['m'],
                    m_total=c['resumo']['extensao_m'], trechos=c['resumo']['trechos'], status=c['validacao']['status']))
    lista = sorted(muns.values(), key=lambda m: slug(m['nome']))
    for m in lista:
        m['alimentadores'].sort(key=lambda a: (-a['m_no_municipio'], a['cod']))
    # `pagina` diz se existe página publicada: alimentador com falha fica no
    # manifesto (ele documenta a cobertura) mas sem link, senão quem consome o
    # manifesto cai em 404.
    return dict(versao=1, municipios=lista, alimentadores={c['alimentador']: dict(
        polo=c['polo'], se=c['se'], se_nome=c['se_nome'], status=c['validacao']['status'],
        municipios=[m['cod'] for m in c.get('municipios', []) if m['m'] >= MIN_M],
        pagina=(f'alimentadores/{c["alimentador"]}/' if c['validacao']['status'] != 'falha' else None),
        dados=f'dados/alimentadores/{c["alimentador"]}.json') for c in dados})


FATIAS = 256          # índice de ativos em pedaços: a busca da página inicial baixa só o pedaço do código


def chave_ativo(s):
    """Código como a busca compara: maiúsculas, só letras e números, sem zeros à esquerda se for só número."""
    k = re.sub(r'[^0-9A-Z]', '', str(s).upper())
    return (k.lstrip('0') or '0') if k.isdigit() else k


def fatia(k):
    h = 0                                         # mesma conta em assets/busca-ativo.js
    for ch in k:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return f'{h % FATIAS:02x}'


def indice_ativos(saida, dados):
    """dados/ativos/<fatia>.json: código da chave ou do poste → [[alimentador, tipo, trecho, papel, lat, lon], ...].

    Chave: o trecho que ela abre (início), senão o que passa por ela, senão o trecho dos vãos do poste dela.
    Transformadores do GIS ('ativos_kml'): o trecho do vão mais próximo (scripts/ativos_gis.py).
    Poste: os trechos dos vãos que chegam nele. Postes N123 (pontos sem número no cadastro) ficam de fora.
    """
    idx, nomes = {}, {}                              # nomes: código → {como está no cadastro: tipo} (lista suspensa)
    for c in dados:
        if c['validacao']['status'] == 'falha':
            continue
        al, ts = c['alimentador'], c['trechos']
        do_poste, onde = {}, {}
        for v in c['vaos']:
            for p, lon, lat in ((v[6], v[0], v[1]), (v[7], v[2], v[3])):
                if p:
                    do_poste.setdefault(p, []).append(ts[v[4]]['nome'])
                    onde.setdefault(p, (lat, lon))
        ordem = {t['nome']: i for i, t in enumerate(ts)}
        unicos = lambda ns: sorted(set(ns), key=ordem.get)
        for p, ns in do_poste.items():
            if re.fullmatch(r'N\d+', p):
                continue
            ns = unicos(ns)
            nomes.setdefault(chave_ativo(p), {})[p] = 'poste'
            idx.setdefault(chave_ativo(p), []).append([al, 'poste', ns[0], ', '.join(ns) if len(ns) > 1 else '', *onde[p]])
        for ch in c['chaves']:
            n = ch['nome']
            papel = ([f'início do {t["nome"]}' for t in ts if t['inicio']['chave'] == n] +
                     [f'fim do {t["nome"]}' for t in ts if n in (t.get('fim') or [])] +
                     [f'no meio do {t["nome"]}' for t in ts if n in (t.get('passa') or [])])
            alvo = next((t['nome'] for t in ts if t['inicio']['chave'] == n), None) or \
                next((t['nome'] for t in ts if n in (t.get('passa') or [])), None)
            if not alvo and do_poste.get(ch.get('poste')):
                ns = unicos(do_poste[ch['poste']])
                alvo, papel = ns[0], papel or [f'no {", ".join(ns)}']
            if not alvo and papel:                     # só fim de trecho (ponta de linha)
                alvo = next(t['nome'] for t in ts if n in (t.get('fim') or []))
            if alvo:
                nomes.setdefault(chave_ativo(n), {})[n] = ch['tipo']
                idx.setdefault(chave_ativo(n), []).append([al, ch['tipo'], alvo, ' · '.join(papel), ch['lonlat'][1],
                                                           ch['lonlat'][0]])
        # transformadores do GIS (camada Transformadores do acervo; scripts/ativos_gis.py)
        ja = {ch['nome'] for ch in c['chaves']}
        for nome, tipo, lon, lat, t, d, *_ in c.get('ativos_kml') or []:
            if nome in ja or d is None:
                continue
            papel = (f'no {t}' + (f' (a {d:g} m da rede)' if d > 5 else '')) if t else f'fora da rede do site ({d:g} m)'
            nomes.setdefault(chave_ativo(nome), {})[nome] = tipo
            idx.setdefault(chave_ativo(nome), []).append([al, tipo, t or '', papel, lat, lon])
    pasta = saida / 'dados' / 'ativos'
    if pasta.exists():
        shutil.rmtree(pasta)
    por = {}
    for k in sorted(idx):
        por.setdefault(fatia(k), {})[k] = idx[k]
    for f, d in por.items():
        grava_json(pasta / f'{f}.json', d)
    sugestoes_ativos(saida, nomes)
    return len(idx)


def sugestoes_ativos(saida, nomes):
    """dados/ativos-pref/<2 primeiros caracteres do código>.json: a lista suspensa da busca de ativo da página inicial.

    Cada arquivo: tipo → códigos como estão no cadastro (com os zeros da frente), separados por espaço (~100 arquivos,
    o maior com ~1 MB antes do gzip). A página, a partir de 3 caracteres digitados, baixa o arquivo dos 2 primeiros
    (no mesmo formato de chave_ativo) e mostra os que começam com o que se digitou;
    ao escolher um, a busca de sempre (dados/ativos/<fatia>.json) diz o alimentador e o trecho.
    """
    pasta = saida / 'dados' / 'ativos-pref'
    if pasta.exists():
        shutil.rmtree(pasta)
    por = {}
    for k, ns in nomes.items():
        if len(k) < 3:
            continue
        g = por.setdefault(k[:2], {})
        for nome, tipo in ns.items():
            g.setdefault(tipo, []).append(nome)
    for f, d in por.items():
        grava_json(pasta / f'{f}.json', {t: ' '.join(sorted(set(v))) for t, v in sorted(d.items())})
    return len(por)


def nae_resumo(c):
    oc = (c.get('nae') or {}).get('oc', [])
    return sum(1 for o in oc if o['trecho']), sum(1 for o in oc if not o['trecho'])


DIVIDEM = set(regras.PROTECAO) | {'SEC', 'FTR'}   # chaves que abrem ou fecham trecho (já desenhadas pelo alimentador.js)


def chaves_js(c):
    """chaves.js do alimentador: window.CHAVES = [[nome, tipo, lat, lon], ...] das chaves que não dividem trecho (88, faca 80,
    passagem…), para o destaque no mapa de perto (assets/chaves.js). Sai dos dados do site (dados/alimentadores/<AL>.json)."""
    cs = [[ch['nome'], ch['tipo'], round(ch['lonlat'][1], 7), round(ch['lonlat'][0], 7)]
          for ch in c['chaves'] if ch['tipo'] not in DIVIDEM]
    return 'window.CHAVES = ' + json.dumps(cs, ensure_ascii=False, separators=(',', ':')) + ';\n'


def grava_divisas(arq, c, malha):
    """municipios.js do alimentador (divisas no mapa). Só com a mesma malha que mediu os municípios dele; sem ela, fica o
    arquivo que já existe (ou null: a página fica sem as divisas)."""
    if malha and c['origem'].get('malha') == malha.origem:
        arq.write_text(divisas_js(malha, c), encoding='utf-8')
    elif not arq.exists():
        arq.write_text('window.MUNICIPIOS = null;\n', encoding='utf-8')


def interface(saida, malha=None):
    dados = carregar_dados(saida)
    modelo = ativos_interface(saida)
    man = manifesto(dados)
    grava_json(saida / 'manifesto.json', man)
    for c in dados:
        if c['validacao']['status'] != 'falha':
            (saida / 'alimentadores' / c['alimentador'] / 'index.html').write_text(pagina_alimentador(modelo, c),
                                                                                    encoding='utf-8')
            limpeza = saida / 'alimentadores' / c['alimentador'] / 'limpeza.js'
            if not limpeza.exists():                   # até rodar scripts/limpeza_faixa.py: página sem a camada
                limpeza.write_text('window.LIMPEZA = null;\n', encoding='utf-8')
            insp = saida / 'alimentadores' / c['alimentador'] / 'inspecao.js'
            if not insp.exists():                      # até rodar scripts/inspecao.py: página sem o card de inspeção
                insp.write_text('window.INSPECAO = null;\n', encoding='utf-8')
            mnt = saida / 'alimentadores' / c['alimentador'] / 'manutencao.js'
            if not mnt.exists():                       # até rodar scripts/manutencao.py: página sem o card de manutenção
                mnt.write_text('window.MANUTENCAO = null;\n', encoding='utf-8')
            exe = saida / 'alimentadores' / c['alimentador'] / 'executadas.js'
            if not exe.exists():                       # até rodar scripts/executadas.py: página sem o card Manutenção
                exe.write_text('window.EXECUTADAS = null;\n', encoding='utf-8')
            grava_divisas(saida / 'alimentadores' / c['alimentador'] / 'municipios.js', c, malha)
            (saida / 'alimentadores' / c['alimentador'] / 'chaves.js').write_text(chaves_js(c), encoding='utf-8')
    for m in man['municipios']:
        linhas = []
        for a in m['alimentadores']:
            n = a['trechos']
            trechos = f'{n:,}'.replace(',', '.') + '&nbsp;trecho' + ('' if n == 1 else 's')
            linhas.append(f'<a class="card" data-busca="{a["cod"].lower()} {html.escape(slug(a["se_nome"]).replace("-", " "))}" '
                          f'href="../../alimentadores/{a["cod"]}/?m={m["slug"]}"><b class="cod">{a["cod"]}</b>'
                          f'<span>{html.escape(a["se"])} {html.escape(a["se_nome"])} · polo {html.escape(a["polo"])}</span>'
                          f'<span>{km(a["m_no_municipio"])}&nbsp;km no município de {km(a["m_total"])}&nbsp;km · '
                          f'{trechos}</span></a>')   # avisos: só na página do alimentador ('Dados e procedência')
        corpo = (migalhas('../../', m['nome']) +
                 f'<header><h1>{html.escape(m["nome"])}</h1><p>Alimentadores com rede dentro do município.</p></header>\n' +
                 ('<input class="busca" id="busca" type="search" aria-label="Buscar alimentador ou SE" '
                  'placeholder="Buscar alimentador ou SE">\n' if len(m['alimentadores']) >= 8 else '') +
                 f'<div class="grade als">{"".join(linhas)}</div>')
        p = saida / 'municipios' / m['slug'] / 'index.html'
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(casca(f'{m["nome"]} · alimentadores', corpo, '../../',
                           rodape=f'<p>Malha do IBGE, amostra a cada {PASSO_M}&nbsp;m; mínimo de {MIN_M}&nbsp;m.</p>'), encoding='utf-8')
    vb = mapa_e_ranking(saida, dados, man)
    ranking_polos(saida, dados, man)
    manutencao_polos(saida, dados)
    indice_ativos(saida, dados)
    corpo = ('<header class="cab"><h1>Trechos por município</h1><a class="cab-link" href="polos/#eto">Ranking dos alimentadores →</a></header>\n'
             # casca do mapa já no HTML (estilo em assets/site.css; o svg com viewBox reserva a altura do mapa):
             # os scripts só preenchem, e a página não pula ao carregar. Mesmos ids de antes (busca-ativo.js e
             # mapa-municipios.js); a busca de município (#busca) abre a lista suspensa de todos os municípios.
             '<div id="mapa-to" class="mapa-to"><div class="mt-barra">'
             '<form class="ativo" id="ativo" role="search"><label for="ativo-q" class="rot">Selecione o ativo</label>'
             '<div class="campo"><input class="busca" id="ativo-q" type="search" inputmode="search" autocomplete="off" '
             'placeholder="Ex.: 0300350016" enterkeyhint="search">'   # sem botão: o Enter busca
             '<div id="ativo-res" aria-live="polite"></div></div></form>'
             '<div class="mt-bmun"><label for="busca" class="rot">Município</label>'
             '<div class="mun-cx"><input class="busca" id="busca" type="search" role="combobox" aria-autocomplete="list" '
             'aria-expanded="false" aria-controls="mun-lista" autocomplete="off" placeholder="Buscar município">'
             '<div class="mun-lista" id="mun-lista" role="listbox" aria-label="Municípios" hidden></div></div></div></div>\n'
             f'<div class="mt-mapa"><svg role="group" aria-label="Mapa dos municípios do Tocantins" tabindex="-1" viewBox="{vb}"></svg>'
             '<div class="mt-dica" aria-hidden="true"></div>'
             '<p class="mt-regs" aria-label="Legenda do mapa"></p></div></div>\n'   # legenda: mapa-municipios.js
             '<script src="assets/mapa-municipios-dados.js"></script>\n'
             '<script src="assets/mapa-municipios.js"></script>\n'
             '<script src="assets/busca-ativo.js"></script>')
    (saida / 'index.html').write_text(casca('Trechos por município', corpo, '', rodape=(
        '<p>T1 do DJ ao 1º religador, T2 de religador a religador (T2-A, T2-B…), T3-A, T3-B… depois de cada fusível.</p>')),
        encoding='utf-8')
    (saida / '.nojekyll').touch()
    relatorio(saida, dados, man)
    return dados, man


# ---------------------------------------------------------------- relatório

def relatorio(saida, dados, man, sem_kml=()):
    cab = ('| Município | Polo | SE | Alimentador | Trechos | T1 | T2 | T3 | Extensão (km) | No município (km) | RL | '
           'Fusíveis | NAE assoc. | NAE não assoc. | Pontos sem ligação | Contin. estimadas | Avisos | Status |\n'
           '|' + '---|' * 18)
    por = {c['alimentador']: c for c in dados}
    md = ['# Relatório de validação · trechos por município', '',
          f'Amostra de {PASSO_M} m por vão; alimentador entra no município com ≥ {MIN_M} m. NAE = ocorrências da Crítica '
          '(coletivas e individuais) associadas a um trecho ou não.', '']
    geral = dict(n=0, trechos=0, m=0, mm=0)
    for m in man['municipios']:
        md += [f'## {m["nome"]}', '', cab]
        tot = dict(n=0, trechos=0, m=0, mm=0)
        for a in m['alimentadores']:
            c = por[a['cod']]
            r, v = c['resumo'], c['validacao']
            na, nn = nae_resumo(c)
            md.append(f'| {m["nome"]} | {c["polo"]} | {c["se"]} | {c["alimentador"]} | {r["trechos"]} | {r["T1"]["n"]} | '
                      f'{r["T2"]["n"]} | {r["T3"]["n"]} | {km(r["extensao_m"])} | {km(a["m_no_municipio"])} | '
                      f'{r["religadores"]} | {r["fusiveis"]} | {na} | {nn} | {c["topologia"]["pontos_sem_ligacao"]} | '
                      f'{len(c["continuidades_estimadas"])} | {len(v["avisos"])} | {v["status"]} |')
            for k, x in (('n', 1), ('trechos', r['trechos']), ('m', r['extensao_m']), ('mm', a['m_no_municipio'])):
                tot[k] += x
        md += [f'| **Total {m["nome"]}** | | | {tot["n"]} alimentadores | {tot["trechos"]} | | | | {km(tot["m"])} | '
               f'{km(tot["mm"])} | | | | | | | | |', '']
        for k in ('n', 'trechos', 'mm'):
            geral[k] += tot[k]
    ok = [c for c in dados if c['validacao']['status'] != 'falha']
    md += ['## Total geral', '', f'- Municípios: {len(man["municipios"])}',
           f'- Alimentadores processados sem falha: {len(ok)} ({km(sum(c["resumo"]["extensao_m"] for c in ok))} km, '
           f'{sum(c["resumo"]["trechos"] for c in ok)} trechos)', '']
    md += ['## Avisos por alimentador', '']
    for c in dados:
        v = c['validacao']
        if v['avisos'] or v['criticas']:
            md.append(f'- **{c["alimentador"]}** ({v["status"]}): ' + '; '.join(v['criticas'] + v['avisos']))
    md += ['', '## Não processados', '']
    falhas = [f'- {c["alimentador"]}: {"; ".join(c["validacao"]["criticas"])}' for c in dados if c['validacao']['status'] == 'falha']
    sem_mun = [f'- {c["alimentador"]}: nenhum município com ≥ {MIN_M} m' for c in dados
               if c['validacao']['status'] != 'falha' and not any(m['m'] >= MIN_M for m in c['municipios'])]
    md += falhas + sem_mun + [f'- {al}: sem KML do Daimon na pasta informada' for al in sorted(sem_kml)] or ['- nenhum']
    texto = '\n'.join(md) + '\n'
    (saida / 'relatorio.md').write_text(texto, encoding='utf-8')
    corpo = migalhas('./', 'Relatório') + '<pre class="relatorio">' + \
            html.escape(texto) + '</pre>'
    (saida / 'relatorio.html').write_text(casca('Relatório de validação', corpo, ''), encoding='utf-8')


# ---------------------------------------------------------------- validar e comparar

def validar_saida(saida):
    """Relê tudo o que foi gerado: JSON válido, validação de cada alimentador e links das páginas."""
    erros = []
    for p in sorted(saida.rglob('*.json')):
        try:
            json.loads(p.read_text(encoding='utf-8'))
        except ValueError as e:
            erros.append(f'JSON inválido {p.relative_to(saida)}: {e}')
    for c in carregar_dados(saida):
        if 'trechos' in c:
            v = validar(c)
            if v != c['validacao']:
                erros.append(f'{c["alimentador"]}: validação gravada difere da recalculada')
        if c['validacao']['status'] == 'falha':
            print(f'  falha {c["alimentador"]}: {"; ".join(c["validacao"]["criticas"])}')
    for p in sorted(saida.rglob('*.html')):
        for ref in re.findall(r'(?:href|src)="([^"#?]+)', p.read_text(encoding='utf-8')):
            if re.match(r'https?:|mailto:', ref):
                continue
            alvo = (p.parent / ref)
            if not (alvo / 'index.html' if ref.endswith('/') else alvo).exists():
                erros.append(f'link quebrado em {p.relative_to(saida)}: {ref}')
    for e in erros:
        print('  ' + e)
    print(f'validação: {len(erros)} problema(s) nos arquivos gerados')
    return not erros


def comparar(saida, publicado):
    """Compara as páginas novas com as publicadas (<AL>.html com o D embutido): trechos, geometria, chaves e NAE."""
    for p in sorted(Path(publicado).glob('*.html')):
        h = p.read_text(encoding='utf-8')
        m = re.search(r'const D = (\{.*?\});\n', h, re.S)
        novo = saida / 'alimentadores' / p.stem / 'dados.js'
        if not m or not novo.exists():
            continue
        a = json.loads(m.group(1).replace('<\\/', '</'))
        b = json.loads(novo.read_text(encoding='utf-8')[len('window.D = '):-2])
        dif = []
        if [t['nome'] for t in a['trechos']] != [t['nome'] for t in b['trechos']]:
            dif.append(f'nomes dos trechos: {len(a["trechos"])} → {len(b["trechos"])}')
        for x, y in zip(a['trechos'], b['trechos']):
            for k in ('inicio', 'fim', 'pai', 'derivacoes', 'tronco', 'inicio_poste'):
                if x.get(k) != y.get(k):
                    dif.append(f'{x["nome"]}.{k}: {x.get(k)} → {y.get(k)}')
            if abs(x['ext'] - y['ext']) > .05:
                dif.append(f'{x["nome"]}.ext: {x["ext"]} → {y["ext"]}')
        if a['vaos'] != b['vaos']:
            dif.append(f'geometria: {sum(u != v for u, v in zip(a["vaos"], b["vaos"]))} vão(s) diferentes de {len(a["vaos"])}')
        for k in ('principais', 'fusiveis'):
            if a[k] != b[k]:
                dif.append(f'{k} diferentes')
        cont = lambda d: sorted((o['mes'], o['trecho'] or '-', o['col']) for o in (d.get('nae') or {}).get('oc', []))
        if cont(a) != cont(b):
            dif.append('NAE por trecho e mês diferente')
        campos = ('cons', 'prog', 'fora')
        mud = {k: sum(x.get(k) != y.get(k) for x, y in zip(a.get('nae', {}).get('oc', []), b.get('nae', {}).get('oc', [])))
               for k in campos}
        dif += [f'NAE: {n} ocorrência(s) com {k} diferente' for k, n in mud.items() if n]
        print(f'{p.stem}: ' + ('igual' if not dif else '\n  ' + '\n  '.join(dif)))


# ---------------------------------------------------------------- seleção e main

def candidatos_municipio(nome, fontes, malha):
    """Alimentadores com algum poste dentro do município (postes do vera-vegetacao contra a malha)."""
    cods = [c for c, n in malha.nome.items() if slug(n) == slug(nome)]
    if not cods:
        raise SystemExit(f'município não encontrado na malha: {nome}')
    achados = []
    for al in sorted(fontes.indice):
        postes, _ = fontes.postes(al)
        if postes and any(malha.municipio(p['lon'], p['lat']) == cods[0] for p in postes):
            achados.append(al)
    return achados


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--kml', action='append', help='pasta com os KMLs do Daimon (busca SE-XXXX_Circ-*.kml nas subpastas)')
    ap.add_argument('--vegetacao', help='clone do LGRSV/vera-vegetacao (dados/indice.json e postes)')
    ap.add_argument('--critica', action='append', help="Critica*.txt (aceita padrão entre aspas)")
    ap.add_argument('--nae', choices=('arvore', 'todas'), default='arvore',
                    help='ocorrências da Crítica: só causa Meio Ambiente + subcausa Árvore (padrão) ou todas')
    ap.add_argument('--malha', help='GeoJSON dos municípios do TO (sem ele, baixa do IBGE para --cache)')
    ap.add_argument('--cache', default='cache/ibge', help='onde guardar a malha baixada do IBGE')
    ap.add_argument('--saida', required=True, help='pasta do site gerado')
    ap.add_argument('--data', help='data de referência dos dados (AAAA-MM-DD); padrão: data do arquivo KML')
    g = ap.add_mutually_exclusive_group()
    g.add_argument('--todos', action='store_true', help='todos os KMLs encontrados')
    g.add_argument('--municipio', help='só os alimentadores com poste no município')
    g.add_argument('--alimentador', action='append', help='só estes alimentadores (repetir)')
    g.add_argument('--validar', action='store_true', help='só confere o que já foi gerado')
    g.add_argument('--so-interface', action='store_true', help='só refaz páginas, índice e relatório')
    g.add_argument('--comparar', help='compara com as páginas publicadas nesta pasta (clone do gh-pages)')
    a = ap.parse_args(argv)
    saida = Path(a.saida)
    if a.validar:
        return 0 if validar_saida(saida) else 1
    if a.so_interface:
        interface(saida, malha_salva(a.malha, a.cache, saida))
        return 0 if validar_saida(saida) else 1
    if a.comparar:
        comparar(saida, a.comparar)
        return 0
    fontes = Fontes(a)
    malha = carregar_malha(a.malha, a.cache)
    if a.alimentador:
        alvos = a.alimentador
    elif a.municipio:
        alvos = candidatos_municipio(a.municipio, fontes, malha)
        print(f'{a.municipio}: {len(alvos)} alimentador(es) com poste no município: {" ".join(alvos)}')
    else:
        alvos = sorted(fontes.kmls)
    sem_kml = [al for al in alvos if al not in fontes.kmls]
    if a.todos:
        sem_kml = sorted(set(fontes.indice) - set(fontes.kmls))
    for al in alvos:
        if al not in fontes.kmls:
            continue
        c = processar(al, fontes, malha, saida, a.data)
        r = c.get('resumo')
        print(f'{al}: {c["validacao"]["status"]}' + (f' · {r["trechos"]} trechos · {km(r["extensao_m"])} km · '
              + ', '.join(f'{m["nome"]} {km(m["m"])} km' for m in c['municipios']) if r else f' · {c.get("erro")}'))
    dados, man = interface(saida, malha)
    relatorio(saida, dados, man, sem_kml)
    ok = validar_saida(saida)
    print(f'{len(man["municipios"])} município(s) · {sum(c["validacao"]["status"] != "falha" for c in dados)} alimentador(es) '
          f'nas páginas · relatório em {saida / "relatorio.md"}')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
