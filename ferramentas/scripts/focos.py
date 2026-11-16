"""Focos de calor AO VIVO perto da rede de MT: grava dados/focos/agora.json do site (a tela "Focos de incêndio").

    python scripts/focos.py <pasta do site (teste/)> [--cache DIR] [--inpe DIR] [--firms DIR] [--agora AAAA-MM-DDTHH:MMZ]

É o mesmo código que a rotina do GitHub roda a cada 10 min (.github/workflows/focos.yml do ramo main do site;
docs/focos-rotina.md). Fontes públicas:
  - INPE, arquivos de 10 min (todos os satélites que o INPE usa: GOES-19, NOAA-20/21, Aqua, Terra, MetOp, MSG):
    https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/10min/  (o servidor guarda ~3,5 dias);
  - NASA FIRMS, CSV público da América do Sul, 7 dias: VIIRS NOAA-20 (J1), VIIRS NOAA-21 (J2) e MODIS (Aqua/Terra).
    Com a variável de ambiente FIRMS_MAP_KEY (chave do FIRMS; na rotina, o segredo do mesmo nome), usa a API do FIRMS
    (VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT e MODIS_NRT, últimos 5 dias, só a região do Tocantins com 3 graus de folga)
    no lugar dos CSVs públicos; se a API recusar a chave ou cair, volta ao CSV público daquela fonte e anota "aviso".
    A chave nunca vai para o agora.json nem para o registro.

O que faz:
  1. baixa os arquivos do INPE da janela (84 h) e os três CSVs do FIRMS; fica só com focos da janela, dentro do
     Tocantins ou a até 5 km da divisa (dados/tocantins.js);
  2. tira duplicados entre INPE e FIRMS: o mesmo satélite, no mesmo minuto, a até 400 m é um foco só (fonte "IF").
     Dentro de uma mesma fonte só se junta a mesma detecção repetida (mesmo satélite e minuto, a até 10 m; o INPE
     repete linhas com a posição ~1 m deslocada): pixels vizinhos do VIIRS (375 m) são focos distintos, como o INPE e
     o FIRMS contam;
  3. mede a distância de cada foco ao vão de MT mais próximo (vaos dos 322 alimentadores do manifesto.json, índice em
     grade de 0,01 grau) e anota o alimentador, o trecho e o município (IBGE) desse vão ("" no vão fora do TO, que
     não tem município: o mesmo critério de scripts/focos_historico.py);
  4. classifica a faixa: "sob" a rede quando o pixel do satélite cobre a rede (até 200 m no VIIRS 375 m, 500 m no
     MODIS 1 km e no AVHRR das MetOp, 1 km no GOES e no MSG), "1km" até 1 km, "5km" até 5 km; mais longe não entra;
  5. grava dados/focos/agora.json (formato abaixo) e imprime o resumo: focos no TO, perto da rede, por fonte e o
     atraso de cada fonte.

agora.json:
  {"gerado": "AAAA-MM-DDTHH:MMZ", "janela_h": 84, ["ramo": "focos",]
   "fontes": {"inpe": {"ultimo_arquivo", "arquivos", "ultimo_foco"},
              "firms": {"modo": "csv"|"api", "atualizado", "arquivos": [nomes], "ultimo_foco"}},
   "faixas": {"sob": texto, "1km": texto, "5km": texto}, "sensores": {satélite: texto},
   "contagem": {"to": focos no TO, "sob": n, "1km": n, "5km": n},
   "focos": [[lat, lon, "AAAA-MM-DDTHH:MMZ", satélite, fonte I|F|IF, dist_m, AL, trecho, faixa, frp|null, cod_mun]]}
  Horas em UTC. "ultimo_foco" é a observação mais nova do arquivo inteiro (América do Sul; na API, a região pedida),
  que mede o atraso da fonte; o Last-Modified do FIRMS ("atualizado") muda toda hora mesmo sem dado novo (na API, é a
  hora da consulta). cod_mun é o município do vão mais próximo (o mesmo recorte da rede por município do site; "" no
  vão fora do TO). frp só existe no FIRMS. "ramo" só com --ramo: a rotina grava o agora.json também no ramo de dados
  com esse nome e o mapa só tenta lê-lo (raw.githubusercontent.com) quando a cópia do site traz o campo (sem o ramo, o
  pedido daria 404 no console).

Opções:
  --cache DIR   guarda os arquivos baixados: do INPE só baixa o que ainda não tem (e de novo os 3 últimos); o FIRMS
                vem inteiro toda vez (o servidor não responde 304) e o do cache só vale se ele cair. Na rotina,
                aponte para uma pasta que fica entre as rodadas.
  --inpe DIR    lê os focos_10min_*.csv desta pasta em vez de baixar (teste ou rede fora).
  --firms DIR   lê os CSVs do FIRMS desta pasta (Last-Modified do <arquivo>.hdr, se houver; senão a data do arquivo).
  --agora       hora de referência da janela (padrão: agora, UTC).
  --ramo NOME   anota no agora.json o ramo de dados onde a rotina também o grava (a rotina passa "focos").
Se uma fonte cair e houver --cache, usa o que está no cache e anota "aviso" nela; sem cache, grava com a outra
fonte e anota "erro"; se as duas falharem, não grava e sai com código 1 (o agora.json anterior fica).
Só lê dado público de satélite: não há dado pessoal.
"""
import argparse
import concurrent.futures as cf
import csv
import datetime as dt
import email.utils
import io
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

