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
    python scripts/gera_trechos.py --saida <pasta do site> --so-faixa [--data AAAA-MM-DD]   só dados/redes/faixa.txt
    python scripts/gera_trechos.py --saida <pasta do site> --so-camadas        só dados/redes/inspecao.txt, executadas.txt, manutencao.txt
    python scripts/gera_trechos.py --saida <pasta do site> --so-nae            só dados/redes/nae.txt (camada NAE do satélite)
    python scripts/gera_trechos.py --saida <pasta do site> --vizinhos [<destino>]   só dados/vizinhos/, das páginas
                                                                               (dados.js, chaves.js e ativos.js)

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
    ainda está sem as divisas (divisas.js); sem internet, segue sem elas (as já gravadas ficam como estão)."""
    if arquivo or all((Path(cache) / f).exists() for f in ('malha-TO.geojson', 'municipios-TO.json')):
        return carregar_malha(arquivo, cache)
    sem = lambda al: not (saida / 'alimentadores' / al / 'divisas.js').exists() or \
        (saida / 'alimentadores' / al / 'divisas.js').read_text(encoding='utf-8') == 'window.MUNICIPIOS = null;\n'
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

SENTINELA = 'Rede Sentinela'     # regra do usuário: a divisão dos circuitos nunca usa a versão do Rede Sentinela


def de_sentinela(kml):
    """KML convertido da base do Rede Sentinela (a descrição do Document diz de onde veio; ver alimentador/daimon.py)."""
    with open(kml, encoding='utf-8', errors='replace') as f:
        cab = f.read(65536)
    m = re.search(r'<description>(.*?)</description>', cab, re.S)
    return bool(m) and SENTINELA.lower() in m.group(1).lower()


class Fontes:
    def __init__(self, a):
        self.kmls = {}
        self.sentinela = set()
        for pasta in a.kml or []:
            for k in sorted(Path(pasta).rglob('*_Circ-*.kml')):
                al = nomes_kml(k)[1]
                if de_sentinela(k):
                    print(f'aviso: {k.name} convertido da base do {SENTINELA}: fica fora (a divisão não usa essa base)')
                    self.sentinela.add(al)
                    continue
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

# Exceção aprovada pelo usuário (16/10/2026): alimentadores cujo GIS veio sem o Fechado.kmz (erro na exportação) e sem rede
# no Daimon. Só as chaves NA vieram, e elas são os by-pass dos religadores (80/88/31 com o mesmo número do 79). As chaves
# desses 3 vêm de scripts/sem_chaves.json (religador no ponto do by-pass; fusíveis e religadores das OS no poste), aplicado
# pelo scripts/sem_chaves.py. São alimentadores longos com poucas chaves conhecidas, então a média de km por trecho passa do
# limite da "classificação colapsada": aqui isso é aviso, não crítica.
SEM_CHAVES = {'LD02424015', 'LD01414015', 'AL01102271'}


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
    # religador do tronco no meio do T1 (T1 do DJ ao fim do tronco, regra de 24/11/2026: scripts/unifica_t1.py) também secciona
    inicios = {t['inicio']['chave'] for t in c['trechos']} | {p for t in c['trechos'] for p in t.get('passa') or []}
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
        if c['alimentador'] in SEM_CHAVES:
            av.append(f'GIS sem as chaves fechadas: divisão pelos religadores dos by-pass NA e pelas chaves das OS '
                      f'({km / n:.0f} km por trecho, {n} trechos para {km:.1f} km)')
        else:
            cri.append(f'classificação colapsada: {km / n:.0f} km por trecho ({n} trecho(s) para {km:.1f} km)')
    # (um alimentador pequeno de verdade é legítimo; o que denuncia os casos
    # de 7 m publicados é a perda de rede acima, não o tamanho absoluto)
    n_rl = sum(1 for a in c['chaves'] if a['tipo'] == '79')
    if n_rl and not c['resumo']['T2']['n'] and not any(p[:2] == '79' for t in c['trechos'] for p in t.get('passa') or []):
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
              'telacheia.js', 'busca-ativo.js', 'ranking-polos.js', 'croqui.js', 'croqui-modelo.js', 'menu.js', 'lupa-painel.js', 'ativos-zoom.js', 'mapa-raiox.js',
              'croqui-rascunho.js', 'polo-rota.js', 'modo-faixa-rascunho.js', 'argos.png', 'focos.js', 'focos.css', 'vizinhos.js',
              'visao-tocantins.js', 'selecionados.js', 'mapa-sat-to.js'):
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


# ?v= dos assets da página inicial e da Queimadas: trocar quando o arquivo muda (o navegador guarda a versão anterior)
V_MAPA = '20261124b'                                     # mapa-municipios.js (e busca-ativo.js)
V_FOCOS = '20261116'
V_SAT_TO = '20261125d'                                    # assets/mapa-sat-to.js (satélite do Tocantins, Ctrl+S)
V_RAIOX = '20261119'                                      # assets/mapa-raiox.js (raio-X da rede, Ctrl+X)


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
    h = re.sub(r'<style>\n.*?</style>', '<link rel="stylesheet" href="../../assets/alimentador.css">\n'
               f'<link rel="stylesheet" href="../../assets/focos.css?v={V_FOCOS}">', h, count=1, flags=re.S)
    h = re.sub(r'<script>\nconst D = %%DADOS%%;\n.*?</script>',
               # dados/tocantins.js (contorno do estado, scripts/divisas.py) antes do mapa: o satélite já abre sem pedir os
               # quadros de fora do TO; depois, a máscara (fora do estado, escuro) e o traçado das divisas
               '<script src="../../dados/tocantins.js"></script>\n'
               '<script src="dados.js"></script>\n<script src="../../assets/alimentador.js"></script>\n'
               # alimentadores vizinhos por baixo da rede, os que entram na tela: dados/vizinhos/ (vizinhos_mapa, aqui)
               '<script src="../../assets/vizinhos.js"></script>\n'
               # o Tocantins inteiro de longe (dados/vizinhos/estado.txt), a máscara fora do estado e o botão Tocantins
               '<script src="../../assets/visao-tocantins.js"></script>\n'
               # outros alimentadores selecionados no mapa (até 10 além deste: menu "Alimentadores" e "Selecionar" nos
               # balões), com a rede, os nomes, a NAE e o detalhe do trecho como este; lê o dados.js deles num worker
               '<script src="../../assets/selecionados.js"></script>\n'
               '<script src="../../assets/extras.js"></script>\n'
               # divisas dos municípios em tracejado: municipios.js do alimentador sai da interface, com a malha
               # divisas.js do alimentador sai de scripts/divisas.py
               '<script src="divisas.js"></script>\n'
               '<script src="../../assets/municipios.js"></script>\n'
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
               # Queimadas (focos de calor e incêndios da Crítica): lê dados/focos/ (scripts/focos.py e focos_historico.py);
               # antes de lupa-painel.js, que copia o botão das camadas para a fileira do alto do mapa
               f'<script src="../../assets/focos.js?v={V_FOCOS}"></script>\n'
               '<script src="../../assets/telacheia.js"></script>\n'
               # croqui de limpeza de faixa (o modelo, assets/croqui-modelo.js, só carrega quando pedido)
               '<script src="../../assets/croqui.js"></script>\n<script src="../../assets/menu.js"></script>\n'
               '<script src="../../assets/lupa-painel.js"></script>\n'
               '<script src="../../assets/ativos-zoom.js"></script>', h, count=1, flags=re.S)   # ativos de perto (ativos.js do alimentador, scripts/ativos_js.py)   # lupa do ARGOS no painel (depois do menu)
    assert '%%' not in h
    return h


# Modo Limpeza de faixa (modo-faixa-rascunho.js) na página do alimentador, com o croqui misto (croqui-rascunho.js: Leve =
# Expedita, Pesada = Convencional): liga pelo botão em Dados › Downloads › Faixa, por Ctrl+M, pelo lápis no celular e pelo
# menu ☰ (Croqui de limpeza de faixa, que abre alimentadores/<AL>/?modo=faixa). A faixa-rascunho.html (a mesma página, com
# o aviso no alto) continua para os endereços de antes.
def com_modo_faixa(h):
    for x, y in [('<script src="../../assets/croqui.js"></script>', '<script src="../../assets/croqui-rascunho.js"></script>'),
                 ('<script src="../../assets/ativos-zoom.js"></script>',
                  '<script src="../../assets/ativos-zoom.js"></script>\n<script src="../../assets/modo-faixa-rascunho.js"></script>')]:
        assert h.count(x) == 1, x[:50]
        h = h.replace(x, y)
    return h


AVISO_FAIXA = ('<p class="fx-aviso" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:8px 12px;'
               'padding:8px 12px;border-radius:8px;background:#f59e0b;color:#111;font:600 13px/1.4 sans-serif">'
               '<span><b>Limpeza de faixa</b> (rascunho): clique nos trechos → <b>Leve</b> ou <b>Pesada</b> → início e fim '
               '(no poste ou em qualquer ponto da linha) → arraste as bolinhas das pontas para ajustar → <b>Baixar croqui</b>. '
               'Atalho: <b>Ctrl+M</b>.</span>'
               '<button type="button" data-faixa-abre style="min-height:32px;padding:0 12px;border:0;border-radius:6px;'
               'background:#111;color:#fff;font:600 13px sans-serif;cursor:pointer">Abrir o modo Limpeza de faixa</button>'
               '<a href="index.html" style="color:#111">Voltar à página normal</a></p>\n')


def pagina_faixa(h, c):
    """faixa-rascunho.html do alimentador a partir da página dele já com o modo (com_modo_faixa), com o aviso no alto."""
    for x, y in [(f'<title>{html.escape(c["alimentador"])} · trechos</title>',
                  f'<title>Limpeza de faixa · {html.escape(c["alimentador"])}</title>'),
                 ('<div class="wrap">\n', '<div class="wrap">\n' + AVISO_FAIXA)]:
        assert h.count(x) == 1, x[:50]
        h = h.replace(x, y)
    return h


FONTES = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
          '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
          '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600'
          '&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">\n')


def migalhas(inicio, atual):
    """Caminho no topo das páginas: Municípios › página atual (inicio = link da página inicial)."""
    return (f'<nav class="migalhas" aria-label="Caminho"><a href="{inicio}">Municípios</a><span aria-hidden="true">›</span>'
            f'<span aria-current="page">{html.escape(atual)}</span></nav>\n')


# tema antes do CSS (sem piscar): escuro, de fundo preto, por padrão; "claro" só quando escolhido no Night shift do menu
TEMA = ("<script>(function(){var t;try{t=localStorage.getItem('tema')}catch(e){}"
        "document.documentElement.dataset.theme=t==='claro'?'light':'dark'})()</script>")


# Página inicial aberta direto vai para a tela nova (central/); #mapa/<nível> vira ?nivel=<nível>#mapa.
# Mesmo script que está publicado em teste/index.html: sem ele aqui, a próxima geração desfaria o desvio.
TOPO_CENTRAL = "<script>/* tela inicial nova (central/): aberta direto, esta página vai para lá. Dentro do quadro da tela nova, fica como está. */\n(function () {\n  var W = window, L = location;\n  function paraCasca() {\n    var q = L.search.replace(/([?&])classico=1&?/, '$1').replace(/[?&]$/, ''), h = L.hash, n = /^#mapa\\/(.+)$/.exec(h);\n    /* nível do mapa (#mapa/norte/...): a casca usa só #mapa, então o nível vai como ?nivel= */\n    if (n) { q = (q ? q + '&' : '?') + 'nivel=' + n[1]; h = '#mapa'; }\n    L.replace('central/' + q + h);\n  }\n  if (W.top === W) { document.documentElement.style.display = 'none'; paraCasca(); return; }\n})();</script>\n"


def casca(titulo, corpo, raiz, rodape='', sem_rodape=False, topo='', estilos=''):
    return (f'<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8">\n{topo}'
            f'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            f'<meta name="robots" content="noindex, nofollow">\n<title>{html.escape(titulo)}</title>\n'
            f'{TEMA}\n'
            f'{FONTES}<link rel="stylesheet" href="{raiz}assets/site.css">{estilos}</head><body><div class="wrap">\n{corpo}\n'
            + ('' if sem_rodape else f'<footer class="rodape">{rodape}<p><a href="{raiz}relatorio.html">Relatório de validação</a> · '
               f'<a href="{raiz}manifesto.json">manifesto.json</a></p></footer>\n') + '</div>\n'
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


def chi_h(o):
    """Consumidor·hora da ocorrência: o chi por passo da Crítica (critica.ocorrencias). Ocorrência gravada antes
    do campo chi: consumidores × maior duração, que superestima (cerca de 2× em mai/2026); resumo_nae conta essas."""
    if o.get('chi') is not None:
        return o['chi']
    return (o.get('cons') or 0) * (o.get('dur') or 0) / 60


def resumo_nae(dados):
    """Totais das NAE dos alimentadores publicados para o resumo do processamento e o relatório: consumidor·hora,
    ocorrências sem chi por passo (estimado), acima de 24 h (long), momentâneas (mom) e em dia crítico (dc)."""
    oc = [o for c in dados if c['validacao']['status'] != 'falha' for o in (c.get('nae') or {}).get('oc', [])]
    # sem a marca (gravada antes): pela duração, que já vinha no JSON
    longas = [o for o in oc if (o['long'] if 'long' in o else (o.get('dur') or 0) > critica.LONGA_MIN)]
    return dict(n=len(oc), chi=round(sum(map(chi_h, oc))), sem_chi=sum(1 for o in oc if o.get('chi') is None),
                long=len(longas), long_chi=round(sum(map(chi_h, longas))), long_max=max((o['dur'] for o in longas), default=0),
                mom=sum(1 for o in oc if o.get('mom')), dc=sum(1 for o in oc if o.get('dc')))


def texto_resumo_nae(r):
    mil = lambda x: f'{x:,}'.replace(',', '.')       # separador de milhar do português
    t = (f'NAE: {r["n"]} ocorrência(s) · {mil(r["chi"])} consumidor·hora · acima de 24 h: {r["long"]} '
         f'({mil(r["long_chi"])} cons·h, maior {mil(r["long_max"])} min) · momentâneas: {r["mom"]} · '
         f'em dia crítico: {r["dc"]}')
    if r['sem_chi']:
        t += (f' · {r["sem_chi"]} sem chi por passo (cons × maior duração, estimado; momentâneas e dia crítico só '
              'nas reprocessadas)')
    return t


def nae_por_municipio(dados):
    """NAE de cada município (código IBGE → ocorrências): cada ocorrência conta no município onde o trecho dela tem mais
    rede; sem trecho, no município onde o alimentador tem mais rede (mesma ideia do polo em ranking_polos)."""
    nae = {}
    for (cod, _), n in nae_municipio_alimentador(dados).items():
        nae[cod] = nae.get(cod, 0) + n
    return nae


def nae_municipio_alimentador(dados):
    """(código IBGE, alimentador) → ocorrências, com a mesma regra de nae_por_municipio. É o `nm` de cada alimentador no
    mapa: a NAE dele dentro do município, em vez da do alimentador inteiro."""
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
                k = (cod, c['alimentador'])
                nae[k] = nae.get(k, 0) + 1
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
    nae_ma = nae_municipio_alimentador(dados)
    nae_mun = {}
    for (cod, _), n in nae_ma.items():
        nae_mun[cod] = nae_mun.get(cod, 0) + n
    nae_al = {c['alimentador']: len((c.get('nae') or {}).get('oc', [])) for c in dados if c['validacao']['status'] != 'falha'}
    muns = []
    for g in geo['muns']:
        m = por_cod.get(g['cod'])
        g = dict(g, nae=nae_mun.get(g['cod'], 0))
        if g['cod'] in polo_de:
            g = dict(g, reg=polo_de[g['cod']]['regional'], polo=polo_de[g['cod']]['nome'])
        if m:
            g = dict(g, nome=m['nome'], slug=m['slug'], als=[dict(cod=a['cod'], se=a['se_nome'], m=a['m_no_municipio'],
                                                                  n=nae_al.get(a['cod'], 0), nm=nae_ma.get((g['cod'], a['cod']), 0))
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
            chi=round(sum(map(chi_h, oc))),             # por passo; sem o campo chi, estimado (chi_h)
            long=sum(1 for o in oc if o.get('long')),
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


# lon/lat → coordenadas do mapa de municípios da página inicial (mapa-municipios-geo.json, já projetado).
# Ajuste por regressão + refino com a rede dos alimentadores que ficam quase todos num município só: 96,7% dos pontos
# dos vãos caem dentro do município certo (o resto fica na divisa, onde a malha simplificada do mapa perde detalhe).
PROJ_MUN = (112.8878, 5722.7136, -111.6377, -574.6836)     # x = a·lon + b, y = c·lat + d
REDE_TOL = 25                                              # m do Douglas–Peucker na rede da prévia


def redes_mapa(saida, dados):
    """dados/redes/<AL>.json: a rede de cada alimentador já nas coordenadas do mapa de municípios, para a prévia do
    município aberto na página inicial (mapa-municipios.js). {d: path SVG (linhas encadeadas e simplificadas),
    b: [x0, y0, x1, y1]}. Só a forma: as contas (NAE, km) continuam saindo dos dados de cada alimentador.
    Devolve {AL: linhas [(x, y), ...]} com os mesmos números do d (para o raiox.txt)."""
    a, b, c_, d = PROJ_MUN
    pasta = saida / 'dados' / 'redes'
    pasta.mkdir(parents=True, exist_ok=True)
    redes = {}
    for c in dados:
        if c['validacao']['status'] == 'falha':
            continue
        viz = {}
        for v in c['vaos']:
            p, q = (v[0], v[1]), (v[2], v[3])
            if p != q:
                viz.setdefault(p, []).append(q)
                viz.setdefault(q, []).append(p)
        usados, linhas = set(), []
        # encadeia: começa nas pontas e nos pontos de derivação (grau ≠ 2) e anda até o próximo deles
        inicios = [p for p, ns in viz.items() if len(ns) != 2] or list(viz)[:1]
        for p0 in inicios + list(viz):
            for q in viz[p0]:
                if (p0, q) in usados:
                    continue
                linha, prev, cur = [p0], p0, q
                usados |= {(p0, q), (q, p0)}
                while True:
                    linha.append(cur)
                    if len(viz[cur]) != 2:
                        break
                    nxt = viz[cur][0] if viz[cur][1] == prev else viz[cur][1]
                    if (cur, nxt) in usados:
                        break
                    usados |= {(cur, nxt), (nxt, cur)}
                    prev, cur = cur, nxt
                linhas.append(_dp(linha, REDE_TOL))
        xy = [[(round(a * lon + b, 2), round(c_ * lat + d, 2)) for lon, lat in ln] for ln in linhas]
        xs = [x for ln in xy for x, _ in ln]
        ys = [y for ln in xy for _, y in ln]
        f = lambda v: f'{v:g}'
        grava_json(pasta / f'{c["alimentador"]}.json', dict(
            d=''.join('M' + 'L'.join(f'{f(x)},{f(y)}' for x, y in ln) for ln in xy),
            b=[min(xs), min(ys), max(xs), max(ys)]))
        redes[c['alimentador']] = xy
    return redes


# dados/redes/raiox.txt: a rede de todos os alimentadores do mapa da página inicial num arquivo só, já reduzida para o
# Raio-X (assets/mapa-raiox.js, Ctrl+X), no lugar de baixar os ~300 dados/redes/<AL>.json e reduzir no navegador. No
# estado inteiro um ponto a cada ~0,4 px da tela basta: os pontos do <AL>.json vão para uma grade de RAIOX_DIV passos na
# largura do mapa (q = (w + 12) / RAIOX_DIV unidades do mapa, a do viewBox), os segmentos repetidos e os de comprimento
# zero saem, os que sobram são encadeados em linhas (_trilhas: cada derivação continua pelo vão mais reto) e cada linha
# passa por um Douglas–Peucker de RAIOX_TOL passos da grade entre as derivações (que ficam: as linhas se encontram).
# 1ª linha: "raiox", a versão do formato e q; depois uma linha de texto por alimentador (na ordem do mapa, a de
# window.MUN): o código, uma tabulação e as linhas da rede separadas por espaço, cada uma em polyline (o do Google) com os
# inteiros da grade (x, y); cada ponto é a diferença do anterior, também de uma linha e de um alimentador para o seguinte
# (o 1º do arquivo é a diferença de 0, 0). A versão (8 hex) vai no endereço (?v=, no data-rede do script na página inicial).
RAIOX_DIV = 2600
RAIOX_TOL = 0.5


def _dp_plano(pts, tol):
    """Douglas–Peucker (pontas mantidas) no plano, com a distância nas unidades dos pontos."""
    manter, pilha, t2 = [False] * len(pts), [(0, len(pts) - 1)], tol * tol
    manter[0] = manter[-1] = True
    while pilha:
        i, j = pilha.pop()
        ax, ay = pts[i]
        dx, dy = pts[j][0] - ax, pts[j][1] - ay
        l2, dmax, k = dx * dx + dy * dy, t2, None
        for m in range(i + 1, j):
            px, py = pts[m][0] - ax, pts[m][1] - ay
            f = max(0, min(1, (px * dx + py * dy) / l2)) if l2 else 0
            d = (px - f * dx) ** 2 + (py - f * dy) ** 2
            if d > dmax:
                dmax, k = d, m
        if k is not None:
            manter[k] = True
            pilha += [(i, k), (k, j)]
    return [p for p, f in zip(pts, manter) if f]


def raiox_txt(redes, q):
    """[(AL, linhas [(x, y), ...] nas unidades do mapa), ...] → texto do raiox.txt (ver acima), na ordem dada."""
    g = lambda v: math.floor(v / q + 0.5)                   # o Math.round do navegador
    x0 = y0 = 0
    out = [f'raiox\t1\t{q!r}']
    for al, linhas in redes:
        segs = set()
        for ln in linhas:
            pts = [(g(x), g(y)) for x, y in ln]
            segs |= {(min(p, q_), max(p, q_)) for p, q_ in zip(pts, pts[1:]) if p != q_}
        grau = {}
        for p, q_ in segs:
            grau[p] = grau.get(p, 0) + 1
            grau[q_] = grau.get(q_, 0) + 1
        fixos = {p for p, n in grau.items() if n != 2}
        partes = []
        for linha, manter in _trilhas(sorted(segs), fixos):
            idx = sorted(manter)
            pts = [linha[0]]
            for i, j in zip(idx, idx[1:]):
                pts += _dp_plano(linha[i:j + 1], RAIOX_TOL)[1:]
            t = ''
            for x, y in pts:
                t += _poli(x - x0) + _poli(y - y0)
                x0, y0 = x, y
            partes.append(t)
        if partes:
            out.append(al + '\t' + ' '.join(partes))
    return ''.join(x + '\n' for x in out)


def raiox_mapa(saida, redes, man):
    """dados/redes/raiox.txt (ver acima) com os alimentadores do mapa da página inicial (os de window.MUN, na mesma
    ordem); só regrava se mudou. Devolve a versão (8 hex do arquivo)."""
    geo = json.loads((PKG / 'site' / 'mapa-municipios-geo.json').read_text(encoding='utf-8'))
    por_cod = {m['cod']: m for m in man['municipios']}
    ordem = []
    for g in geo['muns']:
        for a in (por_cod[g['cod']]['alimentadores'] if g['cod'] in por_cod else ()):
            if a['cod'] not in ordem and a['cod'] in redes:
                ordem.append(a['cod'])
    b = raiox_txt([(al, redes[al]) for al in ordem], (geo['w'] + 12) / RAIOX_DIV).encode('utf-8')
    arq = saida / 'dados' / 'redes' / 'raiox.txt'
    arq.parent.mkdir(parents=True, exist_ok=True)
    if not arq.exists() or arq.read_bytes() != b:
        arq.write_bytes(b)
    return hashlib.sha1(b).hexdigest()[:8]


# ---------------------------------------------------------------- alimentadores vizinhos no mapa do alimentador

# dados/vizinhos/: a rede dos outros alimentadores, que o mapa do alimentador desenha por baixo da dele quando aparecem
# na tela (assets/vizinhos.js). Só a forma, por classe: os vãos encadeados em linhas, simplificados (Douglas–Peucker) em
# dois níveis e codificados em polyline (o do Google: [lat, lon] × 1e5, ~1 m). Por alimentador, três arquivos de texto:
#   <AL>.1.txt  T1 e T2, grosso (de longe)      <AL>.2.txt  T3, grosso (aproximando)      <AL>.3.txt  T1, T2 e T3, fino (de perto)
# Cada arquivo tem uma linha de texto por classe (T1, T2 e T3, nessa ordem; a que o arquivo não leva fica vazia) e nela
# as linhas da rede, separadas por espaço. Cada ponto é a diferença do anterior, também de uma linha para a seguinte e de
# uma classe para a outra (o 1º do arquivo é a diferença de 0, 0).
# Os equipamentos que o mapa do alimentador mostra (das mesmas fontes que ele, na página: principais e fusíveis do
# dados.js, chaves.js e ativos.js), em mais três arquivos:
#   <AL>.4.txt  de perto (zoom 15): DJ, religador, fusível, fusível de seccionamento ou no tronco (SEC, FTR) e chave
#   <AL>.5.txt  mais perto (zoom 16): transformador e os outros equipamentos
#   <AL>.6.txt  o tipo e o código de cada um: só para o balão (o vizinhos.js baixa quando o mouse ou o toque chega num)
# No .4 e no .5, uma linha de texto por grupo (VIZ_EQ, nessa ordem) com os pontos em polyline como acima (diferença do
# anterior, desde 0, 0 no começo do arquivo), na ordem da curva de Hilbert: um ponto perto do seguinte (diferenças
# pequenas) e cada bloco de pontos seguidos numa área pequena (o vizinhos.js acha os da tela por blocos). No .6, as
# mesmas linhas (as do .4 e depois as do .5), com os itens na mesma ordem, separados por tabulação: o código (DJ,
# religador, transformador) ou o tipo, um espaço e o código (os outros).
# indice.json: {"v": 2, "als": {AL: [sul, oeste, norte, leste, versão, bytes do .1, do .2, do .3, versão dos
# equipamentos, bytes do .4, do .5]}, "estado": [versão, bytes do estado.txt]}. Cada versão (8 hex dos arquivos dela) vai
# no endereço (?v=): o navegador baixa de novo só o que mudou. Sem equipamentos: versão '' e 0 bytes (e nenhum .4, .5 ou .6).
# estado.txt: o T1 e o T2 de todos os alimentadores num arquivo só, bem simplificado (ESTADO_TOL), para o mapa do
# alimentador mostrar o Tocantins inteiro de longe (assets/visao-tocantins.js, abaixo do zoom em que os vizinhos entram).
# Uma linha de texto por alimentador: o código, uma tabulação, as linhas do T1 (separadas por espaço), outra tabulação e
# as do T2. Polyline com 4 casas ([lat, lon] × 1e4, ~11 m: de longe 1 pixel tem mais de 300 m); cada ponto é a diferença
# do anterior, também de uma linha, classe e alimentador para o seguinte (o 1º do arquivo é a diferença de 0, 0).
VIZ_TOL = (10, 1)          # m do Douglas–Peucker: grosso (até o zoom 15, onde 1 pixel tem ~5 m) e fino
VIZ_MIN = 20               # m: no grosso fica de fora a linha mais curta que isso (de longe, menos de 1 pixel)
VIZ_ARQ = re.compile(r'^[A-Za-z0-9_-]+\.[1-6]\.txt$')
VIZ_EQ = ('DRfgc', 'te')   # grupos do .4 e do .5: D DJ, R religador, f fusível, g fusível SEC/FTR, c chave; t transformador, e outro
ESTADO_TOL = 150          # m do Douglas–Peucker do estado.txt (no zoom 9, onde os vizinhos entram, 1 pixel tem ~300 m)
ESTADO_MIN = 60           # m: a linha mais curta que isso fica de fora. Não mais: a rede urbana é feita de pedaços curtos
                          # (entre derivações) que, juntos, aparecem de longe; com 400 m o T1 de 4,8 km do AL04040004
                          # ficava com 17% e 21 alimentadores ficavam de fora (com 60 m, 14, que só têm uns metros de
                          # T1: o DJ e o 1º equipamento); o arquivo passa de ~72 KB para ~110 KB


def _poli(n):
    """Inteiro → texto do polyline do Google (5 bits por caractere, de '?' a '~')."""
    n = ~(n << 1) if n < 0 else n << 1
    s = ''
    while n >= 0x20:
        s += chr((0x20 | (n & 0x1f)) + 63)
        n >>= 5
    return s + chr(n + 63)


def _trilhas(segs, fixos):
    """Vãos ((lon, lat), (lon, lat)) → linhas: cada uma começa numa ponta (ou derivação) e segue pelo vão mais reto a cada
    derivação, até não haver vão livre; cada vão entra uma vez. Devolve [(pontos, índices que o Douglas–Peucker mantém)]:
    as derivações da rede inteira (`fixos`, de todas as classes) ficam, e as linhas de classes diferentes se encontram."""
    viz = {}
    for p, q in segs:
        if p != q:
            viz.setdefault(p, set()).add(q)
            viz.setdefault(q, set()).add(p)
    usados, out = set(), []

    def curva(a, b, c):                              # -cosseno da volta em b (a mais reta é a menor)
        ux, uy, vx, vy = (b[0] - a[0]) * KX, (b[1] - a[1]) * KY, (c[0] - b[0]) * KX, (c[1] - b[1]) * KY
        return -(ux * vx + uy * vy) / ((math.hypot(ux, uy) * math.hypot(vx, vy)) or 1)
    for p0 in sorted(viz, key=lambda p: (len(viz[p]) != 1, p)):     # pontas primeiro
        while True:
            livres = sorted(q for q in viz[p0] if (p0, q) not in usados)
            if not livres:
                break
            linha = [p0, livres[0]]
            usados |= {(p0, livres[0]), (livres[0], p0)}
            while True:
                a, b = linha[-2], linha[-1]
                livres = [c for c in viz[b] if (b, c) not in usados]
                if not livres:
                    break
                c = min(livres, key=lambda c: (curva(a, b, c), c))
                usados |= {(b, c), (c, b)}
                linha.append(c)
            out.append((linha, {0, len(linha) - 1} | {i for i, p in enumerate(linha) if p in fixos}))
    return out


def _codifica(secoes, tol, minimo):
    """Linhas de cada classe → texto do arquivo (ver acima), com o Douglas–Peucker de `tol` m entre os pontos mantidos.
    Devolve também os pontos gravados ([lat, lon] × 1e5), para a caixa do índice."""
    la0 = lo0 = 0
    partes, todos = [], []
    for linhas in secoes:
        sec = []
        for linha, fixos in linhas:
            if minimo and sum(math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY) for a, b in zip(linha, linha[1:])) < minimo:
                continue
            idx = sorted(fixos)
            pts = [linha[0]]
            for i, j in zip(idx, idx[1:]):
                pts += _dp(linha[i:j + 1], tol)[1:]
            q = [(round(y * 1e5), round(x * 1e5)) for x, y in pts]
            q = q[:1] + [p for a, p in zip(q, q[1:]) if p != a]
            if len(q) < 2:
                continue
            s = ''
            for la, lo in q:
                s += _poli(la - la0) + _poli(lo - lo0)
                la0, lo0 = la, lo
            sec.append(s)
            todos += q
        partes.append(' '.join(sec))
    return '\n'.join(partes), todos


def rede_vizinho(segs):
    """{'T1': [((lon, lat), (lon, lat)), ...], 'T2': ..., 'T3': ...} → ([texto do .1, do .2, do .3], [sul, oeste, norte,
    leste]); sem rede, (None, None)."""
    grau = {}
    for p, q in {(min(p, q), max(p, q)) for ss in segs.values() for p, q in ss if p != q}:
        grau[p] = grau.get(p, 0) + 1
        grau[q] = grau.get(q, 0) + 1
    fixos = {p for p, g in grau.items() if g != 2}
    tr = {c: _trilhas(segs.get(c, ()), fixos) for c in CLASSES}
    grosso, fino = VIZ_TOL
    t1, _ = _codifica([tr['T1'], tr['T2'], []], grosso, VIZ_MIN)
    t2, _ = _codifica([[], [], tr['T3']], grosso, VIZ_MIN)
    t3, pts = _codifica([tr['T1'], tr['T2'], tr['T3']], fino, 0)
    if not pts:
        return None, None
    las, los = [p[0] for p in pts], [p[1] for p in pts]
    return [t1, t2, t3], [min(las) / 1e5, min(los) / 1e5, max(las) / 1e5, max(los) / 1e5]


def estado_txt(redes):
    """[(AL, {'T1': [((lon, lat), (lon, lat)), ...], 'T2': ...}), ...] → texto do estado.txt (ver acima): por alimentador,
    T1 e T2 encadeados em linhas, só as pontas fixas (de longe a derivação não aparece), Douglas–Peucker de ESTADO_TOL m."""
    la0 = lo0 = 0
    out = []
    for al, segs in sorted(redes, key=lambda x: x[0]):
        cls = []
        for c in ('T1', 'T2'):
            sec = []
            for linha, _ in _trilhas(segs.get(c, ()), set()):
                if sum(math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY) for a, b in zip(linha, linha[1:])) < ESTADO_MIN:
                    continue
                q = [(round(y * 1e4), round(x * 1e4)) for x, y in _dp(linha, ESTADO_TOL)]
                q = q[:1] + [p for a, p in zip(q, q[1:]) if p != a]
                if len(q) < 2:
                    continue
                t = ''
                for la, lo in q:
                    t += _poli(la - la0) + _poli(lo - lo0)
                    la0, lo0 = la, lo
                sec.append(t)
            cls.append(' '.join(sec))
        if any(cls):
            out.append(al + '\t' + '\t'.join(cls))
    return ''.join(x + '\n' for x in out)


# ---------------------------------------------------------------- limpeza de faixa no satélite da página inicial

# dados/redes/faixa.txt: a situação da limpeza de faixa de HOJE (a data de geração, no cabeçalho) de cada trecho T1 e T2,
# com a forma dele, para o satélite da página inicial (assets/mapa-sat-to.js) pintar as linhas na visão "Limpeza de
# faixa" (baixado só quando essa visão é escolhida com o satélite aberto). A regra é a da camada Faixa do mapa do
# alimentador (alimentador/site/limpeza.js), a mesma conta: a situação de cada vão pela data da OS executada mais recente
# dele (limpeza.js: vaos → os) e o prazo da classe (regra_anos do limpeza.js: T1 3 anos, T2 4, T3 5): vencida, vence em
# até 12 meses ou em dia; vão sem OS, sem registro. A do trecho é a PIOR com extensão relevante (mais de 300 m ou de 10%
# do trecho; sitTrecho). A classe sai do nome do trecho (T1, T2-A → T2): os trechos reclassificados entram sem mudar nada.
# Texto, uma linha por registro:
#   #{"v": 2, "hoje": "AAAA-MM-DD", "sit": ["dia", "vence", "vencida", "sem"], "anos": [2026, ...]}   cabeçalho (JSON)
#   M<tab>município (IBGE)<tab>m em dia<tab>m vence<tab>m vencida<tab>m sem registro    (a soma é a de todos os T1 e T2)
#   Y<tab>município<tab>ano:m,...,sem:m,c:m,p:m   vista Por ano: m de cada vão no ano mais recente dele (ou sem registro;
#                                                 a soma é a de todos os T1 e T2) e, à parte, os de OS criada (c) e pendente (p)
#   A<tab>alimentador
#   T<tab>trecho<tab>classe<tab>situação (0-3)<tab>última limpeza (AAAA-MM-DD ou vazio)<tab>m<tab>prazo (anos)<tab>linhas
#   P<tab>anos (do mais recente; vazio: sem registro)<tab>marcas (c criada, p pendente)<tab>m<tab>linhas
#       os pedaços do trecho acima na vista Por ano da camada Faixa (os vãos com os mesmos anos e marcas; Douglas–Peucker
#       de FAIXA_TOL m): a cor do vão é a do ano mais recente entre os ligados; criadas e pendentes, o traço por cima
#   O<tab>lat<tab>lon<tab>data<tab>ano<tab>nº de OS<tab>datas (vírgula)<tab>trechos (" / ")<tab>m limpos deles<tab>m deles
#       as etiquetas das OS do alimentador (limpeza.js, etiquetas(), com todos os anos e só T1 e T2 à vista): no ponto, a
#       cor do ano, "<trechos> <datas> <nº de OS ·> <m limpos> de <m> km"; as que se cruzam, a mais recente fica
# As linhas do trecho como no estado.txt (polyline, 1e-4 grau, a diferença acumulando pelo arquivo inteiro; Douglas–Peucker
# de ESTADO_TOL m; separadas por espaço); alimentador cujas linhas somem todas (só uns metros de rede): no seu maior
# trecho, um ponto ("!" e o ponto; não "@", que é um caractere do polyline: a linha que começava com ele era lida como
# ponto e desalinhava o acumulado do resto do arquivo). Os metros de cada trecho vão ao município de cada vão: o do
# trecho (trecho_mun) se é um só; senão o meio do vão nas divisas do alimentador (divisas.js), e fora delas a mais perto.
FAIXA_SIT = ('dia', 'vence', 'vencida', 'sem')
FAIXA_PIOR = ('vencida', 'sem', 'vence', 'dia')
FAIXA_REGRA = {'T1': 3, 'T2': 4, 'T3': 5}            # (só se o limpeza.js não trouxer a dele)
FAIXA_TOL = 30            # m do Douglas–Peucker dos pedaços da vista Por ano (P): no zoom 13 1 pixel tem ~19 m


def _mais_anos(d, n):
    """d + n anos como o setFullYear do JavaScript (29/02 num ano que não é bissexto vira 01/03)."""
    try:
        return d.replace(year=d.year + n)
    except ValueError:
        return date(d.year + n, 3, 1)


def faixa_trechos(d, lp, hoje):
    """dados.js e limpeza.js de um alimentador → [{nome, classe, sit, ult, ext, prazo, vaos, m, pec}] dos trechos T1 e
    T2, na ordem do dados.js (a conta de limpeza.js: situacao, resumoTrecho e sitTrecho). pec: os vãos do trecho por
    (anos, marcas) da vista Por ano da camada Faixa (ver faixa_vao)."""
    lp = lp or {}
    regra = dict(FAIXA_REGRA, **(lp.get('regra_anos') or {}))
    oss = lp.get('os') or []
    ult_vao = {}
    for vid, ks in (lp.get('vaos') or {}).items():
        ds = [oss[k]['data'][:10] for k in ks if 0 <= k < len(oss) and oss[k].get('data')]
        ult_vao[vid] = max(ds) if ds else None
    um_ano, memo = _mais_anos(hoje, 1), {}
    pv = faixa_vao(lp)

    def situacao(data, cl):
        if not data:
            return 'sem'
        if (data, cl) not in memo:
            v = _mais_anos(date.fromisoformat(data), regra[cl])
            memo[data, cl] = 'vencida' if v < hoje else 'vence' if v < um_ano else 'dia'
        return memo[data, cl]
    nomes = [t['nome'] for t in d['trechos']]
    por, ordem = {}, []
    for v in d['vaos']:
        n = nomes[v[4]]
        if n not in por:
            por[n] = []
            ordem.append(n)
        por[n].append(v)
    out = []
    for n in sorted(ordem, key=nomes.index):
        cl = classe(n)
        if cl not in ('T1', 'T2'):
            continue
        m, ult, ext, pec = dict.fromkeys(FAIXA_SIT, 0.0), None, 0.0, {}
        for v in por[n]:
            u = ult_vao.get(str(v[5]))
            ext += v[8]
            m[situacao(u, cl)] += v[8]
            if u and (not ult or u > ult):
                ult = u
            pec.setdefault(pv.get(str(v[5]), FAIXA_SEM_OS), []).append(v)
        rel = lambda k: m[k] > 300 or m[k] > 0.1 * ext
        sit = next((k for k in FAIXA_PIOR if m[k] and rel(k)), None) or next((k for k in FAIXA_PIOR if m[k]), 'sem')
        out.append(dict(nome=n, classe=cl, sit=sit, ult=ult, ext=ext, prazo=regra[cl], vaos=por[n], m=m,
                        pec=sorted(pec.items(), key=lambda kv: (len(kv[0][0]) > 0, kv[0][0][:1], kv[0]))))
    return out


# Vista Por ano da camada Faixa (limpeza.js: linhas e etiquetas) no satélite. Cada vão: os anos das OS executadas que
# contam (sem as parciais, campo "mae": elas não pintam vãos) com ele (a cor é a do mais recente entre os anos ligados) e as
# marcas das não executadas que contam: c criada (CRIADA), p pendente (a reprogramar, reprogramada e qualquer outra).
FAIXA_SEM_OS = ((), '')


def _anoOS(o):
    return int(o['data'][:4]) if o.get('data') else None


def faixa_vao(lp):
    """limpeza.js → {id do vão: (anos, do mais recente ao mais antigo; marcas 'c', 'p' ou 'cp')} dos vãos com OS que conta."""
    oss = (lp or {}).get('os') or []
    out = {}
    for vid, ks in ((lp or {}).get('vaos') or {}).items():
        anos, c, p = set(), False, False
        for k in ks:
            if not 0 <= k < len(oss) or oss[k].get('mae'):
                continue
            o = oss[k]
            if o.get('data'):
                anos.add(_anoOS(o))
            if o.get('sit') != 'EXECUTADA':
                if o.get('sit') == 'CRIADA':
                    c = True
                else:
                    p = True
        ch = (tuple(sorted(anos, reverse=True)), ('c' if c else '') + ('p' if p else ''))
        if ch != FAIXA_SEM_OS:
            out[vid] = ch
    return out


def _chaves_js(d):
    """As chaves de um objeto na ordem do Object.keys do JavaScript: as de índice inteiro primeiro, em ordem crescente."""
    idx = lambda k: k.isdigit() and (k == '0' or k[0] != '0') and int(k) < 2 ** 32 - 1
    return sorted((k for k in d if idx(k)), key=int) + [k for k in d if not idx(k)]


def faixa_rotulos(d, lp, classes=('T1', 'T2')):
    """As etiquetas das OS da camada Faixa (limpeza.js, etiquetas(), com todos os anos ligados e só as classes `classes`
    à vista) → [(lat, lon, data da 1ª OS, ano dela, nº de OS, datas, trechos, m limpos deles, m deles)]."""
    lp = lp or {}
    oss = lp.get('os') or []
    if not oss:
        return []
    nomes = [t['nome'] for t in d['trechos']]
    por_id = {str(v[5]): v for v in d['vaos']}
    vaos_os = [[] for _ in oss]
    for vid in _chaves_js(lp.get('vaos') or {}):
        v = por_id.get(vid)
        if v is not None:
            for k in lp['vaos'][vid]:
                if 0 <= k < len(oss):
                    vaos_os[k].append(v)
    prin = [k for k, o in enumerate(oss) if not o.get('mae')]
    anos = sorted({_anoOS(oss[k]) for k in prin if oss[k].get('data')}, reverse=True)
    os_ano = {a: sorted((k for k in prin if oss[k].get('data') and _anoOS(oss[k]) == a), key=lambda k: oss[k]['data'], reverse=True) for a in anos}
    topo = {}
    for a in anos:
        for k in os_ano[a]:
            for v in vaos_os[k]:
                if topo.get(v[5], 0) < a:
                    topo[v[5]] = a
    ext = {}
    for v in d['vaos']:
        ext[nomes[v[4]]] = ext.get(nomes[v[4]], 0.0) + v[8]
    vis = lambda v: classe(nomes[v[4]]) in classes
    ms, usados = [], {}
    for a in anos:
        for k in os_ano[a]:
            vs = [v for v in vaos_os[k] if vis(v) and topo.get(v[5]) == a]
            if not vs:
                continue
            lat, lon = sum(v[0] for v in vs) / len(vs), sum(v[1] for v in vs) / len(vs)
            c, melhor, dmin = math.cos(lat * math.pi / 180), None, math.inf
            for v in vs:                                          # maisPerto()
                ax, ay, bx, by, px, py = v[1] * c, v[0], v[3] * c, v[2], lon * c, lat
                dx, dy = bx - ax, by - ay
                l2 = dx * dx + dy * dy
                f = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) if l2 else 0
                dd = (ax + f * dx - px) ** 2 + (ay + f * dy - py) ** 2
                if dd < dmin:
                    dmin, melhor = dd, v
            if melhor[5] in usados:
                usados[melhor[5]].append(k)
                continue
            usados[melhor[5]] = [k]
            ms.append((melhor, usados[melhor[5]]))
    out = []
    for v, ks in ms:
        mt = {}
        for x in vaos_os[ks[0]]:
            n = nomes[x[4]]
            mt[n] = mt.get(n, 0.0) + x[8]
        ns = sorted(mt, key=lambda n: -mt[n])
        tronco = [n for n in ns if classe(n) != 'T3']
        ns = tronco[:2] if tronco else ns[:1]
        un = {}
        for k in ks:
            for x in vaos_os[k]:
                un[id(x)] = x
        feito = sum(x[8] for x in un.values() if nomes[x[4]] in ns)
        out.append(((v[0] + v[2]) / 2, (v[1] + v[3]) / 2, oss[ks[0]]['data'], _anoOS(oss[ks[0]]), len(ks),
                    [oss[k]['data'] for k in ks], ns, feito, sum(ext[n] for n in ns)))
    return out


class _Divisas:
    """Peças do divisas.js de um alimentador (o município recortado na caixa dele, [lat, lon]): o município de um ponto
    (par/ímpar, com as arestas em faixas de 0,01° de latitude) ou, fora de todas, o da peça mais perto."""
    F = 0.01

    def __init__(self, pecas):
        self.pecas = []
        for p in pecas or ():
            faixas = {}
            for r in p.get('linhas') or ():
                for (a1, o1), (a2, o2) in zip(r, r[1:] + r[:1]):
                    if a1 == a2:
                        continue
                    for f in range(math.floor(min(a1, a2) / self.F), math.floor(max(a1, a2) / self.F) + 1):
                        faixas.setdefault(f, []).append((a1, o1, a2, o2))
            if faixas:
                self.pecas.append((p['cod'], faixas, [q for r in p['linhas'] for q in r]))

    def em(self, la, lo, cands=None):
        for cod, faixas, _ in self.pecas:
            if cands and cod not in cands:
                continue
            d = False
            for a1, o1, a2, o2 in faixas.get(math.floor(la / self.F), ()):
                if (a1 > la) != (a2 > la) and lo < (o2 - o1) * (la - a1) / (a2 - a1) + o1:
                    d = not d
            if d:
                return cod
        return None

    def perto(self, la, lo, cands=None):
        c, melhor = math.cos(math.radians(la)), (math.inf, None)
        for cod, _, pts in self.pecas:
            if cands and cod not in cands:
                continue
            for a, o in pts:
                dd = (a - la) ** 2 + ((o - lo) * c) ** 2
                if dd < melhor[0]:
                    melhor = (dd, cod)
        return melhor[1]


def faixa_txt(site, hoje, tol=None):
    """Pasta do site (com alimentadores/<AL>/dados.js, limpeza.js e divisas.js) → (texto do faixa.txt, resumo:
    {alimentadores, trechos, m por situação, fora: vãos fora das divisas, pedacos, rotulos, anos: m por ano})."""
    site = Path(site)
    tol = FAIXA_TOL if tol is None else tol
    la0 = lo0 = 0

    def enc(q):
        nonlocal la0, lo0
        t = ''
        for la, lo in q:
            t += _poli(la - la0) + _poli(lo - lo0)
            la0, lo0 = la, lo
        return t

    def linhas(vaos, t):
        segs = [((v[1], v[0]), (v[3], v[2])) for v in vaos]
        ls = []
        for linha, _ in _trilhas(segs, set()):
            q = [(round(y * 1e4), round(x * 1e4)) for x, y in _dp(linha, t)]
            q = q[:1] + [b for a, b in zip(q, q[1:]) if b != a]
            if len(q) >= 2:
                ls.append(q)
        return ls
    nova = lambda: dict.fromkeys(FAIXA_SIT, 0.0)
    muns, anos_mun, corpo = {}, {}, []
    res = dict(alimentadores=0, trechos=0, m=nova(), fora=0, pedacos=0, rotulos=0, anos={})

    def soma_ano(cod, ch, m):                    # m da vista Por ano no município: o ano mais recente do vão, sem, c, p
        y = anos_mun.setdefault(cod, {})
        k = str(ch[0][0]) if ch[0] else 'sem'
        y[k] = y.get(k, 0.0) + m
        res['anos'][k] = res['anos'].get(k, 0.0) + m
        for f in ch[1]:
            y[f] = y.get(f, 0.0) + m
            res['anos'][f] = res['anos'].get(f, 0.0) + m
    for p in sorted(site.glob('alimentadores/*/dados.js')):
        if not (p.parent / 'index.html').exists():
            continue
        d = le_js(p)
        if not d or not d.get('vaos'):
            continue
        lp = le_js(p.parent / 'limpeza.js')
        trs = faixa_trechos(d, lp, hoje)
        if not trs:
            continue
        pv = faixa_vao(lp)
        tm = (d.get('meta') or {}).get('trecho_mun') or {}
        div = None
        geo = []
        for t in trs:
            geo.append(linhas(t['vaos'], ESTADO_TOL))
            # metros por município (a situação do trecho; e, de cada vão, a vista Por ano)
            cands = [c for c in tm.get(t['nome']) or () if c and c != 'None']
            if len(cands) == 1:
                muns.setdefault(cands[0], nova())[t['sit']] += t['ext']
                for v in t['vaos']:
                    soma_ano(cands[0], pv.get(str(v[5]), FAIXA_SEM_OS), v[8])
            else:
                if div is None:
                    div = _Divisas(le_js(p.parent / 'divisas.js'))
                cs = set(cands) or None
                for v in t['vaos']:
                    la, lo = (v[0] + v[2]) / 2, (v[1] + v[3]) / 2
                    cod = div.em(la, lo, cs) or div.em(la, lo)
                    if not cod:
                        res['fora'] += 1
                        cod = div.perto(la, lo, cs) or (cands[0] if cands else None)
                    if cod:
                        muns.setdefault(cod, nova())[t['sit']] += v[8]
                        soma_ano(cod, pv.get(str(v[5]), FAIXA_SEM_OS), v[8])
        sem_linha = not any(geo)
        corpo.append('A\t' + p.parent.name)
        maior = max(range(len(trs)), key=lambda i: trs[i]['ext'])
        for i, (t, ls) in enumerate(zip(trs, geo)):
            if sem_linha and i == maior:
                v = max(t['vaos'], key=lambda v: v[8])
                g = '!' + enc([(round((v[0] + v[2]) / 2 * 1e4), round((v[1] + v[3]) / 2 * 1e4))])
            else:
                g = ' '.join(enc(q) for q in ls)
            corpo.append('\t'.join(('T', t['nome'], t['classe'], str(FAIXA_SIT.index(t['sit'])), t['ult'] or '',
                                    str(round(t['ext'])), str(t['prazo']), g)))
            res['m'][t['sit']] += t['ext']
            if sem_linha:
                continue
            for (anos, marcas), vs in t['pec']:
                ps = linhas(vs, tol)
                if ps:
                    corpo.append('\t'.join(('P', ','.join(map(str, anos)), marcas, str(round(sum(v[8] for v in vs))),
                                            ' '.join(enc(q) for q in ps))))
                    res['pedacos'] += 1
        for r in faixa_rotulos(d, lp):
            corpo.append('\t'.join(('O', f'{r[0]:.6f}', f'{r[1]:.6f}', r[2], str(r[3]), str(r[4]), ','.join(r[5]),
                                    ' / '.join(r[6]), str(round(r[7])), str(round(r[8])))))
            res['rotulos'] += 1
        res['alimentadores'] += 1
        res['trechos'] += len(trs)
    anos = sorted((int(k) for k in res['anos'] if k.isdigit()), reverse=True)
    cab = '#' + json.dumps(dict(v=2, hoje=hoje.isoformat(), sit=list(FAIXA_SIT), anos=anos), separators=(',', ':'))
    ms = ['\t'.join(['M', cod] + [str(round(m[k])) for k in FAIXA_SIT]) for cod, m in sorted(muns.items())]
    ys = ['\t'.join(['Y', cod, ','.join(f'{k}:{round(v)}' for k, v in sorted(y.items()))]) for cod, y in sorted(anos_mun.items())]
    return '\n'.join([cab] + ms + ys + corpo) + '\n', res


def faixa_mapa(saida, hoje=None):
    """Grava dados/redes/faixa.txt (ver acima; só regrava se mudou) e devolve (versão: 8 hex do arquivo, resumo)."""
    txt, res = faixa_txt(saida, hoje or date.today())
    b = txt.encode('utf-8')
    arq = Path(saida) / 'dados' / 'redes' / 'faixa.txt'
    arq.parent.mkdir(parents=True, exist_ok=True)
    if not arq.exists() or arq.read_bytes() != b:
        arq.write_bytes(b)
    res['bytes'] = len(b)
    return hashlib.sha1(b).hexdigest()[:8], res


def resumo_faixa(res):
    return (f"faixa.txt: {res['alimentadores']} alimentador(es), {res['trechos']} trechos T1/T2 · "
            + ' · '.join(f"{k} {km(res['m'][k])} km" for k in FAIXA_SIT)
            + f" · {res.get('pedacos', 0)} pedaços por ano · {res.get('rotulos', 0)} rótulos de OS · {math.ceil(res['bytes'] / 1e3)} KB"
            + (f" · {res['fora']} vão(s) fora das divisas (no município mais perto)" if res['fora'] else ''))


# dados/redes/inspecao.txt, executadas.txt e manutencao.txt: as camadas Inspeção, Manutenção (executadas) e Insp→manut
# (manutenção da inspeção) do mapa do alimentador, só no T1 e no T2 de cada alimentador, para o mapa de um alimentador
# pintar as dos OUTROS (assets/visao-tocantins.js; cada arquivo baixado só com a camada dele ligada). As contas são as das
# camadas (alimentador/site/inspecao.js, executadas.js e manutencao.js); o filtro (anos, situações) fica para a página, com
# o que o aberto tem ligado. Texto, uma linha por registro; cabeçalho #{"v": 1, ...} (JSON) e, por alimentador:
#   A<tab>alimentador
# inspecao.txt  (cabeçalho: "anos")
#   I<tab>anos (do mais recente)<tab>m<tab>linhas   os vãos T1/T2 inspecionados com esses anos (inspecao.js: vaos → os; a
#                                                   cor é a do ano mais recente entre os ligados); as linhas como no
#                                                   faixa.txt (polyline 1e-4 grau, a diferença acumulando pelo arquivo
#                                                   inteiro, Douglas–Peucker de FAIXA_TOL m, separadas por espaço)
# executadas.txt  (cabeçalho: "anos")
#   E<tab>pontos<tab>serviços   os ativos do T1/T2 com manutenção executada (executadas.js): os pontos em polyline (1e-5
#                               grau, a diferença acumulando pelo arquivo inteiro) e, de cada um (separados por espaço), os
#                               serviços por ano (OS com o mesmo tipo, ativo, data e descrição contam uma vez), do mais
#                               recente: "ano[:n]" separados por vírgula, o ano menos 2000 (n omitido: 1); d: NAE DEOP
#                               (data padrão), z: sem data
# manutencao.txt  (cabeçalho: "sit": a ordem das contagens)
#   M<tab>pontos<tab>OS   os postes do T1/T2 com OS de manutenção da inspeção (manutencao.js), os pontos como no
#                         executadas.txt e, de cada um, as OS por situação na data do OS status (situacao_ate) do
#                         alimentador: venc,pend,fora,exec
CAMADAS_SIT = ('venc', 'pend', 'fora', 'exec')


def _sit_mnt(o, hoje):
    """A situação de uma OS da manutenção da inspeção (manutencao.js, sitDe)."""
    if o.get('sit') == 'EXECUTADA':
        return 'fora' if o.get('limite') and o.get('exec') and o['exec'] > o['limite'] else 'exec'
    return 'venc' if o.get('limite') and o['limite'] < hoje else 'pend'


class _Poli:
    """Polyline com a diferença acumulando pelo arquivo inteiro (na escala `esc`)."""
    def __init__(self, esc):
        self.esc, self.la, self.lo = esc, 0, 0

    def __call__(self, pts):
        t = ''
        for la, lo in pts:
            a, o = round(la * self.esc), round(lo * self.esc)
            t += _poli(a - self.la) + _poli(o - self.lo)
            self.la, self.lo = a, o
        return t


def camadas_txt(site, hoje=None, tol=None):
    """Pasta do site (alimentadores/<AL>/dados.js, inspecao.js, executadas.js, manutencao.js) → ({nome do arquivo: texto},
    resumo: {alimentadores, insp_pedacos, insp_m, exe_ativos, mnt_postes})."""
    site = Path(site)
    tol = FAIXA_TOL if tol is None else tol
    hoje = (hoje or date.today()).isoformat()
    pi, pe, pm = _Poli(1e4), _Poli(1e5), _Poli(1e5)

    def linhas(vaos):
        ls = []
        for linha, _ in _trilhas([((v[1], v[0]), (v[3], v[2])) for v in vaos], set()):
            q = [(round(y * 1e4), round(x * 1e4)) for x, y in _dp(linha, tol)]
            q = q[:1] + [b for a, b in zip(q, q[1:]) if b != a]
            if len(q) >= 2:
                ls.append([(a / 1e4, b / 1e4) for a, b in q])
        return ls
    ano_txt = lambda a: 'd' if a == -1 else 'z' if a == 0 else str(a - 2000)
    corpo = {'inspecao.txt': [], 'executadas.txt': [], 'manutencao.txt': []}
    anos_i, anos_e = set(), set()
    res = dict(alimentadores=0, insp_pedacos=0, insp_m=0.0, exe_ativos=0, mnt_postes=0)
    for p in sorted(site.glob('alimentadores/*/dados.js')):
        if not (p.parent / 'index.html').exists():
            continue
        pasta = p.parent
        ins, exe, mnt = (le_js(pasta / f) for f in ('inspecao.js', 'executadas.js', 'manutencao.js'))
        if not (ins or exe or mnt):
            continue
        d = le_js(p)
        if not d or not d.get('vaos'):
            continue
        nomes = [t['nome'] for t in d['trechos']]
        t12 = lambda n: classe(n or '') in ('T1', 'T2')
        algum = False
        # Inspeção: os vãos T1/T2 com OS (com data), por conjunto de anos
        if ins and ins.get('vaos'):
            oss, por, reg = ins.get('os') or [], {}, []
            for v in d['vaos']:
                ks = ins['vaos'].get(str(v[5]))
                if not ks or not t12(nomes[v[4]]):
                    continue
                anos = tuple(sorted({int(oss[k]['data'][:4]) for k in ks if 0 <= k < len(oss) and oss[k].get('data')}, reverse=True))
                if anos:
                    por.setdefault(anos, []).append(v)
            for anos in sorted(por, key=lambda a: (a[0], a)):
                ls = linhas(por[anos])
                if ls:
                    m = sum(v[8] for v in por[anos])
                    reg.append('\t'.join(('I', ','.join(map(str, anos)), str(round(m)), ' '.join(pi(q) for q in ls))))
                    anos_i.update(anos)
                    res['insp_pedacos'] += 1
                    res['insp_m'] += m
            if reg:
                corpo['inspecao.txt'] += ['A\t' + pasta.name] + reg
                algum = True
        # Manutenção (executadas): os serviços de cada ativo do T1/T2, por ano
        if exe and exe.get('ativos'):
            at, rep, por = exe['ativos'], set(), {}
            for o in exe.get('os') or []:
                i = o[4] if len(o) > 4 else -1
                if not isinstance(i, int) or not 0 <= i < len(at) or not t12(at[i][2]):
                    continue
                ch = (o[5], o[1], o[2], i)
                if ch in rep:
                    continue
                rep.add(ch)
                a = -1 if re.search(r'\bNAE DEOP\b', o[5] or '', re.I) else (int((o[2] or '')[:4]) if (o[2] or '')[:4].isdigit() else 0)
                c = por.setdefault(i, {})
                c[a] = c.get(a, 0) + 1
            if por:
                ids = sorted(por)
                cont = ' '.join(','.join(ano_txt(a) + (f':{n}' if n > 1 else '') for a, n in sorted(por[i].items(), reverse=True)) for i in ids)
                corpo['executadas.txt'] += ['A\t' + pasta.name, '\t'.join(('E', pe([(at[i][3], at[i][4]) for i in ids]), cont))]
                for i in ids:
                    anos_e.update(por[i])
                res['exe_ativos'] += len(ids)
                algum = True
        # Insp→manut: as OS de cada poste do T1/T2 (com posição), por situação
        if mnt and mnt.get('os'):
            dia = mnt.get('situacao_ate') or hoje
            postes12 = set()
            for v in d['vaos']:
                if t12(nomes[v[4]]):
                    postes12.update((str(v[6]), str(v[7])))
            por, ll = {}, {}
            for o in mnt['os']:
                if not o.get('ll') or str(o.get('poste')) not in postes12:
                    continue
                c = por.setdefault(str(o['poste']), dict.fromkeys(CAMADAS_SIT, 0))
                ll.setdefault(str(o['poste']), o['ll'])
                c[_sit_mnt(o, dia)] += 1
            if por:
                ids = sorted(por)
                corpo['manutencao.txt'] += ['A\t' + pasta.name, '\t'.join(('M', pm([ll[i] for i in ids]),
                                                                         ' '.join(','.join(str(por[i][s]) for s in CAMADAS_SIT) for i in ids)))]
                res['mnt_postes'] += len(ids)
                algum = True
        res['alimentadores'] += algum
    cab = {'inspecao.txt': dict(v=1, anos=sorted(anos_i, reverse=True)), 'executadas.txt': dict(v=1, anos=sorted(anos_e, reverse=True)),
           'manutencao.txt': dict(v=1, sit=list(CAMADAS_SIT))}
    return {n: '\n'.join(['#' + json.dumps(cab[n], separators=(',', ':'))] + corpo[n]) + '\n' for n in corpo}, res


def camadas_mapa(saida, hoje=None):
    """Grava dados/redes/inspecao.txt, executadas.txt e manutencao.txt (ver acima; cada um só é regravado se mudou) e
    devolve o resumo (com os bytes de cada um)."""
    txts, res = camadas_txt(saida, hoje)
    res['bytes'] = {}
    for n, txt in txts.items():
        b = txt.encode('utf-8')
        arq = Path(saida) / 'dados' / 'redes' / n
        arq.parent.mkdir(parents=True, exist_ok=True)
        if not arq.exists() or arq.read_bytes() != b:
            arq.write_bytes(b)
        res['bytes'][n] = len(b)
    return res


def resumo_camadas(res):
    kb = lambda n: math.ceil(res['bytes'][n] / 1e3)
    return (f"camadas dos outros: {res['alimentadores']} alimentador(es) · inspecao.txt {res['insp_pedacos']} pedaços T1/T2 "
            f"({km(res['insp_m'])} km, {kb('inspecao.txt')} KB) · executadas.txt {res['exe_ativos']} ativos ({kb('executadas.txt')} KB) · "
            f"manutencao.txt {res['mnt_postes']} postes ({kb('manutencao.txt')} KB)")

# dados/redes/nae.txt: a NAE-Vegetação (as ocorrências da Crítica do dados.js de cada alimentador, nae.oc, o período de
# nae.meses) de cada trecho T1 e T2, com a forma dele, para a camada NAE do satélite da página inicial (assets/mapa-sat-to.js:
# as linhas pela NAE do trecho, na rampa do mapa dos municípios; baixado só quando a camada é ligada). Cada ocorrência
# conta no trecho dela (o campo trecho); a de um T3 conta também (à parte, n3) no T1 ou T2 de onde o ramal dele sai (o pai
# do trecho, subindo até um T1 ou T2): a página escolhe se soma os ramais. Sem trecho, fica de fora (só no cabeçalho).
# Nada de dado pessoal: só a contagem por trecho. Texto, uma linha por registro:
#   #{"v": 1, "meses": [primeiro, último], "oc": ocorrências, "t12": no T1/T2, "t3": no T3, "sem": sem trecho}
#   A<tab>alimentador
#   T<tab>trecho<tab>classe<tab>NAE do trecho<tab>NAE dos ramais (T3) dele<tab>m<tab>linhas
# As linhas como no faixa.txt (polyline, 1e-4 grau, a diferença acumulando pelo arquivo inteiro; Douglas–Peucker de
# NAE_TOL m; separadas por espaço); alimentador cujas linhas somem todas (só uns metros de rede): no seu maior trecho, um
# ponto ("!" e o ponto, como no faixa.txt).
NAE_TOL = 60              # m do Douglas–Peucker das linhas (o meio do caminho entre o estado.txt e os pedaços da Faixa)


def nae_txt(site, tol=None):
    """Pasta do site (alimentadores/<AL>/dados.js com nae.oc) → (texto do nae.txt, resumo: {alimentadores, trechos, oc,
    t12, t3, sem, meses})."""
    site = Path(site)
    tol = NAE_TOL if tol is None else tol
    la0 = lo0 = 0

    def enc(q):
        nonlocal la0, lo0
        t = ''
        for la, lo in q:
            t += _poli(la - la0) + _poli(lo - lo0)
            la0, lo0 = la, lo
        return t

    def linhas(vaos):
        ls = []
        for linha, _ in _trilhas([((v[1], v[0]), (v[3], v[2])) for v in vaos], set()):
            q = [(round(y * 1e4), round(x * 1e4)) for x, y in _dp(linha, tol)]
            q = q[:1] + [b for a, b in zip(q, q[1:]) if b != a]
            if len(q) >= 2:
                ls.append(q)
        return ls
    corpo, meses = [], set()
    res = dict(alimentadores=0, trechos=0, oc=0, t12=0, t3=0, sem=0)
    for p in sorted(site.glob('alimentadores/*/dados.js')):
        if not (p.parent / 'index.html').exists():
            continue
        d = le_js(p)
        if not d or not d.get('vaos'):
            continue
        nae = d.get('nae') or {}
        meses.update(m for m in nae.get('meses') or () if m)
        trs = d.get('trechos') or []
        nomes = [t.get('nome') for t in trs]
        pai = {t.get('nome'): t.get('pai') for t in trs}

        def de_t12(n):                            # o T1 ou T2 de onde sai o trecho n (ele mesmo, se é T1 ou T2)
            vistos = set()
            while n and n not in vistos and classe(n) not in ('T1', 'T2'):
                vistos.add(n)
                n = pai.get(n)
            return n if n and classe(n) in ('T1', 'T2') else None
        n_own, n_ram = {}, {}
        for o in nae.get('oc') or ():
            res['oc'] += 1
            t = o.get('trecho')
            if not t or t not in pai:
                res['sem'] += 1
            elif classe(t) in ('T1', 'T2'):
                n_own[t] = n_own.get(t, 0) + 1
                res['t12'] += 1
            else:
                res['t3'] += 1
                a = de_t12(t)
                if a:
                    n_ram[a] = n_ram.get(a, 0) + 1
        por, ordem = {}, []
        for v in d['vaos']:
            n = nomes[v[4]] if 0 <= v[4] < len(nomes) else None
            if not n or classe(n) not in ('T1', 'T2'):
                continue
            if n not in por:
                por[n] = []
                ordem.append(n)
            por[n].append(v)
        if not ordem:
            continue
        ordem.sort(key=nomes.index)
        geo = [linhas(por[n]) for n in ordem]
        sem_linha = not any(geo)
        maior = max(range(len(ordem)), key=lambda i: sum(v[8] for v in por[ordem[i]]))
        corpo.append('A\t' + p.parent.name)
        for i, (n, ls) in enumerate(zip(ordem, geo)):
            if sem_linha and i == maior:
                v = max(por[n], key=lambda v: v[8])
                g = '!' + enc([(round((v[0] + v[2]) / 2 * 1e4), round((v[1] + v[3]) / 2 * 1e4))])
            else:
                g = ' '.join(enc(q) for q in ls)
            corpo.append('\t'.join(('T', n, classe(n), str(n_own.get(n, 0)), str(n_ram.get(n, 0)),
                                    str(round(sum(v[8] for v in por[n]))), g)))
            res['trechos'] += 1
        res['alimentadores'] += 1
    ms = sorted(meses)
    res['meses'] = [ms[0], ms[-1]] if ms else []
    cab = '#' + json.dumps(dict(v=1, meses=res['meses'], oc=res['oc'], t12=res['t12'], t3=res['t3'], sem=res['sem']),
                           separators=(',', ':'))
    return '\n'.join([cab] + corpo) + '\n', res


def nae_mapa(saida):
    """Grava dados/redes/nae.txt (ver acima; só regrava se mudou) e devolve o resumo (com os bytes)."""
    txt, res = nae_txt(saida)
    b = txt.encode('utf-8')
    arq = Path(saida) / 'dados' / 'redes' / 'nae.txt'
    arq.parent.mkdir(parents=True, exist_ok=True)
    if not arq.exists() or arq.read_bytes() != b:
        arq.write_bytes(b)
    res['bytes'] = len(b)
    return res


def resumo_nae_txt(res):
    return (f"nae.txt: {res['alimentadores']} alimentador(es), {res['trechos']} trechos T1/T2 · {res['oc']} NAE "
            f"({res['t12']} no T1/T2, {res['t3']} nos ramais T3, {res['sem']} sem trecho) · {math.ceil(res['bytes'] / 1e3)} KB")


def _por_classe(trechos, vaos, lonlat):
    cl = [classe(t['nome']) if classe(t['nome']) in CLASSES else 'T3' for t in trechos]
    segs = {}
    for v in vaos:
        a, b = ((v[0], v[1]), (v[2], v[3])) if lonlat else ((v[1], v[0]), (v[3], v[2]))
        segs.setdefault(cl[v[4]], []).append((a, b))
    return segs


def _hilbert(n, x, y):
    """Posição de (x, y) na curva de Hilbert de um quadrado n × n (n potência de 2)."""
    d, s = 0, n // 2
    while s:
        rx, ry = int(x & s > 0), int(y & s > 0)
        d += s * s * ((3 * rx) ^ ry)
        if not ry:
            if rx:
                x, y = s - 1 - x, s - 1 - y
            x, y = y, x
        s //= 2
    return d


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def equipamentos_da_pagina(pasta, d=None):
    """Os equipamentos que o mapa do alimentador mostra, das mesmas fontes que ele (na pasta da página): DJ e religadores
    (principais do dados.js), fusíveis (fusiveis do dados.js; os SEC e FTR à parte, cinza no mapa), chaves (chaves.js) e
    transformadores e outros (ativos.js, o que o mapa mostra do zoom 16 em diante). `d`: o dados.js já lido.
    → {grupo: [(lat, lon, tipo, código), ...]} (grupos de VIZ_EQ)."""
    pasta = Path(pasta)
    if d is None:
        d = le_js(pasta / 'dados.js') or {}
    eq = {g: [] for g in ''.join(VIZ_EQ)}

    def poe(g, lat, lon, tipo, cod):
        if _num(lat) and _num(lon):
            eq[g].append((lat, lon, str(tipo or ''), str(cod or '')))
    for a in d.get('principais') or []:
        poe('D' if a.get('t') == 'DJ' else 'R', a.get('lat'), a.get('lon'), a.get('t'), a.get('nome'))
    for a in d.get('fusiveis') or []:
        poe('g' if a.get('t') in ('SEC', 'FTR') else 'f', a.get('lat'), a.get('lon'), a.get('t'), a.get('nome'))
    for c in le_js(pasta / 'chaves.js') or []:
        poe('c', c[2], c[3], c[1], c[0])
    at = le_js(pasta / 'ativos.js') or {}
    for a in at.get('tr') or []:
        poe('t', a[1], a[2], '', a[0])
    for a in at.get('eq') or []:
        poe('e', a[2], a[3], a[1], a[0])
    return eq


def equipamentos_vizinho(eq):
    """{grupo: [(lat, lon, tipo, código)]} → [texto do .4, do .5, do .6] (ver acima; '' no que não tem nada)."""
    q = {g: [(round(la * 1e5), round(lo * 1e5), t, c) for la, lo, t, c in its] for g, its in (eq or {}).items()}
    todos = [p for its in q.values() for p in its]
    if not todos:
        return ['', '', '']
    la0, lo0 = min(p[0] for p in todos), min(p[1] for p in todos)
    n = 1
    while n <= max(max(p[0] for p in todos) - la0, max(p[1] for p in todos) - lo0):
        n *= 2
    limpa = lambda x: re.sub(r'[\t\n\r]+', ' ', x).strip()
    arqs, cods = [], []
    for grupos in VIZ_EQ:
        la_ = lo_ = 0
        linhas = []
        for g in grupos:
            its = sorted(q.get(g, ()), key=lambda p: (_hilbert(n, p[1] - lo0, p[0] - la0), p[3], p[2]))
            s = ''
            for la, lo, _, _ in its:
                s += _poli(la - la_) + _poli(lo - lo_)
                la_, lo_ = la, lo
            linhas.append(s)
            cods.append('\t'.join(limpa(c) if g in 'DRt' else re.sub(r'\s+', '_', limpa(t)) + ' ' + limpa(c) for _, _, t, c in its))
        arqs.append('\n'.join(linhas) if any(linhas) else '')
    return arqs + ['\n'.join(cods)]


def vizinhos_dos_dados(dados):
    """A rede de cada alimentador publicado (dados/alimentadores/<AL>.json, vãos em [lon, lat]). Os equipamentos saem da
    página dele (vizinhos_mapa)."""
    for c in dados:
        if c['validacao']['status'] != 'falha':
            yield c['alimentador'], _por_classe(c['trechos'], c['vaos'], True)


def vizinhos_das_paginas(saida):
    """A rede e os equipamentos de cada página de alimentador do site (alimentadores/<AL>/dados.js, vãos em [lat, lon];
    chaves.js e ativos.js)."""
    for p in sorted((saida / 'alimentadores').glob('*/dados.js')):
        if (p.parent / 'index.html').exists():
            d = le_js(p)
            if d and d.get('vaos'):
                yield p.parent.name, _por_classe(d['trechos'], d['vaos'], False), equipamentos_da_pagina(p.parent, d)


def vizinhos_mapa(saida, redes, destino=None):
    """Grava dados/vizinhos/ (em `destino`, se dado; senão em `saida`): os arquivos de cada alimentador (rede e
    equipamentos), o estado.txt (T1 e T2 de todos, para a visão do Tocantins inteiro) e o índice; apaga os de alimentador
    que saiu. Só regrava o arquivo que mudou. `redes`: (AL, rede) ou (AL, rede, equipamentos); sem os equipamentos, eles
    saem da página do alimentador em `saida`. Devolve o índice dos alimentadores."""
    pasta = Path(destino or saida) / 'dados' / 'vizinhos'
    pasta.mkdir(parents=True, exist_ok=True)
    als, feitos, t12 = {}, set(), []

    def grava(nome, b):
        arq = pasta / nome
        if not arq.exists() or arq.read_bytes() != b:
            arq.write_bytes(b)
        feitos.add(nome)
    for al, segs, *eq in redes:
        textos, caixa = rede_vizinho(segs)
        if not textos:
            continue
        t12.append((al, {c: segs.get(c, ()) for c in ('T1', 'T2')}))
        bs = [t.encode('utf-8') for t in textos]
        for k, b in enumerate(bs, 1):
            grava(f'{al}.{k}.txt', b)
        eb = [t.encode('utf-8') for t in equipamentos_vizinho(eq[0] if eq else equipamentos_da_pagina(Path(saida) / 'alimentadores' / al))]
        if any(eb[:2]):
            for k, b in enumerate(eb, 4):
                if b:
                    grava(f'{al}.{k}.txt', b)
        als[al] = [*caixa, hashlib.sha1(b'\0'.join(bs)).hexdigest()[:8], *map(len, bs),
                   hashlib.sha1(b'\0'.join(eb)).hexdigest()[:8] if any(eb[:2]) else '', len(eb[0]), len(eb[1])]
    for p in pasta.iterdir():
        if VIZ_ARQ.match(p.name) and p.name not in feitos:
            p.unlink()
    est = estado_txt(t12).encode('utf-8')
    grava('estado.txt', est)
    grava_json(pasta / 'indice.json', dict(v=2, als=dict(sorted(als.items())), estado=[hashlib.sha1(est).hexdigest()[:8], len(est)]))
    return als


def resumo_vizinhos(als, pasta=None):
    """Texto curto: alimentadores, tamanho total (grosso e fino da rede; equipamentos e, com a `pasta`, os códigos deles)
    e o maior arquivo."""
    tam = lambda b: f'{b / 1e6:.1f} MB'.replace('.', ',') if b >= 1e6 else f'{math.ceil(b / 1e3)} KB'
    g = sum(a[5] + a[6] for a in als.values())
    f = sum(a[7] for a in als.values())
    eq = sum(a[9] + a[10] for a in als.values())
    tams = [(a[i], al, k) for al, a in als.items() for i, k in ((5, 1), (6, 2), (7, 3), (9, 4), (10, 5))]
    if pasta:
        tams += [((Path(pasta) / f'{al}.6.txt').stat().st_size, al, 6) for al, a in als.items() if a[8]]
    cod = sum(n for n, _, k in tams if k == 6)

    def maior(ks):
        n, al, k = max((x for x in tams if x[2] in ks), default=(0, '-', 0))
        return f'{al}.{k}.txt com {tam(n)}' if n else 'nenhum'
    est = (Path(pasta) / 'estado.txt').stat().st_size if pasta and (Path(pasta) / 'estado.txt').exists() else None
    return (f'{len(als)} alimentador(es) · {tam(g + f + eq + cod)} (rede: grosso {tam(g)}, fino {tam(f)}; equipamentos '
            f'{tam(eq)}' + (f', códigos {tam(cod)}' if pasta else '') + f') · maior arquivo: {maior((1, 2, 3, 4, 5, 6))}; '
            f'dos equipamentos: {maior((4, 5))}' + (f'; dos códigos: {maior((6,))}' if pasta else '') +
            (f' · estado inteiro (estado.txt): {tam(est)}' if est is not None else ''))


def polo_principal(c, polo_de):
    """Polo do município onde o alimentador tem mais rede (o mesmo município que o mapa da página inicial usa para a NAE
    sem trecho, em nae_por_municipio); se esse município não está em polo nenhum, o polo onde o alimentador tem mais
    rede. None se não tem rede em polo nenhum."""
    mun, km = {}, {}
    for t in c['trechos']:
        for cod, m in (t.get('municipios') or {}).items():
            if cod != 'None':
                mun[cod] = mun.get(cod, 0) + m
            if cod in polo_de:
                km[polo_de[cod]] = km.get(polo_de[cod], 0) + m
    if mun and polo_de.get(max(mun, key=mun.get)):
        return polo_de[max(mun, key=mun.get)]
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
    mais rede; NAE sem trecho conta no polo do município onde o alimentador tem mais rede (como no mapa). Limpeza: metros de cada classe pela data
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
    principais = {}                                     # alimentador → polo onde conta a NAE sem trecho (nae_rede.py usa)
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
        principal = polo_principal(c, polo_de)          # polo do município de mais rede (como no mapa da página inicial)
        principais[al] = principal
        mun_t = {t['nome']: {k: m for k, m in (t.get('municipios') or {}).items() if k != 'None'} for t in ts}   # 'None': fora do TO
        polo_t = {n: polo_de.get(max(mm, key=mm.get)) if mm else None for n, mm in mun_t.items()}
        nae = {}                                        # polo → [NAE, consumidores, consumidor·hora, NAE sem trecho]
        for o in (c.get('nae') or {}).get('oc', []):
            meses.add(o['mes'])
            x = nae.setdefault(polo_t.get(o.get('trecho')) or principal, [0, 0, 0, 0])
            x[0] += 1
            x[1] += o.get('cons') or 0
            x[2] += chi_h(o)
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
        por_t = {}                                      # trecho → [NAE, consumidores, consumidor·hora]
        # NAE de todos os ativos do trecho: as deste alimentador e as de outro cujo ativo hoje está aqui ('ext')
        for o in (c.get('nae') or {}).get('oc', []) + (c.get('nae') or {}).get('ext', []):
            if o.get('trecho'):
                x = por_t.setdefault(o['trecho'], [0, 0, 0])
                x[0] += 1
                x[1] += o.get('cons') or 0
                x[2] += chi_h(o)
        for t in ts:
            if t['nome'] in por_t:
                n, mm = por_t[t['nome']], mun_t[t['nome']]
                mun = max(mm, key=mm.get) if mm else None
                trechos_p[polo_t.get(t['nome']) or principal].append(dict(
                    al=al, t=t['nome'], se=c['se_nome'] or c.get('se') or '', mun=mun, m=slug_mun.get(mun), km=round(t['ext_m'], 1), nae=n[0],
                    cons=n[1], chi=round(n[2]),
                    lp={classe(t['nome']): {d: round(m) for d, m in sorted(limp_t.get(t['nome'], {}).items())}} if limp_t else {}))
        for p in sorted(set(km) | set(nae)):
            if km.get(p, 0) < MIN_M and p not in nae:
                continue
            n = nae.get(p, [0, 0, 0, 0])
            muns = sorted((cod for cod in mun_km if polo_de.get(cod) == p and mun_km[cod] >= MIN_M), key=lambda k: -mun_km[k])
            linhas[p].append(dict(
                al=al, se=c['se_nome'] or c.get('se') or '', km=round(km.get(p, 0), 1), km_total=round(c['resumo']['extensao_m'], 1),
                nae=n[0], cons=n[1], chi=round(n[2]), sem=n[3], muns=muns,
                m=next((slug_mun[k] for k in muns if k in slug_mun), None),
                lp={cl: {d: round(m) for d, m in sorted(ds.items())} for cl, ds in sorted(limp.get(p, {}).items())}))
    dados_js = dict(meses=[min(meses), max(meses)] if meses else [], regra=regra, equipes=equipes, fonte=cfg['fonte'],
                    fora=cfg['fora'], muns={g['cod']: nome_de.get(g['cod'], g['nome']) for g in geo},
                    principal=principais,
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
    for cod, tipo in reguladores_no_indice(saida, idx, nomes):
        print(f'  regulador {cod} já está no índice como {tipo}: não duplicado')
    pasta = saida / 'dados' / 'ativos'
    if pasta.exists():
        shutil.rmtree(pasta)
    por = {}
    for k in sorted(idx):
        por.setdefault(fatia(k), {})[k] = idx[k]
    for f, d in por.items():
        grava_json(pasta / f'{f}.json', d)
    sugestoes_ativos(saida, nomes)
    return idx


def reguladores_no_indice(saida, idx, nomes):
    """Reguladores de tensão (dados/reguladores.json, de scripts/reguladores.py) no índice de ativos e nas sugestões, com o
    tipo 'Regulador'. Código que já está no índice com outro tipo não é duplicado. Devolve [(código, tipo que já estava)]
    dos que ficaram de fora; sem o arquivo, não faz nada."""
    arq = saida / 'dados' / 'reguladores.json'
    if not arq.exists():
        return []
    ja = []
    for r in json.loads(arq.read_text(encoding='utf-8')):
        k = chave_ativo(r['codigo'])
        antes = idx.get(k)
        if antes and antes[0][1] != 'Regulador':
            ja.append((r['codigo'], antes[0][1]))
            continue
        if not r['alimentador']:
            continue
        nomes.setdefault(k, {})[r['codigo']] = 'Regulador'
        idx[k] = [[r['alimentador'], 'Regulador', r['trecho'], r['papel'], r['lat'], r['lon']]]
    return ja


class _IndiceEmDisco(dict):
    """idx que consulta o índice já gravado (dados/ativos/<fatia>.json) em vez de montá-lo: get(k) acha o que está no disco."""

    def __init__(self, saida):
        super().__init__()
        self.saida, self.fatias = saida, {}

    def get(self, k, padrao=None):
        if k in self:
            return self[k]
        f = fatia(k)
        if f not in self.fatias:
            arq = self.saida / 'dados' / 'ativos' / f'{f}.json'
            self.fatias[f] = json.loads(arq.read_text(encoding='utf-8')) if arq.exists() else {}
        return self.fatias[f].get(k, padrao)


def acrescenta_reguladores(saida):
    """Põe os reguladores (dados/reguladores.json) no índice já gravado sem refazê-lo: só os arquivos de dados/ativos e de
    dados/ativos-pref que ganham código são regravados, com a mesma regra de indice_ativos (reguladores_no_indice,
    fatia, pref_texto). O que já estava fica igual. Devolve (novos, [(código, tipo que já estava)])."""
    idx, nomes = _IndiceEmDisco(saida), {}
    ja = reguladores_no_indice(saida, idx, nomes)
    por = {}
    for k, v in idx.items():
        por.setdefault(fatia(k), {})[k] = v
    for f, novos in por.items():
        arq = saida / 'dados' / 'ativos' / f'{f}.json'
        d = json.loads(arq.read_text(encoding='utf-8')) if arq.exists() else {}
        d.update(novos)
        grava_json(arq, {k: d[k] for k in sorted(d)})
    pref = {}
    for k, ns in nomes.items():
        if len(k) >= 3:
            pref.setdefault(k[:2], {}).update(ns)
    for f, ns in pref.items():
        arq = saida / 'dados' / 'ativos-pref' / f'{f}.json'
        d = json.loads(arq.read_text(encoding='utf-8')) if arq.exists() else {}
        todos = set(d.get('Regulador', '').split()) | set(ns)
        d['Regulador'] = pref_texto({'Regulador': todos})['Regulador']
        grava_json(arq, {t: d[t] for t in sorted(d)})
    return len(idx), ja


TRAFOS = ('TR', 'ET', 'EP')      # tipos de transformador no índice de ativos


def indice_uc(saida, idx, com_pagina=()):
    """dados/uc/<fatia>.json: número da UC (como chave_ativo) → [[alimentador, transformador, trecho, papel, lat, lon,
    interrupções, 1º mês, último mês, 1 se o alimentador tem página], ...], do mais recente para o mais antigo.

    Vem das interrupções individuais da Crítica guardadas mês a mês em dados/uc/meses/<AAAA-MM>.json
    (scripts/atualiza_critica.py: UC → [[transformador, alimentador da Crítica, ocorrências], ...]). Cada transformador
    aparece uma vez na UC, somando os meses, com o alimentador da Crítica do mês mais recente (ele muda com transferência
    de carga ou vem vazio); sem transformador, uma linha por alimentador. O lugar é o do transformador no índice de
    ativos (alimentador de hoje, trecho e ponto); fora dele, o ponto e o alimentador do acervo do GIS
    (dados/trafos_gis.json), sem trecho; sem ele também, só o alimentador da Crítica. dados/uc/indice.json: os meses que
    o índice cobre (a busca diz o período quando não acha a UC). O número da UC é publicado por decisão do usuário
    (26/10/2026): o repositório é público."""
    pasta = saida / 'dados' / 'uc'
    if not pasta.exists():
        return 0
    meses = sorted((pasta / 'meses').glob('*.json'))
    junta = {}              # UC → {transformador, ou ('', alimentador) sem ele: [n, 1º mês, último mês, alimentador]}
    for f in meses:         # em ordem de mês: o alimentador que fica é o do mês mais recente que o informa
        for uc, lista in json.loads(f.read_text(encoding='utf-8')).items():
            for tr, al, n in lista:
                x = junta.setdefault(uc, {}).setdefault(tr or ('', al), [0, f.stem, f.stem, al])
                x[0] += n
                x[1], x[2] = min(x[1], f.stem), max(x[2], f.stem)
                if al:
                    x[3] = al
    for f in pasta.glob('*.json'):                   # fatias e indice.json de antes (meses/ fica)
        f.unlink()
    gis = saida / 'dados' / 'trafos_gis.json'
    gis = json.loads(gis.read_text(encoding='utf-8')) if junta and gis.exists() else {}
    por = {}
    for uc, quais in sorted(junta.items()):
        linhas = []
        for k, (n, m0, m1, al) in sorted(quais.items(), key=lambda x: (x[1][2], x[1][0]), reverse=True):
            tr = k if isinstance(k, str) else ''
            hits = [h for h in idx.get(chave_ativo(tr), []) if h[1] in TRAFOS] if tr else []
            h = next((h for h in hits if h[0] == al), hits[0] if hits else None)
            if h:
                lin = [h[0], tr, h[2], h[3], h[4], h[5]]
            elif tr in gis:
                lon, lat, al_gis = gis[tr]
                lin = [al_gis or al, tr, '', 'fora da rede do site', round(lat, 6), round(lon, 6)]
            else:
                lin = [al, tr, '', '', None, None]
            linhas.append(lin + [n, m0, m1, int(lin[0] in com_pagina)])
        por.setdefault(fatia(uc), {})[uc] = linhas
    for f, d in por.items():
        grava_json(pasta / f'{f}.json', d)
    grava_json(pasta / 'indice.json', dict(meses=[f.stem for f in meses], ucs=len(junta)))
    return len(junta)


FATIAS_OS = 64        # poucas fatias: a cópia da página no Artifact tem limite de arquivos


def chave_os(s):
    """'ETO-RD-PO 002507/2026', '2507/2026' e '002507 / 2026' → '2507/2026' (número sem zeros à esquerda + ano)."""
    m = re.search(r'(\d{1,7})\s*/\s*(\d{4})(?!\d)', str(s))
    return f'{int(m.group(1))}/{m.group(2)}' if m else None


def fatia_os(k):
    h = 0                                         # mesma conta em assets/busca-ativo.js
    for ch in k:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return f'{h % FATIAS_OS:02x}'


def indice_os(saida, dados):
    """dados/os/<fatia>.json: número/ano da OS → [[OS completa, alimentador, base, situação ou data, lat, lon], ...].

    Bases (base: f, i, m, e): faixa (limpeza.js), inspeção (inspecao.js), manutenção (manutencao.js) e executadas
    (executadas.js), lidas dos arquivos de cada alimentador já gerados. lat/lon: onde a OS cai no mapa, com 4 casas
    (~10 m; null quando a base não diz)."""
    idx = {}
    for c in dados:
        if c['validacao']['status'] == 'falha':
            continue
        al, pasta = c['alimentador'], saida / 'alimentadores' / c['alimentador']
        def poe(os_, base, info, ll):
            k = chave_os(os_)
            if k:
                lat, lon = (round(ll[0], 4), round(ll[1], 4)) if ll else (None, None)
                idx.setdefault(k, []).append([os_, al, base, info, lat, lon])
        lp = le_js(pasta / 'limpeza.js') or {}
        for o in lp.get('os') or []:
            poe(o.get('os_completa') or o['os'], 'f', o.get('sit') or '', None)
        ins = le_js(pasta / 'inspecao.js') or {}
        for o in ins.get('os') or []:
            poe(o.get('os_completa') or o['os'], 'i', o.get('data') or '', o.get('pe'))
        mn = le_js(pasta / 'manutencao.js') or {}
        for o in mn.get('os') or []:
            poe(o.get('os_completa') or o['os'], 'm', o.get('sit') or '', o.get('ll'))
        ex = le_js(pasta / 'executadas.js') or {}
        ats = ex.get('ativos') or []
        for o in ex.get('os') or []:
            a = ats[o[4]] if isinstance(o[4], int) and 0 <= o[4] < len(ats) else None   # o[4]: ativo (-1 = sem posição)
            poe(o[0], 'e', o[2] or '', (a[3], a[4]) if a else None)
    fatias = {}
    for k, v in idx.items():
        fatias.setdefault(fatia_os(k), {})[k] = v
    for f in range(FATIAS_OS):
        grava_json(saida / 'dados' / 'os' / f'{f:02x}.json', fatias.get(f'{f:02x}', {}))
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
        grava_json(pasta / f'{f}.json', pref_texto(d))
    return len(por)


def pref_texto(d):
    """Conteúdo de um arquivo de dados/ativos-pref: tipo → códigos ordenados, separados por espaço."""
    return {t: ' '.join(sorted(set(v))) for t, v in sorted(d.items())}


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
    """divisas.js do alimentador (divisas no mapa, como scripts/divisas.py). Só com a mesma malha que mediu os municípios
    dele; sem ela, fica o arquivo que já existe (ou null: a página fica sem as divisas)."""
    if malha and c['origem'].get('malha') == malha.origem:
        arq.write_text(divisas_js(malha, c), encoding='utf-8')
    elif not arq.exists():
        arq.write_text('window.MUNICIPIOS = null;\n', encoding='utf-8')


def grava_tocantins(saida, cache):
    """dados/tocantins.js: window.TOCANTINS = [[[lat, lon], ...], ...], o contorno do estado (uf-TO.geojson do cache, malha
    do IBGE do estado em qualidade intermediária), que o mapa do alimentador desenha com o traço-ponto da divisa do TO.
    Sem o arquivo no cache, fica o que já existe (ou null)."""
    arq, fonte = saida / 'dados' / 'tocantins.js', Path(cache) / 'uf-TO.geojson'
    arq.parent.mkdir(parents=True, exist_ok=True)
    if fonte.exists():
        aneis = []
        for f in json.loads(fonte.read_text(encoding='utf-8'))['features']:
            geom = f['geometry']
            for pol in (geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]):
                aneis += [[[round(y, 4), round(x, 4)] for x, y, *_ in anel] for anel in pol[:1]]   # só o anel de fora
        arq.write_text('window.TOCANTINS = ' + json.dumps(aneis, separators=(',', ':')) + ';\n', encoding='utf-8')
    elif not arq.exists():
        arq.write_text('window.TOCANTINS = null;\n', encoding='utf-8')


def interface(saida, malha=None):
    dados = carregar_dados(saida)
    modelo = ativos_interface(saida)
    man = manifesto(dados)
    grava_json(saida / 'manifesto.json', man)
    for c in dados:
        if c['validacao']['status'] != 'falha':
            h = com_modo_faixa(pagina_alimentador(modelo, c))
            (saida / 'alimentadores' / c['alimentador'] / 'index.html').write_text(h, encoding='utf-8')
            (saida / 'alimentadores' / c['alimentador'] / 'faixa-rascunho.html').write_text(pagina_faixa(h, c), encoding='utf-8')
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
            grava_divisas(saida / 'alimentadores' / c['alimentador'] / 'divisas.js', c, malha)
            (saida / 'alimentadores' / c['alimentador'] / 'chaves.js').write_text(chaves_js(c), encoding='utf-8')
    for m in man['municipios']:
        linhas = []
        for a in m['alimentadores']:
            n = a['trechos']
            trechos = f'{n:,}'.replace(',', '.') + '&nbsp;trecho' + ('' if n == 1 else 's')
            linhas.append(f'<a class="card" data-busca="{a["cod"].lower()} {html.escape(slug(a["se_nome"]).replace("-", " "))}" '
                          f'href="../../alimentadores/{a["cod"]}/?m={m["slug"]}"><b class="cod">{a["cod"]}</b>'
                          f'<span>{html.escape(a["se"])} {html.escape(a["se_nome"])}{" · polo " + html.escape(a["polo"]) if a["polo"] else ""}</span>'
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
    v_raiox = raiox_mapa(saida, redes_mapa(saida, dados), man)
    v_faixa, r_faixa = faixa_mapa(saida)              # (depois da limpeza: lê o limpeza.js de cada página)
    print(resumo_faixa(r_faixa))
    print(resumo_camadas(camadas_mapa(saida)))   # (Inspeção, Manutenção e Insp→manut dos outros no mapa do alimentador)
    print(resumo_nae_txt(nae_mapa(saida)))       # (a camada NAE do satélite da página inicial)
    vizinhos_mapa(saida, vizinhos_dos_dados(dados))
    ranking_polos(saida, dados, man)
    manutencao_polos(saida, dados)
    indice_uc(saida, indice_ativos(saida, dados), {c['alimentador'] for c in dados if c['validacao']['status'] != 'falha'})
    indice_os(saida, dados)
    # páginas que outras etapas fazem: a Priorização (priorizacao/, #20) e as visões do mapa (gera_visoes.js, que roda
    # depois desta interface na atualização automática). Só entram no HTML quando existem, para nunca virar link quebrado.
    ranking = 'priorizacao/' if (saida / 'priorizacao' / 'index.html').exists() else 'polos/#eto'
    visoes = ('<script src="assets/mapa-municipios-visoes.js"></script>\n'
              if (saida / 'assets' / 'mapa-municipios-visoes.js').exists() else '')
    corpo = ('<header class="cab"><h1><b>ARGOS</b> <span>MANUTENÇÃO</span></h1>'
             f'<a class="cab-link" href="{ranking}">Ranking</a></header>\n'   # Ranking da tela inicial abre a Priorização (#20)
             # casca do mapa já no HTML (estilo em assets/site.css; o svg com viewBox reserva a altura do mapa):
             # os scripts só preenchem, e a página não pula ao carregar. Busca única atrás da lupa (busca-ativo.js):
             # ativo, município ou alimentador, com a lista aparecendo enquanto se digita.
             '<div id="mapa-to" class="mapa-to"><div class="mt-barra">'
             '<form class="ativo" id="ativo" role="search"><div class="campo">'
             '<button type="button" class="lupa" id="lupa" aria-label="Buscar ativo, município, alimentador, OS ou UC" '
             'aria-expanded="false" aria-controls="ativo-q">'
             '<img class="argos-img" src="assets/argos.png" alt="" width="34" height="23"></button>'   # o olho do ARGOS (logo)
             '<label for="ativo-q" class="vh">Buscar regional, polo, município, alimentador, ativo, OS ou UC</label>'
             '<input class="busca" id="ativo-q" type="search" inputmode="search" autocomplete="off" '
             'placeholder="Município, alimentador, ativo, OS, UC" enterkeyhint="search" hidden>'   # fechada, só o olho; tocar nele abre
             '<div id="ativo-res" aria-live="polite"></div></div></form>'
             '<details class="mt-regs" open><summary>NAE-Vegetação</summary></details></div>\n'   # legenda na barra, ao lado do olho (mapa-municipios.js)
             f'<div class="mt-mapa"><svg role="group" aria-label="Mapa dos municípios do Tocantins" tabindex="-1" viewBox="{vb}"></svg>'
             '<div class="mt-dica" aria-hidden="true"></div></div></div>\n'
             '<script src="assets/mapa-municipios-dados.js"></script>\n'
             + visoes +                                                # outras visões do mapa (atualiza_bases.py → gera_visoes.js)
             # visão Queimadas (focos de calor): antes do mapa, que lê window.ARGOS_VIS_EXTRA ao montar o seletor de visão
             f'<script src="assets/focos.js?v={V_FOCOS}"></script>\n'
             f'<script src="assets/mapa-municipios.js?v={V_MAPA}"></script>\n'
             f'<script src="assets/busca-ativo.js?v={V_MAPA}"></script>\n'
             # zoom → tela cheia e raio-X (Ctrl+X) no mapa; data-rede: a versão do dados/redes/raiox.txt (baixado no 1º Ctrl+X)
             f'<script src="assets/mapa-raiox.js?v={V_RAIOX}" data-rede="{v_raiox}"></script>\n'
             # satélite do Tocantins (Ctrl+S); Leaflet só no 1º uso; data-faixa: a versão do dados/redes/faixa.txt (visão Limpeza)
             f'<script src="assets/mapa-sat-to.js?v={V_SAT_TO}" data-faixa="{v_faixa}"></script>')
    (saida / 'index.html').write_text(casca('ARGOS Manutenção', corpo, '', sem_rodape=True, topo=TOPO_CENTRAL,   # página inicial sem rodapé (pedido do usuário)
                                            estilos=f'<link rel="stylesheet" href="assets/focos.css?v={V_FOCOS}">'),
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
    excecao = [c for c in dados if c['alimentador'] in SEM_CHAVES]
    # maior trecho de cada alimentador dividido por exceção: é o que torna a NAE por trecho e os km vencidos pouco confiáveis
    maior = {c['alimentador']: max(c['trechos'], key=lambda t: t['ext_m']) for c in excecao if c.get('trechos')}
    nomes = sorted(SEM_CHAVES)
    lista = ', '.join(nomes[:-1]) + ' e ' + nomes[-1]
    faixa = (f' (de {km(min(t["ext_m"] for t in maior.values()))} km a {km(max(t["ext_m"] for t in maior.values()))} km '
             'num só trecho)' if maior else '')
    aviso_exc = (f'ATENÇÃO, divididos por exceção: {lista} vieram do GIS sem as chaves fechadas, então foram divididos pelos '
                 'religadores dos by-pass NA e pelas chaves das OS (aprovado em 16/10/2026). Têm poucos trechos e muito longos'
                 f'{faixa}: a NAE por trecho e os km vencidos deles não são confiáveis. Estão marcados "(exceção)" nas tabelas '
                 'e na seção "Divididos por exceção".')
    md = ['# Relatório de validação · trechos por município', '',
          f'Amostra de {PASSO_M} m por vão; alimentador entra no município com ≥ {MIN_M} m. NAE = ocorrências da Crítica '
          '(coletivas e individuais) associadas a um trecho ou não.', '',
          aviso_exc, '',
          'O total de cada município soma o alimentador inteiro (trechos, extensão e NAE de toda a rede, também a de '
          'outros municípios); só a coluna "No município (km)" é a parte do município. Por isso a soma dos municípios '
          'passa do total geral.', '']
    rn = resumo_nae(dados)
    md += ['## NAE', '', '- ' + texto_resumo_nae(rn),
           '- Consumidor·hora = soma por passo de manobra (consumidores × duração do passo). Acima de 24 h, momentâneas '
           '(< 3 min) e dia crítico ficam na NAE, marcadas (long, mom, dc); o DEC e o FEC pelo PRODIST não contam as '
           'duas últimas.', '']
    geral = dict(n=0, trechos=0, m=0, mm=0)
    for m in man['municipios']:
        md += [f'## {m["nome"]}', '', cab]
        tot = dict(n=0, trechos=0, m=0, mm=0)
        for a in m['alimentadores']:
            c = por[a['cod']]
            r, v = c['resumo'], c['validacao']
            na, nn = nae_resumo(c)
            exc = ' (exceção)' if c['alimentador'] in SEM_CHAVES else ''     # dividido por exceção (SEM_CHAVES)
            md.append(f'| {m["nome"]} | {c["polo"]} | {c["se"]} | {c["alimentador"]}{exc} | {r["trechos"]} | {r["T1"]["n"]} | '
                      f'{r["T2"]["n"]} | {r["T3"]["n"]} | {km(r["extensao_m"])} | {km(a["m_no_municipio"])} | '
                      f'{r["religadores"]} | {r["fusiveis"]} | {na} | {nn} | {c["topologia"]["pontos_sem_ligacao"]} | '
                      f'{len(c["continuidades_estimadas"])} | {len(v["avisos"])} | {v["status"]} |')
            for k, x in (('n', 1), ('trechos', r['trechos']), ('m', r['extensao_m']), ('mm', a['m_no_municipio'])):
                tot[k] += x
        md += [f'| **Total {m["nome"]} (alimentadores inteiros)** | | | {tot["n"]} alimentadores | {tot["trechos"]} | | | | {km(tot["m"])} | '
               f'{km(tot["mm"])} | | | | | | | | |', '']
        for k in ('n', 'trechos', 'mm'):
            geral[k] += tot[k]
    ok = [c for c in dados if c['validacao']['status'] != 'falha']
    md += ['## Total geral', '', f'- Municípios: {len(man["municipios"])}',
           f'- Alimentadores processados sem falha: {len(ok)} ({km(sum(c["resumo"]["extensao_m"] for c in ok))} km, '
           f'{sum(c["resumo"]["trechos"] for c in ok)} trechos)', '']
    md += ['## Divididos por exceção (sem chaves fechadas no GIS)', '']
    md += [f'- **{c["alimentador"]}** ({c["validacao"]["status"]}): '
           + (f'{c["resumo"]["trechos"]} trechos para {km(c["resumo"]["extensao_m"])} km'
              + (f'; maior trecho {maior[c["alimentador"]]["nome"]} com {km(maior[c["alimentador"]]["ext_m"])} km'
                 if c['alimentador'] in maior else '')
              if c.get('resumo') else 'não processado') for c in excecao] or ['- nenhum nesta rodada']
    md += ['']
    md += ['## Avisos por alimentador', '']
    for c in dados:
        v = c['validacao']
        av = list(v['avisos'])
        # o aviso "GIS sem as chaves" só sai com mais de 50 km por trecho: o dividido por exceção abaixo disso também é dito
        if c['alimentador'] in maior and not any('GIS sem as chaves' in a for a in av):
            t = maior[c['alimentador']]
            av.insert(0, f'dividido por exceção (GIS sem as chaves fechadas: {c["resumo"]["trechos"]} trechos para '
                         f'{km(c["resumo"]["extensao_m"])} km, o maior com {km(t["ext_m"])} km)')
        if av or v['criticas']:
            md.append(f'- **{c["alimentador"]}** ({v["status"]}): ' + '; '.join(v['criticas'] + av))
    md += ['', '## Não processados', '']
    falhas = [f'- {c["alimentador"]}: {"; ".join(c["validacao"]["criticas"])}' for c in dados if c['validacao']['status'] == 'falha']
    sem_mun = [f'- {c["alimentador"]}: nenhum município com ≥ {MIN_M} m' for c in dados
               if c['validacao']['status'] != 'falha' and not any(m['m'] >= MIN_M for m in c['municipios'])]
    md += falhas + sem_mun + [f'- {al}: sem KML do Daimon na pasta informada' for al in sorted(sem_kml)] or ['- nenhum']
    texto = '\n'.join(md) + '\n'
    (saida / 'relatorio.md').write_text(texto, encoding='utf-8')
    # no html, o aviso dos divididos por exceção vira caixa no topo e as linhas deles ficam marcadas
    pre = '\n'.join(f'<mark class="exc">{html.escape(l)}</mark>' if l.startswith('|') and '(exceção)' in l else html.escape(l)
                    for l in texto.split('\n'))
    caixa = ('<style>.exc-topo{border:1px solid var(--line);border-left:4px solid var(--aviso);background:var(--paper);'
             'border-radius:var(--r1,6px);padding:var(--s3,12px) var(--s4,16px);margin:0 0 var(--s4,16px);font-size:var(--t-sm,13px);'
             'line-height:1.5;color:var(--fg)}.exc-topo b{color:var(--aviso)}'
             '.relatorio mark.exc{background:color-mix(in srgb,var(--aviso) 22%,transparent);color:inherit}</style>'
             f'<div class="exc-topo" role="note"><b>Atenção, divididos por exceção:</b> {html.escape(aviso_exc.split(": ", 1)[1])}</div>')
    corpo = migalhas('./', 'Relatório') + caixa + '<pre class="relatorio">' + pre + '</pre>'
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
            if re.match(r'https?:|mailto:', ref) or '${' in ref:   # ${...}: modelo dentro de um script, não é link
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
    g.add_argument('--so-faixa', action='store_true',
                   help='só refaz dados/redes/faixa.txt (limpeza de faixa no satélite da página inicial; situação na data '
                        'de --data ou hoje) e a versão dele (data-faixa) no index.html')
    g.add_argument('--so-camadas', action='store_true',
                   help='só refaz dados/redes/inspecao.txt, executadas.txt e manutencao.txt (Inspeção, Manutenção e Insp→manut dos outros alimentadores no '
                        'mapa do alimentador)')
    g.add_argument('--so-nae', action='store_true',
                   help='só refaz dados/redes/nae.txt (a NAE de cada trecho T1/T2, camada NAE do satélite da página inicial)')
    g.add_argument('--vizinhos', nargs='?', const='', metavar='DESTINO',
                   help='só refaz dados/vizinhos/ (rede e equipamentos dos alimentadores vizinhos) a partir das páginas '
                        'de --saida (dados.js, chaves.js e ativos.js); grava em DESTINO/dados/vizinhos/ (sem DESTINO, na '
                        'própria --saida)')
    a = ap.parse_args(argv)
    saida = Path(a.saida)
    if a.validar:
        return 0 if validar_saida(saida) else 1
    if a.so_interface:
        interface(saida, malha_salva(a.malha, a.cache, saida))
        grava_tocantins(saida, a.cache)
        return 0 if validar_saida(saida) else 1
    if a.comparar:
        comparar(saida, a.comparar)
        return 0
    if a.so_faixa:
        v, r = faixa_mapa(saida, date.fromisoformat(a.data) if a.data else None)
        print(resumo_faixa(r))
        ini = saida / 'index.html'
        if ini.exists():
            h = ini.read_text(encoding='utf-8')
            n = re.sub(r'(<script src="assets/mapa-sat-to\.js[^"]*")(?: data-faixa="[^"]*")?>', rf'\1 data-faixa="{v}">', h)
            if n != h:
                ini.write_text(n, encoding='utf-8')
            print(f'index.html: data-faixa="{v}"')
        return 0
    if a.so_camadas:
        print(resumo_camadas(camadas_mapa(saida, date.fromisoformat(a.data) if a.data else None)))
        return 0
    if a.so_nae:
        print(resumo_nae_txt(nae_mapa(saida)))
        return 0
    if a.vizinhos is not None:
        als = vizinhos_mapa(saida, vizinhos_das_paginas(saida), a.vizinhos or None)
        print('vizinhos: ' + resumo_vizinhos(als, Path(a.vizinhos or saida) / 'dados' / 'vizinhos'))
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
    sem_kml = [al for al in alvos if al not in fontes.kmls and al not in fontes.sentinela]
    if a.todos:
        sem_kml = sorted(set(fontes.indice) - set(fontes.kmls) - fontes.sentinela)
    for al in alvos:
        if al not in fontes.kmls:
            continue
        c = processar(al, fontes, malha, saida, a.data)
        r = c.get('resumo')
        print(f'{al}: {c["validacao"]["status"]}' + (f' · {r["trechos"]} trechos · {km(r["extensao_m"])} km · '
              + ', '.join(f'{m["nome"]} {km(m["m"])} km' for m in c['municipios']) if r else f' · {c.get("erro")}'))
    dados, man = interface(saida, malha)
    grava_tocantins(saida, a.cache)
    relatorio(saida, dados, man, sem_kml)
    ok = validar_saida(saida)
    print(f'{len(man["municipios"])} município(s) · {sum(c["validacao"]["status"] != "falha" for c in dados)} alimentador(es) '
          f'nas páginas · relatório em {saida / "relatorio.md"}')
    print(texto_resumo_nae(resumo_nae(dados)))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