INPE_URL = 'https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/10min/'
FIRMS_URL = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/'
FIRMS = [  # (arquivo, pasta no servidor, satélite pela coluna "satellite") — o CSV público e a API usam os mesmos códigos
    ('J1_VIIRS_C2_South_America_7d.csv', 'noaa-20-viirs-c2/csv/', {'N20': 'NOAA-20', '1': 'NOAA-20'}),
    ('J2_VIIRS_C2_South_America_7d.csv', 'noaa-21-viirs-c2/csv/', {'N21': 'NOAA-21', '2': 'NOAA-21'}),
    ('MODIS_C6_1_South_America_7d.csv', 'modis-c6.1/csv/', {'A': 'AQUA', 'T': 'TERRA', 'Aqua': 'AQUA', 'Terra': 'TERRA'}),
]
# com chave (FIRMS_MAP_KEY): API de área do FIRMS, a mesma fonte de cada CSV público acima
FIRMS_API = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/{chave}/{fonte}/{area}/{dias}'
FIRMS_API_FONTE = {'J1_VIIRS_C2_South_America_7d.csv': 'VIIRS_NOAA20_NRT',
                   'J2_VIIRS_C2_South_America_7d.csv': 'VIIRS_NOAA21_NRT',
                   'MODIS_C6_1_South_America_7d.csv': 'MODIS_NRT'}
FIRMS_API_DIAS = 5     # o máximo da API; cobre a janela de 84 h a qualquer hora do dia
FIRMS_API_FOLGA = 3.0  # graus em volta do Tocantins: dá foco quase sempre (atraso medido) sem baixar o continente
JANELA_H = 84
DUP_M = 400            # INPE x FIRMS: mesmo satélite, mesmo minuto, até 400 m
REP_M = 10             # dentro de uma fonte: a mesma detecção repetida (mesmo satélite e minuto, até 10 m)
MAX_M = 5000           # mais longe da rede não entra
FOLGA_TO_M = 5000      # recorte do TO com 5 km de folga
CEL = 0.01             # grade do índice de vãos (grau)
UA = 'ARGOS-focos/1.0 (dados publicos de focos de calor)'
AVISOS = defaultdict(list)  # fonte -> avisos da rodada (fonte fora do ar e cache usado)

SENSOR = {  # classe do sensor -> (texto, raio "sob a rede" em m)
    'VIIRS': ('VIIRS, pixel de 375 m', 200),
    'MODIS': ('MODIS, pixel de 1 km', 500),
    'AVHRR': ('AVHRR, pixel de 1,1 km', 500),
    'GEO': ('geoestacionário, pixel de 2 a 4 km', 1000),
}
FAIXAS = {
    'sob': 'Sob a rede: o pixel do satélite cobre a rede (até 200 m no VIIRS, 500 m no MODIS, 1 km no GOES)',
    '1km': 'Até 1 km da rede',
    '5km': 'De 1 a 5 km da rede',
}


def classe(sat):
    if sat in ('NOAA-20', 'NOAA-21', 'SUOMI-NPP'):
        return 'VIIRS'
    if sat in ('AQUA', 'TERRA'):
        return 'MODIS'
    if sat.startswith(('GOES', 'MSG')):
        return 'GEO'
    if sat.startswith(('METOP', 'NOAA-')):
        return 'AVHRR'
    return 'MODIS'


def sat_inpe(nome):
    """'AQUA_M-T' -> 'AQUA', 'NPP-375' -> 'SUOMI-NPP'; o resto como o INPE escreve ('GOES-19', 'NOAA-20', 'METOP-B')."""
    s = nome.strip().upper()
    s = re.sub(r'_M-[A-Z]$', '', s)
    if s.startswith('NPP'):
        return 'SUOMI-NPP'
    return s


def fmt(t):
    return t.strftime('%Y-%m-%dT%H:%MZ')


def utc(s):
    return dt.datetime.strptime(s, '%Y-%m-%dT%H:%MZ').replace(tzinfo=dt.timezone.utc)


# ----------------------------------------------------------------------------------------------------------- download
def baixa(url, ims=None, tentativas=4):
    """(bytes, last_modified) ou (None, last_modified) quando o servidor responde 304 (não mudou)."""
    erro = None
    for k in range(tentativas):
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        if ims:
            req.add_header('If-Modified-Since', ims)
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read(), r.headers.get('Last-Modified')
        except urllib.error.HTTPError as e:
            if e.code == 304:
                return None, ims
            erro = e
            if 400 <= e.code < 500:
                break
        except Exception as e:  # rede: tenta de novo
            erro = e
        if k < tentativas - 1:
            time.sleep(3 + 5 * k)
    raise RuntimeError(f'{url}: {erro}')


def lm_utc(texto):
    if not texto:
        return None
    try:
        return email.utils.parsedate_to_datetime(texto).astimezone(dt.timezone.utc)
    except (TypeError, ValueError):
        return None


def slot(nome):
    m = re.match(r'focos_10min_(\d{8})_(\d{4})\.csv$', nome)
    return dt.datetime.strptime(m.group(1) + m.group(2), '%Y%m%d%H%M').replace(tzinfo=dt.timezone.utc) if m else None


def inpe_arquivos(agora, pasta=None, cache=None):
    """{nome: texto} dos arquivos de 10 min com hora >= agora - janela; e quantos falharam."""
    ini = agora - dt.timedelta(hours=JANELA_H)
    if pasta:
        nomes = sorted(p.name for p in Path(pasta).glob('focos_10min_*.csv'))
        nomes = [n for n in nomes if slot(n) and ini <= slot(n) <= agora + dt.timedelta(minutes=10)]
        return {n: (Path(pasta) / n).read_text(encoding='utf-8', errors='replace') for n in nomes}, 0
    cdir = Path(cache) / 'inpe' if cache else None
    try:
        lista, _ = baixa(INPE_URL)
    except RuntimeError:
        if cdir and any(cdir.glob('focos_10min_*.csv')):  # INPE fora: fica com o que já estava no cache
            AVISOS['inpe'].append('INPE fora do ar; arquivos do cache')
            return inpe_arquivos(agora, pasta=cdir)
        raise
    nomes = sorted(set(re.findall(r'href="(focos_10min_\d{8}_\d{4}\.csv)"', lista.decode('utf-8', 'replace'))))
    nomes = [n for n in nomes if slot(n) and slot(n) >= ini]
    if not nomes:
        raise RuntimeError('INPE: lista de arquivos de 10 min vazia')
    if cdir:
        cdir.mkdir(parents=True, exist_ok=True)
        for p in cdir.glob('focos_10min_*.csv'):  # fora da janela: apaga
            if p.name not in nomes:
                p.unlink()
    recentes = set(nomes[-3:])
    out, falhas = {}, 0

    def um(n):
        if cdir and (cdir / n).exists() and n not in recentes:
            return n, (cdir / n).read_text(encoding='utf-8', errors='replace')
        try:
            b, _ = baixa(INPE_URL + n)
        except RuntimeError:
            if cdir and (cdir / n).exists():  # um dos 3 últimos que não veio de novo: o do cache vale
                return n, (cdir / n).read_text(encoding='utf-8', errors='replace')
            raise
        if cdir:
            (cdir / n).write_bytes(b)
        return n, b.decode('utf-8', 'replace')

    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        for fut in cf.as_completed([ex.submit(um, n) for n in nomes]):
            try:
                n, txt = fut.result()
                out[n] = txt
            except Exception as e:  # um arquivo que falhou não derruba a rodada
                falhas += 1
                print(f'  aviso: {e}', file=sys.stderr)
    return out, falhas


def firms_api(nome, chave, area):
    """Texto CSV da API do FIRMS para a fonte do arquivo público `nome`; RuntimeError sem a chave no texto do erro."""
    url = FIRMS_API.format(chave=chave, fonte=FIRMS_API_FONTE[nome], area=area, dias=FIRMS_API_DIAS)
    try:
        b, _ = baixa(url)
    except RuntimeError as e:
        raise RuntimeError(str(e).replace(url, '').lstrip(': ').replace(chave, '***')) from None
    txt = b.decode('utf-8', 'replace')
    if not txt.lstrip().lower().startswith('latitude,'):  # chave inválida, cota estourada... vem em texto
        raise RuntimeError(txt.strip()[:120].replace(chave, '***'))
    return txt


def firms_arquivos(pasta=None, cache=None, chave=None, area=None):
    """[(nome, texto, last_modified utc, mapa de satélite)]; com chave, cada fonte vem da API (ou do CSV se ela falhar)."""
    out, falha_api = [], defaultdict(list)
    for nome, sub, sats in FIRMS:
        if chave and not pasta:
            try:
                txt = firms_api(nome, chave, area)
                out.append(('API ' + FIRMS_API_FONTE[nome], txt, dt.datetime.now(dt.timezone.utc), sats))
                continue
            except RuntimeError as e:
                falha_api[str(e)].append(FIRMS_API_FONTE[nome])
        if pasta:
            p = Path(pasta) / nome
            lm = None
            for h in (Path(pasta) / (nome + '.hdr'), Path(pasta) / (nome + '.h')):
                if h.exists():
                    for ln in h.read_text(encoding='latin-1').splitlines():
                        if ln.lower().startswith('last-modified:'):
                            lm = lm_utc(ln.split(':', 1)[1].strip())
            lm = lm or dt.datetime.fromtimestamp(p.stat().st_mtime, dt.timezone.utc)
            out.append((nome, p.read_text(encoding='utf-8', errors='replace'), lm, sats))
            continue
        cdir = Path(cache) / 'firms' if cache else None
        ims = None
        if cdir:
            cdir.mkdir(parents=True, exist_ok=True)
            if (cdir / nome).exists() and (cdir / (nome + '.lm')).exists():
                ims = (cdir / (nome + '.lm')).read_text().strip()
        try:
            b, lm = baixa(FIRMS_URL + sub + nome, ims=ims)
        except RuntimeError:
            if not ims:
                raise
            AVISOS['firms'].append(f'{nome} fora do ar; arquivo do cache')
            b, lm = None, ims
        if b is None:  # 304 (ou FIRMS fora): o do cache vale
            b = (cdir / nome).read_bytes()
        elif cdir:
            (cdir / nome).write_bytes(b)
            (cdir / (nome + '.lm')).write_text(lm or '')
        out.append((nome, b.decode('utf-8', 'replace'), lm_utc(lm), sats))
    for erro, fs in falha_api.items():  # um aviso por erro: "API do FIRMS (fontes): erro; CSV público"
        AVISOS['firms'].append(f'API do FIRMS ({", ".join(fs)}): {erro}; CSV público')
    return out


# ------------------------------------------------------------------------------------------------------------ leitura
def le_inpe(arquivos, ini, fim, caixa):
    focos, ultimo, por_sat = [], None, {}
    for nome in sorted(arquivos):
        for r in csv.DictReader(io.StringIO(arquivos[nome])):
            r = {(k or '').strip(): (v or '').strip() for k, v in r.items()}
            try:
                la, lo, d = float(r['lat']), float(r['lon']), r['data']
                t = dt.datetime.strptime(d if len(d) > 10 else d + ' 00:00:00', '%Y-%m-%d %H:%M:%S')
            except (KeyError, ValueError):
                continue
            t = t.replace(tzinfo=dt.timezone.utc)
            sat = sat_inpe(r.get('satelite', ''))
            if t <= fim:
                ultimo = max(ultimo, t) if ultimo else t
                por_sat[sat] = max(por_sat.get(sat, t), t)
            if ini <= t <= fim and caixa[0] <= la <= caixa[1] and caixa[2] <= lo <= caixa[3]:
                focos.append({'lat': la, 'lon': lo, 't': t, 'sat': sat, 'fonte': 'I', 'frp': None})
    return focos, ultimo, por_sat


def le_firms(arquivos, ini, fim, caixa):
    focos, ultimo, por_sat = [], None, {}
    for nome, txt, _, sats in arquivos:
        for r in csv.DictReader(io.StringIO(txt)):
            try:
                la, lo = float(r['latitude']), float(r['longitude'])
                t = dt.datetime.strptime(r['acq_date'] + r['acq_time'].strip().zfill(4), '%Y-%m-%d%H%M')
            except (KeyError, ValueError):
                continue
            t = t.replace(tzinfo=dt.timezone.utc)
            sat = sats.get((r.get('satellite') or '').strip(), next(iter(sats.values())))
            if t <= fim:
                ultimo = max(ultimo, t) if ultimo else t
                por_sat[sat] = max(por_sat.get(sat, t), t)
            if ini <= t <= fim and caixa[0] <= la <= caixa[1] and caixa[2] <= lo <= caixa[3]:
                try:
                    frp = round(float(r['frp']), 1)
                except (KeyError, ValueError):
                    frp = None
                focos.append({'lat': la, 'lon': lo, 't': t, 'sat': sat, 'fonte': 'F', 'frp': frp})
    return focos, ultimo, por_sat


def metros(la1, lo1, la2, lo2):
    return math.hypot((la2 - la1) * 110574, (lo2 - lo1) * 111320 * math.cos(math.radians((la1 + la2) / 2)))


def sem_repetidos(focos):
    """A mesma detecção em mais de uma linha da mesma fonte (mesmo satélite e minuto, até REP_M): fica a primeira. Grade
    de 2 × REP_M em grau de latitude: o vizinho a até REP_M está numa das 9 células em volta, sem depender de
    arredondamento."""
    c = 2 * REP_M / 110574
    grade, out = defaultdict(list), []
    for f in focos:
        gy, gx = math.floor(f['lat'] / c), math.floor(f['lon'] / c)
        if any(metros(f['lat'], f['lon'], a, b) <= REP_M for dy in (-1, 0, 1) for dx in (-1, 0, 1)
               for a, b in grade.get((f['sat'], f['t'], gy + dy, gx + dx), ())):
            continue
        grade[(f['sat'], f['t'], gy, gx)].append((f['lat'], f['lon']))
        out.append(f)
    return out


def junta(firms, inpe):
    """Foco do INPE que é o mesmo do FIRMS (mesmo satélite e minuto, até 400 m) vira um só, fonte 'IF'."""
    idx = defaultdict(list)
    for i, f in enumerate(firms):
        idx[(f['sat'], f['t'])].append(i)
    usados, so_inpe = set(), []
    for f in inpe:
        melhor = None
        for i in idx.get((f['sat'], f['t']), ()):
            if i in usados:
                continue
            d = metros(f['lat'], f['lon'], firms[i]['lat'], firms[i]['lon'])
            if d <= DUP_M and (melhor is None or d < melhor[0]):
                melhor = (d, i)
        if melhor:
            usados.add(melhor[1])
            firms[melhor[1]]['fonte'] = 'IF'
        else:
            so_inpe.append(f)
    return firms + so_inpe


# ---------------------------------------------------------------------------------------------------- geometria (TO)
def tocantins(site):
    txt = (Path(site) / 'dados' / 'tocantins.js').read_text(encoding='utf-8')
    aneis = json.loads(txt[txt.index('['): txt.rindex(']') + 1])
    return [np.array([(p[1], p[0]) for p in a], dtype=float) for a in aneis]  # (lon, lat)


def dist_segs(lon, lat, x1, y1, x2, y2):
    """Distância (m) do ponto a cada segmento (arrays em graus), em projeção local."""
    kx, ky = 111320 * math.cos(math.radians(lat)), 110574.0
    ax, ay = (x1 - lon) * kx, (y1 - lat) * ky
    vx, vy = (x2 - x1) * kx, (y2 - y1) * ky
    L = vx * vx + vy * vy
    t = np.clip(-(ax * vx + ay * vy) / np.where(L == 0, 1, L), 0, 1)
    px, py = ax + t * vx, ay + t * vy
    return np.sqrt(px * px + py * py)


def no_to(aneis, lon, lat):
    """(dentro do TO, dentro do TO ou a até 5 km da divisa)"""
    dentro = False
    perto = math.inf
    for a in aneis:
        x1, y1 = a[:, 0], a[:, 1]
        x2, y2 = np.roll(x1, -1), np.roll(y1, -1)
        cruza = ((y1 > lat) != (y2 > lat)) & (lon < (x2 - x1) * (lat - y1) / np.where(y2 == y1, 1e-12, y2 - y1) + x1)
        if int(cruza.sum()) % 2:
            dentro = not dentro
        perto = min(perto, float(dist_segs(lon, lat, x1, y1, x2, y2).min()))
    return dentro, dentro or perto <= FOLGA_TO_M


# ------------------------------------------------------------------------------------------------------- rede (vãos)
class Rede:
    """Vãos de MT dos alimentadores do manifesto, com índice em grade para achar o vão mais próximo."""

    def __init__(self, site):
        site = Path(site)
        man = json.loads((site / 'manifesto.json').read_text(encoding='utf-8'))
        X1, Y1, X2, Y2, AL, TR, MU = [], [], [], [], [], [], []
        self.als, self.trechos, self.muns = [], [], []
        mun_i = {}
        for cod, info in sorted(man['alimentadores'].items()):
            d = json.loads((site / info.get('dados', f'dados/alimentadores/{cod}.json')).read_text(encoding='utf-8'))
            a = len(self.als)
            self.als.append(cod)
            self.trechos.append([t.get('nome', '') for t in d.get('trechos', [])])
            for v in d.get('vaos', []):  # [lon1, lat1, lon2, lat2, i_trecho, m, poste1, poste2, cod_mun]
                X1.append(v[0]); Y1.append(v[1]); X2.append(v[2]); Y2.append(v[3])
                AL.append(a); TR.append(v[4] if v[4] is not None else -1)
                m = (v[8] if len(v) > 8 else None) or ''   # vão fora do TO: sem município (como no histórico)
                if m not in mun_i:
                    mun_i[m] = len(self.muns)
                    self.muns.append(m)
                MU.append(mun_i[m])
        self.x1, self.y1, self.x2, self.y2 = (np.array(c, dtype=float) for c in (X1, Y1, X2, Y2))
        self.al, self.tr, self.mu = (np.array(c, dtype=np.int32) for c in (AL, TR, MU))
        gx1 = np.floor(np.minimum(self.x1, self.x2) / CEL).astype(np.int64)
        gx2 = np.floor(np.maximum(self.x1, self.x2) / CEL).astype(np.int64)
        gy1 = np.floor(np.minimum(self.y1, self.y2) / CEL).astype(np.int64)
        gy2 = np.floor(np.maximum(self.y1, self.y2) / CEL).astype(np.int64)
        um = (gx1 == gx2) & (gy1 == gy2)
        chaves, idx = [self._chave(gx1[um], gy1[um])], [np.nonzero(um)[0]]
        mk, mi = [], []
        for i in np.nonzero(~um)[0]:
            for gx in range(gx1[i], gx2[i] + 1):
                for gy in range(gy1[i], gy2[i] + 1):
                    mk.append(self._chave(gx, gy)); mi.append(i)
        chaves.append(np.array(mk, dtype=np.int64)); idx.append(np.array(mi, dtype=np.int64))
        chaves, idx = np.concatenate(chaves), np.concatenate(idx)
        ordem = np.argsort(chaves, kind='stable')
        self.idx = idx[ordem]
        u, ini = np.unique(chaves[ordem], return_index=True)
        fim = np.append(ini[1:], len(ordem))
        self.cel = dict(zip(u.tolist(), zip(ini.tolist(), fim.tolist())))
        self.km = None

    @staticmethod
    def _chave(gx, gy):
        return (gx + 100000) * 1000000 + (gy + 100000)

    def mais_proximo(self, lon, lat):
        """(dist_m, AL, trecho, cod_mun) do vão mais próximo até 5 km, ou None."""
        gx, gy = math.floor(lon / CEL), math.floor(lat / CEL)
        lado = CEL * min(111320 * math.cos(math.radians(lat)), 110574)  # menor lado da célula, em m
        for r in (1, math.ceil(MAX_M / lado)):
            partes = []
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    s = self.cel.get(self._chave(gx + dx, gy + dy))
                    if s:
                        partes.append(self.idx[s[0]:s[1]])
            if not partes:
                continue
            c = np.unique(np.concatenate(partes))
            d = dist_segs(lon, lat, self.x1[c], self.y1[c], self.x2[c], self.y2[c])
            j = int(np.argmin(d))
            if d[j] <= r * lado or r > 1:  # na 1ª volta só vale se nada de fora do anel pode estar mais perto
                if d[j] > MAX_M:
                    return None
                i = int(c[j])
                a, t = int(self.al[i]), int(self.tr[i])
                trechos = self.trechos[a]
                return float(d[j]), self.als[a], (trechos[t] if 0 <= t < len(trechos) else ''), self.muns[int(self.mu[i])]
        return None


# --------------------------------------------------------------------------------------------------------- principal
def faixa(d, sat):
    if d <= SENSOR[classe(sat)][1]:
        return 'sob'
    return '1km' if d <= 1000 else '5km'


def grava(caminho, cab, focos):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    s = json.dumps(cab, ensure_ascii=False, separators=(',', ':'))
    linhas = ',\n'.join(json.dumps(f, ensure_ascii=False, separators=(',', ':')) for f in focos)
    tmp = caminho.with_suffix('.tmp')
    tmp.write_text(s[:-1] + ',"focos":[\n' + linhas + ('\n' if linhas else '') + ']}\n', encoding='utf-8')
    os.replace(tmp, caminho)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('site')
    ap.add_argument('--cache')
    ap.add_argument('--inpe')
    ap.add_argument('--firms')
    ap.add_argument('--agora')
    ap.add_argument('--ramo')
    a = ap.parse_args()
    agora = utc(a.agora) if a.agora else dt.datetime.now(dt.timezone.utc).replace(second=0, microsecond=0)
    ini = agora - dt.timedelta(hours=JANELA_H)
    t0 = time.time()

    aneis = tocantins(a.site)
    todos = np.concatenate(aneis)
    folga = 0.06  # ~5 km em grau, para a caixa
    caixa = (todos[:, 1].min() - folga, todos[:, 1].max() + folga, todos[:, 0].min() - folga, todos[:, 0].max() + folga)

    fontes, erros = {}, {}
    try:
        arq_i, falhas = inpe_arquivos(agora, a.inpe, a.cache)
        inpe, ult_i, sat_i = le_inpe(arq_i, ini, agora, caixa)
        ultimo_arq = max(slot(n) for n in arq_i) if arq_i else None
        fontes['inpe'] = {'ultimo_arquivo': fmt(ultimo_arq) if ultimo_arq else None, 'arquivos': len(arq_i),
                          'ultimo_foco': fmt(ult_i) if ult_i else None}
        if falhas:
            fontes['inpe']['falhas'] = falhas
    except Exception as e:
        inpe, sat_i, ultimo_arq = [], {}, None
        fontes['inpe'] = {'ultimo_arquivo': None, 'arquivos': 0, 'ultimo_foco': None, 'erro': str(e)[:200]}
        erros['inpe'] = e
    chave = os.environ.get('FIRMS_MAP_KEY', '').strip()
    area = ','.join(f'{x:.2f}' for x in (caixa[2] - FIRMS_API_FOLGA, caixa[0] - FIRMS_API_FOLGA,
                                          caixa[3] + FIRMS_API_FOLGA, caixa[1] + FIRMS_API_FOLGA))  # oeste,sul,leste,norte
    try:
        arq_f = firms_arquivos(a.firms, a.cache, chave, area)
        firms, ult_f, sat_f = le_firms(arq_f, ini, agora, caixa)
        lms = [x[2] for x in arq_f if x[2]]
        fontes['firms'] = {'modo': 'api' if any(x[0].startswith('API ') for x in arq_f) else 'csv',
                           'atualizado': fmt(max(lms)) if lms else None, 'arquivos': [x[0] for x in arq_f],
                           'ultimo_foco': fmt(ult_f) if ult_f else None}
    except Exception as e:
        firms, sat_f, lms = [], {}, []
        fontes['firms'] = {'modo': 'api' if chave else 'csv', 'atualizado': None, 'arquivos': [], 'ultimo_foco': None,
                           'erro': str(e)[:200].replace(chave, '***') if chave else str(e)[:200]}
        erros['firms'] = e
    for k, v in AVISOS.items():
        fontes[k]['aviso'] = '; '.join(v)
        print(f'  aviso {k}: {fontes[k]["aviso"]}', file=sys.stderr)
    if len(erros) == 2:
        print(f'as duas fontes falharam: {erros}', file=sys.stderr)
        sys.exit(1)

    brutos = Counter({'I': len(inpe), 'F': len(firms)})
    inpe, firms = sem_repetidos(inpe), sem_repetidos(firms)
    focos = junta(firms, inpe)

    rede = Rede(a.site)
    no_estado = Counter()
    saida, conta = [], Counter()
    por_fonte = defaultdict(Counter)
    por_sat = defaultdict(Counter)
    for f in focos:
        dentro, recorte = no_to(aneis, f['lon'], f['lat'])
        if dentro:
            no_estado[f['fonte']] += 1
            por_sat[f['sat']]['to'] += 1
        if not recorte:
            continue
        p = rede.mais_proximo(f['lon'], f['lat'])
        if not p:
            continue
        d, al, trecho, mun = p
        fx = faixa(d, f['sat'])
        conta[fx] += 1
        por_fonte[f['fonte']][fx] += 1
        por_sat[f['sat']][fx] += 1
        saida.append([round(f['lat'], 5), round(f['lon'], 5), fmt(f['t']), f['sat'], f['fonte'], round(d), al, trecho,
                      fx, f['frp'], mun])
    saida.sort(key=lambda x: (x[2], x[0], x[1]), reverse=True)

    sats = sorted({x[3] for x in saida} | set(por_sat))
    cab = {'gerado': fmt(agora), 'janela_h': JANELA_H, **({'ramo': a.ramo} if a.ramo else {}), 'fontes': fontes, 'faixas': FAIXAS,
           'sensores': {s: SENSOR[classe(s)][0] for s in sats},
           'contagem': {'to': sum(no_estado.values()), 'sob': conta['sob'], '1km': conta['1km'], '5km': conta['5km']}}
    destino = Path(a.site) / 'dados' / 'focos' / 'agora.json'
    grava(destino, cab, saida)

    # resumo
    def atraso(t):
        if not t:
            return '-'
        m = max(0, int((agora - t).total_seconds() // 60))
        return f'{m // 60}h{m % 60:02d}'
    print(f'gerado {fmt(agora)} (janela {JANELA_H} h, desde {fmt(ini)}) em {time.time() - t0:.0f} s -> {destino}')
    print(f"INPE : {fontes['inpe'].get('arquivos')} arquivos, último {fontes['inpe'].get('ultimo_arquivo')} "
          f"(atraso {atraso(ultimo_arq)}); foco mais novo {fontes['inpe'].get('ultimo_foco')}"
          + (f"; ERRO {fontes['inpe']['erro']}" if 'erro' in fontes['inpe'] else ''))
    for s, t in sorted(sat_i.items(), key=lambda x: x[1], reverse=True):
        print(f'        {s:<10} foco mais novo {fmt(t)} (atraso {atraso(t)})')
    print(f"FIRMS: atualizado {fontes['firms'].get('atualizado')} (atraso {atraso(max(lms) if lms else None)}); "
          f"foco mais novo {fontes['firms'].get('ultimo_foco')}"
          + (f"; ERRO {fontes['firms']['erro']}" if 'erro' in fontes['firms'] else ''))
    for s, t in sorted(sat_f.items(), key=lambda x: x[1], reverse=True):
        print(f'        {s:<10} foco mais novo {fmt(t)} (atraso {atraso(t)})')
    print(f"na caixa do TO: INPE {brutos['I']}, FIRMS {brutos['F']}; depois de juntar: {len(focos)}")
    print(f"no TO: {sum(no_estado.values())} (só INPE {no_estado['I']}, só FIRMS {no_estado['F']}, "
          f"nos dois {no_estado['IF']})")
    perto = conta['sob'] + conta['1km'] + conta['5km']
    print(f"perto da rede: até 5 km {perto}, até 1 km {conta['sob'] + conta['1km']}, sob a rede {conta['sob']}")
    for fo in ('I', 'F', 'IF'):
        c = por_fonte[fo]
        print(f"  fonte {fo:<2}: até 5 km {sum(c.values())}, até 1 km {c['sob'] + c['1km']}, sob {c['sob']}")
    for s in sats:
        c = por_sat[s]
        print(f"  {s:<10} no TO {c['to']}, até 5 km {c['sob'] + c['1km'] + c['5km']}, até 1 km {c['sob'] + c['1km']}, "
              f"sob {c['sob']}")
    print(f"alimentadores com foco até 5 km: {len({x[6] for x in saida})}; até 1 km: "
          f"{len({x[6] for x in saida if x[8] != '5km'})}")


if __name__ == '__main__':
    main()
