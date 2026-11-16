"""Histórico de focos de calor perto da rede (12 meses) e incêndios da Crítica, para o mapa de focos do ARGOS.

    python scripts/focos_historico.py --site <pasta teste/> --focos "<pasta>/focos_mensal_*.csv" \\
        --critica "<pasta>/Critica*_MM-AAAA.txt" [--critica ...] [--de AAAA-MM] [--ate AAAA-MM] [--corte AAAA-MM-DDTHH:MMZ]
    python scripts/focos_historico.py --site <pasta teste/> --atualiza-inpe [--cache DIR]  (rotina diária, abaixo)
    python scripts/focos_historico.py --site <pasta teste/> --critica "..." --candidatos   (só lista, não grava)

Rode depois de scripts/focos.py: o corte do histórico sai do agora.json (ver Corte).

Grava em <site>/dados/focos/ (a tela lê exatamente isto):
  resumo.json   {"gerado", "meses": ["2025-12", ..., "2026-11"], "historico_ate", "agora_somado_ate",
                 "al": {"<AL>": {"sob": [por mês], "1km": [...], "5km": [...], "inc": [...]}},
                 "mun": {"<cod IBGE>": {mesmos campos}},
                 "dias": ["AAAA-MM-DD", ... 35 dias; o último é o dia local de agora_somado_ate],
                 "al_dias": {"<AL>": {"sob": [por dia], "1km": [...], "5km": [...]}},
                 "mun_dias": {"<cod IBGE>": {mesmos campos}},
                 + metadados (hora, faixas, pontos_ate, fontes)}
                Focos: o histórico (CSV mensal) até historico_ate mais os do agora.json depois dele, até
                agora_somado_ate (o "gerado" do agora.json usado menos MARGEM_ATRASO_H = 12 h, para o foco que chega
                atrasado ao satélite ainda cair depois do corte). Para ficar em dia entre uma rodada e outra, a tela
                soma por cima os focos do agora.json atual com hora > agora_somado_ate (só NOAA-20, NOAA-21, AQUA e
                TERRA): o mesmo corte nas contagens e nos pontos de al/.
                Faixas exclusivas (um foco numa faixa só): sob + 1km + 5km = todos até 5 km. "inc" = incêndios da
                Crítica por mês de competência. Por dia ("al_dias", "mun_dias"): só focos, só alimentador ou município
                com algum foco nos 35 dias (os outros: tudo zero). Mês e dia saem da hora local.
  al/<AL>.json  {"al", "hora", "historico_ate", "csv_ate",
                 "focos": [[lat, lon, "AAAA-MM-DD HH:MM", satélite, dist_m, trecho, faixa, cod_mun]],
                 "incendios": [["AAAA-MM-DD HH:MM", ativo, trecho, cons, dur_min, "HO"|"texto", causa_registrada,
                                cod_mun, "AAAA-MM", lat, lon]]}
                Um por alimentador com foco ou incêndio no período. Focos em ordem de hora: os do CSV mensal até
                csv_ate (= historico_ate do resumo) e, dele até historico_ate (= agora_somado_ate do resumo), os VIIRS
                e MODIS do agora.json usado, com a distância, o trecho, a faixa e o município que o agora.json deu. A
                tela soma por cima só os do agora.json atual com hora > historico_ate (os outros satélites, só pontos
                ao vivo, vêm todos do agora.json). Assim o painel do alimentador conta o mesmo que o resumo, sem o
                buraco entre o fim do CSV e o início da janela do agora.json, que anda até 24 h entre duas rodadas
                diárias. cod_mun: o do vão mais próximo ("" fora do TO), o mesmo critério de resumo.json e agora.json.
                Incêndio: abertura (hora local), ativo que abriu (chave, religador, trafo ou o DJ), trecho (null sem
                trecho: na subestação, ativo fora do cadastro...), consumidores, duração (min), "HO" (subcausa INCÊNDIO
                da Crítica: Causada por terceiros · Incêndio) ou "texto" (achado pelo texto livre do registro),
                causa_registrada ("" no HO; no "texto", a causa e a subcausa da Crítica, ex. "Condutor de AT / partido
                na fase"), município, mês de competência e o ponto do ativo (lat, lon; o início do trecho quando o
                ativo não tem ponto; null sem os dois). O fogo pode estar a jusante do ativo.

O que não vem na rodada fica como estava (é assim que a rotina diária roda sem a Crítica):
  - Focos: cada CSV cobre um período (focos_mensal_*_AAAAMM: o mês inteiro em UTC; outro arquivo: do primeiro ao
    último foco). Os pontos já gravados em al/*.json fora do período dos arquivos ficam (refeitos contra a rede atual);
    os de dentro são trocados pelos do arquivo. As contagens por mês e por dia são refeitas de todos os pontos.
  - Incêndios: sem --critica, ficam os já gravados. Com --critica, os meses dos arquivos (MM-AAAA no nome) são trocados
    inteiros e os outros meses ficam (registro de competência de outro mês que vem de passagem no arquivo de um mês
    não entra).
  - O que sai dos 12 meses é descartado. --refaz ignora o que está gravado (refaz só com os arquivos passados).

Rotina diária (--atualiza-inpe [--cache DIR]; .github/workflows/focos.yml do site, docs/focos-rotina.md)
  Baixa sozinho o CSV mensal do INPE (csv/mensal/Brasil/focos_mensal_br_AAAAMM.csv) de cada mês UTC desde o fim do
  histórico gravado (historico_ate, ou o foco mais novo dos arquivos, o que vier antes) até o corte novo: em geral só o
  mês corrente; na virada, o anterior também; sem nada gravado, os 12 meses. Recorta ao baixar (só os sensores do
  histórico, na caixa da rede com folga), troca os focos desses meses, mantém os outros e os incêndios e soma o agora.json
  depois do novo corte. Mês que o INPE ainda não publicou (404) fica para a próxima. Com --focos, usa esses arquivos em
  vez de baixar. Precisa só de dados/alimentadores/, dados/focos/ e do agora.json novo (sem Crítica nem trafos).

Focos
  Entrada: CSV do INPE (dados abertos do BDQueimadas, csv/mensal/Brasil/focos_mensal_br_AAAAMM.csv, inteiro ou já
  recortado) e/ou do FIRMS (arquivo anual por país: latitude, longitude, acq_date, acq_time, satellite). O FIRMS não
  publica o ano corrente por país (2026 dá 404) nem o NOAA-21 de 2025; o INPE recebe os mesmos sensores do próprio FIRMS
  (NRT): NOAA-20 e Terra batem ponto a ponto com o anual do FIRMS (dez/2025); o Aqua do INPE vem com geolocalização
  própria (umas centenas de metros do FIRMS). Ficam só os sensores do FIRMS: VIIRS NOAA-20 e NOAA-21 e MODIS Aqua e Terra
  (S-NPP, GOES, METOP e MSG ficam de fora do histórico e das contagens).
  Distância: do centro do pixel ao vão de média tensão mais próximo (dados/alimentadores/*.json, todos os alimentadores);
  o foco fica no alimentador, no trecho e no município (IBGE, campo do vão) desse vão. Mais de 5 km: não entra.
  Vão de rede fora do TO não tem município: o foco conta no alimentador e não entra em "mun".
  Faixas (as mesmas de agora.json): sob = o pixel cobre a rede (até 200 m no VIIRS 375 m, 500 m no MODIS 1 km, 1 km no
  GOES); 1km = até 1 km; 5km = de 1 a 5 km.
  Duplicados: a mesma detecção em mais de uma linha (mesmo satélite e minuto, a até 10 m), como scripts/focos.py faz
  dentro de uma fonte. O CSV mensal do INPE repete detecções com ids diferentes e a posição ~1 m deslocada (out/2026:
  905 pares no TO); pixels distintos do VIIRS ficam a mais de 25 m um do outro e não se juntam. A regra de até 400 m de
  agora.json é para juntar INPE e FIRMS; num arquivo só ela apagaria os pixels vizinhos do VIIRS (375 m um do outro),
  que são focos diferentes (no histórico de dez/2025 a nov/2026, ~40 mil de ~199 mil).
  Hora: local do Tocantins (UTC−3), "AAAA-MM-DD HH:MM", como a Crítica.
  Meses: --ate (padrão: o mês local do "gerado" do agora.json, ou de agora) e os 11 anteriores (--de troca).
  Corte: o CSV vai até o início da janela de agora.json (gerado − janela_h); sem agora.json, até agora − 84 h. --corte
  troca. Do corte ao "gerado", entram os focos do agora.json (nas contagens de resumo.json e nos pontos de al/), só dos
  mesmos sensores (o GOES repete o mesmo fogo a cada 10 min e inflaria a contagem). Foco que o satélite entrega atrasado
  (VIIRS, até ~4 h) com hora anterior ao "gerado" só entra na rodada seguinte.

Incêndios da Crítica
  Ocorrências com competência no período e subcausa INCÊNDIO (HO; causa CAUSADA POR TERCEIROS) ou de texto livre já
  revisadas uma a uma (TEXTO_REVISADO, marcadas "texto"). Uma por alimentador, como a NAE do site; o trecho sai do ativo
  com as regras do site (scripts/atualiza_critica.py, Cadastro.associa). Sem dado pessoal: sem UC, sem nome e sem o
  texto livre (dele só se usa o número da ocorrência revisada). --candidatos lista o texto livre que fala de fogo e
  ainda não foi revisado (só na tela, para revisar e pôr em TEXTO_REVISADO).

Tamanho: se al/ passar de --max-mb (15), os pontos de al/<AL>.json ficam só até 1 km (as contagens até 5 km continuam
em resumo.json) e o resumo diz isso em "pontos_ate"; nesse modo uma rodada seguinte sem os arquivos de todos os meses
perde as contagens de 1 a 5 km dos meses guardados (avisa na saída).
Precisa de numpy e shapely 2 (com --critica, também de dados/trafos_gis.json no site).
"""
import argparse
import csv
import datetime as dt
import glob
import io
import json
import math
import os
import re
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request
from collections import Counter, OrderedDict, defaultdict
from pathlib import Path

import numpy as np
import shapely

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from alimentador import critica  # noqa: E402

csv.field_size_limit(10 ** 7)

# satélite do arquivo → nome usado na tela (o mesmo de agora.json); o que não está aqui não entra no histórico
SAT_INPE = {'NOAA-20': 'NOAA-20', 'NOAA-21': 'NOAA-21', 'AQUA_M-T': 'AQUA', 'AQUA_M-M': 'AQUA',
            'TERRA_M-T': 'TERRA', 'TERRA_M-M': 'TERRA'}
SAT_FIRMS = {'N20': 'NOAA-20', 'N21': 'NOAA-21', 'Aqua': 'AQUA', 'Terra': 'TERRA', 'A': 'AQUA', 'T': 'TERRA'}
SENSORES = ('NOAA-20', 'NOAA-21', 'AQUA', 'TERRA')
SOB_M = {'NOAA-20': 200, 'NOAA-21': 200, 'AQUA': 500, 'TERRA': 500, 'GOES-19': 1000}   # o pixel cobre a rede
FAIXAS = {'sob': 'Sob a rede: o pixel do satélite cobre a rede (até 200 m no VIIRS, 500 m no MODIS, 1 km no GOES)',
          '1km': 'Até 1 km da rede', '5km': 'De 1 a 5 km da rede'}
LIM_M = 5000                  # mais longe da rede que isso: fora
FUSO = dt.timedelta(hours=-3)  # Tocantins, sem horário de verão
JANELA_AGORA_H = 84
DIAS = 35                     # contagem por dia: os últimos 35 dias
KX, KY = 111320, 110574       # m por grau de longitude no equador e de latitude (a mesma conta de scripts/focos.py)
LON0 = -48.3                  # meridiano central da projeção usada só para achar o vão candidato
INPE_MENSAL = 'https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/mensal/Brasil/focos_mensal_br_{}.csv'
FOLGA_GRAU = 0.1              # caixa da rede + 0,1 grau (> 5 km) no recorte do CSV mensal
UA = 'ARGOS-focos/1.0 (dados publicos de focos de calor)'
DUP_M = 10                    # mesma detecção repetida: mesmo satélite e minuto a até 10 m
MARGEM_ATRASO_H = 12          # o agora.json entra no resumo e em al/ só até "gerado" − 12 h: um foco VIIRS/MODIS que o
                              # satélite entrega atrasado (até ~4 h) tem hora depois desse corte e a tela o soma do
                              # agora.json atual (sem a margem, ficava fora até a rodada do dia seguinte)
MES_ARQ = re.compile(r'focos_mensal_[a-z]+_(\d{4})(\d{2})', re.I)

# Texto livre lido um a um no levantamento de 16/11/2026 (Crítica abr–nov/2026; jan–mar sem nenhum): queimada ou
# incêndio em vegetação perto da rede, ou condutor rompido com incêndio. Número da ocorrência (NUM_SEQ_OPER_INIC_HDE).
TEXTO_REVISADO = {
    '20264809355023', '20264863402091', '20265020591807', '20264834002298', '20264906861492', '20264837464305',
    '20264930763227', '20264854016505', '20264915131385', '20264793393472', '20265027437793',   # queimada perto da rede
    '20264767432759', '20265009553271', '20264674081019', '20264902475765', '20264878284161',   # rompido + incêndio
}
EXTRA_CRITICA = ('COD_SUB_CAUSA_INTER_SCR', 'COD_CAUSA_INTER_CAU')
# candidatos no texto livre (só para --candidatos): fogo em vegetação, não "conexão queimada", "trafo queimado"...
TXT_FOGO = re.compile(r'\bINCENDI\w*|\bFOGO\s+(N[AO]S?|EM|DE)\s+(VEGETA|MATO|PASTO|CAPIM|FAIXA|ROCA|CERRADO|AREA|FAZENDA|'
                      r'LOTE|TERRENO|CANAVIAL|PALHA|LIXO|BAIXADA|CHACARA|BREJO|ARVORE|MATA|SERRA)|\bQUEIMANDO\b'
                      r'|\b(DEVIDO|POR|CAUSA)\s+(A\s+)?QUEIMADA|\bQUEIMADAS?\s+(NO|NA|AO|PROXIM\w*|EMBAIXO|SOB|DEBAIXO)\s+'
                      r'(LOCAL|REGIAO|AREA|VEGETA\w*|MATO|PASTO|FAIXA|ROCA|FAZENDA|BEIRA)')
SIGLAS = re.compile(r'\b(at|bt|mt|rd|rdu|rdr|dj|uc)\b', re.I)       # siglas da Crítica que voltam em maiúscula


def sem_acento(x):
    return unicodedata.normalize('NFKD', x or '').encode('ascii', 'ignore').decode().upper().strip()


def utc(s):
    """'AAAA-MM-DDTHH:MMZ' → datetime UTC (sem fuso)."""
    return dt.datetime.strptime(s.rstrip('Z')[:16], '%Y-%m-%dT%H:%M')


def agora_utc():
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None, second=0, microsecond=0)


def iso(t):
    return t.strftime('%Y-%m-%dT%H:%MZ')


def local(t):
    return (t + FUSO).strftime('%Y-%m-%d %H:%M')


def de_local(s):
    """'AAAA-MM-DD HH:MM' (hora local) → datetime UTC."""
    return dt.datetime.strptime(s[:16], '%Y-%m-%d %H:%M') - FUSO


def mes_mais(mes, n):
    a, m = divmod(int(mes[:4]) * 12 + int(mes[5:7]) - 1 + n, 12)
    return f'{a:04d}-{m + 1:02d}'


def meses_entre(de, ate):
    out = []
    while de <= ate:
        out.append(de)
        de = mes_mais(de, 1)
    return out


def inicio_mes(m):
    """00:00 do dia 1 do mês 'AAAA-MM' (sem fuso)."""
    return dt.datetime(int(m[:4]), int(m[5:7]), 1)


def mes_do_arquivo(f):
    m = re.search(r'(\d{2})-(\d{4})', Path(f).name)
    return f'{m.group(2)}-{m.group(1)}' if m else None


# ------------------------------------------------------------------------------------------------------------- rede

def le_cadastro(site):
    """Só o que a Rede usa de dados/alimentadores/*.json (nomes dos trechos e vãos): não precisa dos trafos."""
    cs = {}
    for f in sorted((site / 'dados' / 'alimentadores').glob('*.json')):
        d = json.loads(f.read_text(encoding='utf-8'))
        cs[f.stem] = {'trechos': [{'nome': t.get('nome')} for t in d.get('trechos', [])], 'vaos': d.get('vaos', [])}
    return cs


class Rede:
    """Todos os vãos de média tensão do site, com alimentador, trecho e município; acha o vão mais próximo de pontos."""

    def __init__(self, cs):
        segs, al, tr, mun = [], [], [], []
        self.als = sorted(cs)
        for ia, a in enumerate(self.als):
            ts = cs[a]['trechos']
            for v in cs[a]['vaos']:
                segs.append(v[:4])
                al.append(ia)
                tr.append(ts[v[4]]['nome'] if v[4] is not None and v[4] < len(ts) else None)
                mun.append(v[8] if len(v) > 8 else None)
        self.seg = np.asarray(segs, dtype=float)
        self.al, self.tr, self.mun = np.asarray(al), tr, mun
        x1, y1 = self._proj(self.seg[:, 0], self.seg[:, 1])
        x2, y2 = self._proj(self.seg[:, 2], self.seg[:, 3])
        self.arvore = shapely.STRtree(shapely.linestrings(np.stack([np.stack([x1, y1], 1), np.stack([x2, y2], 1)], 1)))

    def caixa(self, folga=FOLGA_GRAU):
        """(lat_min, lat_max, lon_min, lon_max) da rede com folga em grau."""
        lon, lat = self.seg[:, [0, 2]], self.seg[:, [1, 3]]
        return (float(lat.min()) - folga, float(lat.max()) + folga, float(lon.min()) - folga, float(lon.max()) + folga)

    @staticmethod
    def _proj(lon, lat):
        """Senoidal em volta de LON0: erro < 1% na área da rede; só escolhe o vão (a distância é refeita no plano local)."""
        return (np.asarray(lon) - LON0) * KX * np.cos(np.radians(lat)), np.asarray(lat) * KY

    def perto(self, lat, lon, lim=LIM_M):
        """(índice do vão, distância em m) do vão mais próximo de cada ponto, até lim (−1 e inf além disso)."""
        lat, lon = np.asarray(lat, dtype=float), np.asarray(lon, dtype=float)
        n = len(lat)
        iv, dist = np.full(n, -1), np.full(n, np.inf)
        if not n:
            return iv, dist
        x, y = self._proj(lon, lat)
        pts = shapely.points(x, y)
        (ip, _), dp = self.arvore.query_nearest(pts, max_distance=lim * 1.03 + 50, return_distance=True,
                                                all_matches=False)
        if not len(ip):
            return iv, dist
        # a projeção erra até ~1%: todos os vãos até 2% + 25 m do mais próximo projetado, e o menor no plano local
        j, ig = self.arvore.query(pts[ip], predicate='dwithin', distance=dp * 1.02 + 25)
        ip = ip[j]
        s = self.seg[ig]
        kx = KX * np.cos(np.radians(lat[ip]))                        # plano local do ponto, em metros
        ax, ay = (s[:, 0] - lon[ip]) * kx, (s[:, 1] - lat[ip]) * KY
        bx, by = (s[:, 2] - lon[ip]) * kx, (s[:, 3] - lat[ip]) * KY
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        f = np.where(l2 > 0, np.clip(-(ax * dx + ay * dy) / np.where(l2 > 0, l2, 1), 0, 1), 0)
        d = np.hypot(ax + f * dx, ay + f * dy)
        o = np.lexsort((ig, d, ip))                     # por ponto, o menor (empate: o vão de menor índice)
        um = np.r_[True, ip[o][1:] != ip[o][:-1]]
        iv[ip[o][um]], dist[ip[o][um]] = ig[o][um], d[o][um]
        fora = dist > lim
        iv[fora], dist[fora] = -1, np.inf
        return iv, dist


# ------------------------------------------------------------------------------------------------------------ focos

def baixa_mensal(mes, pasta, caixa, tentativas=4):
    """CSV mensal do INPE (mês UTC 'AAAA-MM') recortado: só os sensores do histórico dentro da caixa da rede.

    Grava <pasta>/focos_mensal_br_AAAAMM.csv e devolve o caminho; None se o INPE ainda não publicou o mês (404)."""
    url = INPE_MENSAL.format(mes.replace('-', ''))
    destino = Path(pasta) / Path(url).name
    tmp = destino.with_suffix('.tmp')
    erro = None
    for k in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=120) as r, \
                    open(tmp, 'w', encoding='utf-8', newline='') as out:
                rd = csv.reader(io.TextIOWrapper(r, encoding='utf-8', errors='replace', newline=''))
                cab = [c.strip() for c in next(rd)]
                ila, ilo, isa = cab.index('lat'), cab.index('lon'), cab.index('satelite')
                w = csv.writer(out)
                w.writerow(cab)
                for row in rd:          # arquivo cortado no meio: o http.client levanta IncompleteRead
                    try:
                        if row[isa].strip() in SAT_INPE and caixa[0] <= float(row[ila]) <= caixa[1] \
                                and caixa[2] <= float(row[ilo]) <= caixa[3]:
                            w.writerow(row)
                    except (IndexError, ValueError):
                        continue
            os.replace(tmp, destino)
            return destino
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            erro = e
        except Exception as e:  # rede: tenta de novo
            erro = e
        if k < tentativas - 1:
            time.sleep(5 + 10 * k)
    raise RuntimeError(f'{url}: {erro}')


def cobertura_nome(arq):
    """(início, fim) em UTC do período que o arquivo cobre pelo nome (focos_mensal_*_AAAAMM), ou None."""
    m = MES_ARQ.search(Path(arq).name)
    if not m:
        return None
    mes = f'{m.group(1)}-{m.group(2)}'
    return inicio_mes(mes), inicio_mes(mes_mais(mes, 1))


def le_focos(arqs, ini, fim):
    """Focos dos sensores do FIRMS entre ini e fim (UTC): [(t UTC, satélite, lat, lon, arquivo)], a contagem por
    etapa e o período de cada arquivo {nome: (início, fim, foco mais novo)} em UTC."""
    out, cont, cob = [], Counter(), {}
    for arq in arqs:
        nome = Path(arq).name
        t_min = t_max = None
        with open(arq, encoding='utf-8', newline='') as fh:
            r = csv.DictReader(fh)
            inpe = 'data_hora_gmt' in (r.fieldnames or [])
            for row in r:
                try:
                    if inpe:
                        sat = SAT_INPE.get(row['satelite'].strip())
                        t = dt.datetime.strptime(row['data_hora_gmt'].strip()[:16], '%Y-%m-%d %H:%M')
                        la, lo = float(row['lat']), float(row['lon'])
                    else:
                        sat = SAT_FIRMS.get(row['satellite'].strip())
                        t = dt.datetime.strptime(row['acq_date'] + row['acq_time'].zfill(4), '%Y-%m-%d%H%M')
                        la, lo = float(row['latitude']), float(row['longitude'])
                except (KeyError, ValueError, AttributeError):
                    cont['ilegível'] += 1
                    continue
                cont['lidos'] += 1
                t_min = t if t_min is None or t < t_min else t_min
                t_max = t if t_max is None or t > t_max else t_max
                if sat is None:
                    cont['outro satélite'] += 1
                    continue
                if not ini <= t < fim:
                    cont['fora do período'] += 1
                    continue
                out.append((t, sat, la, lo, nome))
        c = cobertura_nome(arq) or ((t_min, t_max + dt.timedelta(minutes=1)) if t_min else None)
        if c:
            cob[nome] = (c[0], c[1], t_max)
    return out, cont, cob


def metros(la1, lo1, la2, lo2):
    return math.hypot((la2 - la1) * KY, (lo2 - lo1) * KX * math.cos(math.radians((la1 + la2) / 2)))


def sem_duplicados(focos):
    """Mesma detecção em mais de uma linha (mesmo satélite e minuto, a até DUP_M): fica a primeira em ordem.

    Grade de 2 × DUP_M (em grau de latitude, menor que o grau de longitude): o vizinho a até DUP_M está numa das 9
    células em volta, sem depender de arredondamento (duas linhas a 1 m podem cair em lados diferentes de um corte)."""
    c = 2 * DUP_M / KY
    grade, out = defaultdict(list), []
    for f in sorted(focos):
        t, sat, la, lo = f[0], f[1], f[2], f[3]
        gy, gx = math.floor(la / c), math.floor(lo / c)
        if any(metros(la, lo, a, b) <= DUP_M for dy in (-1, 0, 1) for dx in (-1, 0, 1)
               for a, b in grade.get((sat, t, gy + dy, gx + dx), ())):
            continue
        grade[(sat, t, gy, gx)].append((la, lo))
        out.append(f)
    return out, len(focos) - len(out)


def faixa(sat, d):
    return 'sob' if d <= SOB_M.get(sat, 200) else '1km' if d <= 1000 else '5km'


# -------------------------------------------------------------------------------------------------------- incêndios

def le_critica(arqs, texto=False):
    """Linhas da Crítica por alimentador, com causa e subcausa (e o texto livre só com texto=True, para --candidatos)."""
    original = critica.CAMPOS
    critica.CAMPOS = tuple(dict.fromkeys(original + EXTRA_CRITICA + (('OBSERVACAO',) if texto else ())))
    try:
        return critica.ler(arqs)
    finally:
        critica.CAMPOS = original


def grupos_ocorrencia(ls):
    g = OrderedDict()
    for d in ls:
        g.setdefault((d['NUM_SEQ_OPER_INIC_HDE'].strip(), d['DTA_CMPT_HDE'].strip()), []).append(d)
    return g


def e_ho(ps):
    return any(d['COD_SUB_CAUSA_INTER_SCR'].strip() == 'HO' or 'INCENDIO' in sem_acento(d['DES_SUB_CAUSA_INTER_SCR'])
               for d in ps)


def mes_cmpt(cmpt):            # 'dd/mm/aa' → 'aaaa-mm'
    return f'20{cmpt[6:8]}-{cmpt[3:5]}'


def ultima_abertura(linhas):
    """Abertura mais nova dos arquivos lidos ('AAAA-MM-DD HH:MM'): até onde a Crítica vai."""
    return max((critica._data(d['DTA_ABERT']) for ls in linhas.values() for d in ls), default=None)


def candidatos(linhas, meses):
    """Texto livre que fala de fogo, sem subcausa HO e fora de TEXTO_REVISADO (para revisar; não grava nada)."""
    vistos = set()
    for al, ls in sorted(linhas.items()):
        for (seq, cmpt), ps in grupos_ocorrencia(ls).items():
            if mes_cmpt(cmpt) not in meses or seq in TEXTO_REVISADO or e_ho(ps) or seq in vistos:
                continue
            for o in {d['OBSERVACAO'].strip() for d in ps if d.get('OBSERVACAO', '').strip()}:
                u = sem_acento(o)
                m = TXT_FOGO.search(u)
                if m:
                    vistos.add(seq)
                    p = ps[0]
                    print(f"{seq} {mes_cmpt(cmpt)} {al} {p['DES_CAUSA_INTER_CAU'].strip()} / "
                          f"{p['DES_SUB_CAUSA_INTER_SCR'].strip()}: …{u[max(0, m.start() - 80):m.end() + 80]}…")
                    break
    print(f'{len(vistos)} candidato(s) pelo texto ainda não revisado(s)')


def causa_registrada(o):
    """'Condutor de AT / partido na fase': causa e subcausa da Crítica (campos de lista, não o texto livre)."""
    c = f"{o['causa']} / {o['sub'].lower()}"[:80]
    return SIGLAS.sub(lambda m: m.group(1).upper(), c)


def incendios(cad, rede, linhas, meses):
    """{AL: [[abertura, ativo, trecho, cons, dur, 'HO'|'texto', causa, município, mês, lat, lon], ...]} e totais."""
    import atualiza_critica as ac
    por_al, tot = {}, Counter()
    unicas = {'HO': set(), 'texto': set()}
    todas = {}                          # ponto de qualquer chave do cadastro ('hoje no X': o ativo está no KML do X)
    for c in cad.cs.values():
        todas.update({p[0]: [p[1], p[2]] for p in c.get('chaves_sem_topologia') or [] if p[1] is not None})
    for c in cad.cs.values():
        todas.update({ch['nome']: ch['lonlat'] for ch in c['chaves']})
    for al, ls in sorted(linhas.items()):
        achadas = []
        for (seq, cmpt), ps in grupos_ocorrencia(ls).items():
            if mes_cmpt(cmpt) not in meses:
                continue
            ho = e_ho(ps)
            if not ho and seq not in TEXTO_REVISADO:
                continue
            o = critica.ocorrencias(ps)[0]
            if o['inter_tipo'] == 'UC':                      # número do consumidor nunca sai
                o['inter'] = ''
            achadas.append((seq, ho, o))
            unicas['HO' if ho else 'texto'].add((seq, cmpt))
        if not achadas:
            continue
        if al not in cad.cs:
            tot['alimentador fora do cadastro do site'] += len(achadas)
            continue
        fmt = cad.associa(al, [ac.no_formato(o) for _, _, o in achadas])
        c = cad.cs[al]
        chave = {p[0]: [p[1], p[2]] for p in c.get('chaves_sem_topologia') or [] if p[1] is not None}
        chave.update({ch['nome']: ch['lonlat'] for ch in c['chaves']})
        dj = next((ch['lonlat'] for ch in c['chaves'] if ch.get('tipo') == 'DJ'), None)
        trechos = {t['nome']: t for t in c['trechos']}
        out = []
        for (seq, ho, o), f in zip(achadas, fmt):
            at = f.get('ativo') or ''
            tr = f.get('trecho')
            ll = chave.get(at) or (list(cad.trafos[at][:2]) if at in cad.trafos else None) \
                or (dj if f['abr'] in ('DJ', 'SE') else None) or todas.get(at)     # SE: o DJ, na subestação
            if ll is None and tr in trechos:                  # ativo sem ponto: o início do trecho
                ll = (trechos[tr].get('inicio') or {}).get('lonlat')
                tot['ponto no início do trecho'] += 1
            if ll is None:
                tot[f"sem ponto: {re.sub(r'hoje no .*', 'hoje no X', f.get('fora') or f.get('regra') or '?')}"] += 1
            mun = None
            if ll and tr:
                iv, _ = rede.perto([ll[1]], [ll[0]], lim=2000)
                mun = rede.mun[iv[0]] if iv[0] >= 0 else None
            if mun is None and tr in trechos and trechos[tr].get('municipios'):
                mun = max(trechos[tr]['municipios'].items(), key=lambda x: x[1])[0]
            if mun is None and c.get('municipios'):
                mun = max(c['municipios'], key=lambda x: x['m'])['cod']
            out.append([o['abert'], at, tr, o['cons'], o['dur'], 'HO' if ho else 'texto',
                        '' if ho else causa_registrada(o), mun or '', o['mes'],
                        round(ll[1], 6) if ll else None, round(ll[0], 6) if ll else None])
            tot['HO' if ho else 'texto'] += 1
            tot['com trecho' if tr else 'sem trecho'] += 1
            tot['com ponto' if ll else 'sem ponto'] += 1
        por_al[al] = sorted(out, key=lambda x: (x[0], x[1] or ''))
    tot['únicas HO'] = len(unicas['HO'])
    tot['únicas texto'] = len(unicas['texto'])
    return por_al, tot


# ------------------------------------------------------------------------------------------------------------ saída

def corte_padrao(agora_arq):
    if agora_arq.exists():
        a = json.loads(agora_arq.read_text(encoding='utf-8'))
        return utc(a['gerado']) - dt.timedelta(hours=a.get('janela_h', JANELA_AGORA_H)), a
    return agora_utc() - dt.timedelta(hours=JANELA_AGORA_H), None


def le_anterior(saida):
    """O que já está gravado: (resumo ou None, {AL: focos}, {AL: incêndios})."""
    res = saida / 'resumo.json'
    if not res.exists():
        return None, {}, {}
    resumo = json.loads(res.read_text(encoding='utf-8'))
    pontos, inc = {}, {}
    for f in sorted((saida / 'al').glob('*.json')):
        d = json.loads(f.read_text(encoding='utf-8'))
        al = d.get('al') or f.stem
        pontos[al] = d.get('focos') or []
        inc[al] = [x for x in d.get('incendios') or [] if len(x) == 11]     # formato antigo (sem o mês): não serve
    return resumo, pontos, inc


def grava(caminho, obj):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    s = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    tmp = caminho.with_suffix('.tmp')
    tmp.write_text(s, encoding='utf-8')
    os.replace(tmp, caminho)
    return len(s.encode('utf-8'))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--site', required=True, help='pasta do site (teste/)')
    ap.add_argument('--focos', action='append', default=[], help='CSV de focos do INPE ou do FIRMS (aceita padrão; repetir)')
    ap.add_argument('--critica', action='append', default=[], help='Critica*_MM-AAAA.txt (aceita padrão; repetir)')
    ap.add_argument('--de', help='primeiro mês (AAAA-MM; padrão: 11 meses antes de --ate)')
    ap.add_argument('--ate', help='último mês (AAAA-MM; padrão: o mês local do agora.json, ou de agora)')
    ap.add_argument('--corte', help='fim do histórico, AAAA-MM-DDTHH:MMZ (padrão: início da janela de agora.json)')
    ap.add_argument('--max-mb', type=float, default=15.0, help='acima disso, pontos só até 1 km')
    ap.add_argument('--refaz', action='store_true', help='ignora o que já está gravado em dados/focos/')
    ap.add_argument('--candidatos', action='store_true', help='lista o texto livre de fogo ainda não revisado e sai')
    ap.add_argument('--atualiza-inpe', '--baixa-inpe', action='store_true',
                    help='rotina diária: baixa sozinho o CSV mensal do INPE dos meses desde o fim do histórico gravado'
                         ' (sem --focos) e mantém o resto, incêndios inclusive')
    ap.add_argument('--cache', help='com --atualiza-inpe: pasta para guardar os CSV mensais recortados')
    a = ap.parse_args(argv)
    site = Path(a.site)
    saida = site / 'dados' / 'focos'
    corte, agora = corte_padrao(saida / 'agora.json')
    if a.corte:
        corte = utc(a.corte)
    ref = utc(agora['gerado']) if agora else agora_utc()        # "hoje" das contagens por dia e do último mês
    ate = a.ate or local(ref)[:7]
    meses = meses_entre(a.de or mes_mais(ate, -11), ate)
    arqs_c = sorted({f for p in a.critica for f in glob.glob(p)}, key=lambda f: (mes_do_arquivo(f) or '', f))
    if a.candidatos:
        candidatos(le_critica(arqs_c, texto=True), set(meses))
        return 0
    ini = inicio_mes(meses[0]) - FUSO                                   # 00:00 local do 1º mês, em UTC
    fim = min(corte, inicio_mes(mes_mais(meses[-1], 1)) - FUSO)
    print(f'meses {meses[0]} a {meses[-1]}; focos de {local(ini)} a {local(fim)} (hora local); corte {iso(corte)}'
          + (f' (agora.json de {agora["gerado"]}, janela {agora.get("janela_h")} h)' if agora else ''))

    antes, pontos_antes, inc_antes = (None, {}, {}) if a.refaz else le_anterior(saida)
    if antes and antes.get('pontos_ate') == '1km':
        print('aviso: os pontos gravados vão só até 1 km; as contagens de 1 a 5 km dos meses que não vêm nos '
              'arquivos desta rodada ficam sem eles', file=sys.stderr)

    if arqs_c:
        import atualiza_critica as ac
        cad = ac.Cadastro(site)
        cs = cad.cs
    else:
        cad, cs = None, le_cadastro(site)
    rede = Rede(cs)
    print(f'rede: {len(rede.als)} alimentadores, {len(rede.seg)} vãos')

    # ---- focos: arquivos desta rodada (passados ou baixados)
    arqs_f = sorted({f for p in a.focos for f in glob.glob(p)})
    tmpdir = None
    if a.atualiza_inpe and not a.focos:
        desde = ini
        if antes:
            ultimo = ((antes.get('fontes') or {}).get('focos') or {}).get('ultimo_utc')
            desde = max(ini, min(utc(antes['historico_ate']), utc(ultimo) if ultimo else corte))
        meses_utc = meses_entre(desde.strftime('%Y-%m'), (fim - dt.timedelta(minutes=1)).strftime('%Y-%m'))
        if not a.cache:
            tmpdir = tempfile.TemporaryDirectory(prefix='focos-mensal-')
        pasta = Path(a.cache or tmpdir.name)
        pasta.mkdir(parents=True, exist_ok=True)
        for m in meses_utc:
            p = baixa_mensal(m, pasta, rede.caixa())
            print(f'  INPE {m}: ' + (f'{p.name}, {p.stat().st_size / 1e6:.1f} MB recortado' if p else 'ainda não publicado'))
            if p:
                arqs_f.append(str(p))
    if not arqs_f and not pontos_antes and not inc_antes and not arqs_c:
        raise SystemExit(f'nenhum CSV de focos em {a.focos} e nada gravado em {saida}')
    brutos, cont, cob = le_focos(arqs_f, ini, fim)

    # ---- focos já gravados fora do período dos arquivos desta rodada
    guardados = []
    for al, ps in pontos_antes.items():
        for p in ps:
            t = de_local(p[2])
            if ini <= t < fim and p[3] in SENSORES and not any(c0 <= t < c1 for c0, c1, _ in cob.values()):
                guardados.append((t, p[3], p[0], p[1], ''))
    cont['gravados mantidos'] = len(guardados)

    focos, dup = sem_duplicados(brutos + guardados)
    iv, dist = rede.perto([f[2] for f in focos], [f[3] for f in focos])
    cont['duplicados'] = dup
    im = {m: i for i, m in enumerate(meses)}
    d0 = dt.datetime.strptime(local(ref)[:10], '%Y-%m-%d')
    dias = [(d0 - dt.timedelta(days=DIAS - 1 - k)).strftime('%Y-%m-%d') for k in range(DIAS)]
    idia = {d: i for i, d in enumerate(dias)}
    pontos = defaultdict(list)          # AL → focos
    contagem = {k: defaultdict(lambda: defaultdict(lambda: [0] * len(meses))) for k in ('al', 'mun')}
    por_dia = {k: defaultdict(lambda: defaultdict(lambda: [0] * DIAS)) for k in ('al', 'mun')}

    def conta(al, mun, fx, tl):
        if tl[:7] in im:
            contagem['al'][al][fx][im[tl[:7]]] += 1
            if mun:
                contagem['mun'][mun][fx][im[tl[:7]]] += 1
        if tl[:10] in idia:
            por_dia['al'][al][fx][idia[tl[:10]]] += 1
            if mun:
                por_dia['mun'][mun][fx][idia[tl[:10]]] += 1

    por_mes = defaultdict(Counter)
    for (t, sat, la, lo, arq), i, d in zip(focos, iv, dist):
        tl = local(t)
        if arq:
            por_mes[tl[:7]]['no período'] += 1
            por_mes[tl[:7]][sat] += 1
        if i < 0:
            continue
        al, tr, mun, fx = rede.als[rede.al[i]], rede.tr[i], rede.mun[i], faixa(sat, d)
        pontos[al].append([round(la, 5), round(lo, 5), tl, sat, int(round(d)), tr, fx, mun or ''])
        conta(al, mun, fx, tl)
        por_mes[tl[:7]]['até 5 km'] += 1
        por_mes[tl[:7]][fx] += 1
    cont['até 5 km da rede'] = sum(len(v) for v in pontos.values())

    # ---- agora.json do corte ao "gerado": nas contagens e nos pontos de al/ (a tela soma por cima só o que vier depois)
    n_agora, agora_fora = Counter(), Counter()
    pontos_ate_t = corte
    if agora:
        pontos_ate_t = max(corte, utc(agora['gerado']) - dt.timedelta(hours=MARGEM_ATRASO_H))
        for f in agora.get('focos') or []:
            t = utc(f[2])
            if t < corte or t > pontos_ate_t or f[8] not in FAIXAS:
                continue
            if f[3] not in SENSORES:
                agora_fora[f[3]] += 1
                continue
            tl = local(t)
            conta(f[6], f[10], f[8], tl)
            n_agora[f[8]] += 1
            pontos[f[6]].append([round(float(f[0]), 5), round(float(f[1]), 5), tl, f[3], int(round(float(f[5]))),
                                 f[7] or None, f[8], f[10] or ''])

    # ---- incêndios: os já gravados e, com --critica, os meses dos arquivos trocados
    trocados = {mes_do_arquivo(f) for f in arqs_c} & set(meses)
    novos, tot_inc, ult_crit = {}, Counter(), None
    if arqs_c:
        linhas = le_critica(arqs_c)
        ult_crit = ultima_abertura(linhas)
        novos, tot_inc = incendios(cad, rede, linhas, trocados)
    inc = {}
    for al in sorted(set(inc_antes) | set(novos)):
        ls = [x for x in inc_antes.get(al, []) if x[8] in im and x[8] not in trocados] + novos.get(al, [])
        if ls:
            inc[al] = sorted(ls, key=lambda x: (x[0], x[1] or ''))
    for al, ls in inc.items():
        for x in ls:
            contagem['al'][al]['inc'][im[x[8]]] += 1
            if x[7]:
                contagem['mun'][x[7]]['inc'][im[x[8]]] += 1
    crit_antes = ((antes or {}).get('fontes') or {}).get('critica') or {}
    meses_crit = sorted((set(crit_antes.get('meses') or []) | trocados) & set(meses))
    if (crit_antes.get('ultima_abertura') or '') > (ult_crit or ''):
        ult_crit = crit_antes['ultima_abertura']

    # ---- gravação
    pasta_al = saida / 'al'
    pasta_al.mkdir(parents=True, exist_ok=True)

    def grava_al(ate_1km):
        tam, nomes = 0, set()
        for al in sorted(set(pontos) | set(inc)):
            fs = sorted((p for p in pontos.get(al, []) if not ate_1km or p[6] != '5km'), key=lambda p: (p[2], p[0], p[1]))
            ins = inc.get(al, [])
            if fs or ins:
                tam += grava(pasta_al / f'{al}.json', {'al': al, 'hora': 'local (UTC-3)',
                                                       'historico_ate': iso(pontos_ate_t), 'csv_ate': iso(corte),
                                                       'focos': fs, 'incendios': ins})
                nomes.add(f'{al}.json')
        for f in pasta_al.glob('*.json'):            # alimentador que ficou sem nada
            if f.name not in nomes:
                f.unlink()
        return tam

    tam_al = grava_al(False)
    pontos_ate = '5km'
    if tam_al > a.max_mb * 1e6:
        tam_al = grava_al(True)
        pontos_ate = '1km'

    def bloco(d, chaves=('sob', '1km', '5km', 'inc'), n=len(meses)):
        return {k: d[k] if k in d else [0] * n for k in chaves}

    def dias_de(c):
        return {k: bloco(v, ('sob', '1km', '5km'), DIAS) for k, v in sorted(c.items())
                if any(any(x) for x in v.values())}

    focos_antes = ((antes or {}).get('fontes') or {}).get('focos') or {}
    meses_cob = {cobertura_nome(n) for n in cob} - {None}
    arquivos = {n for n in focos_antes.get('arquivos') or []                 # mês trocado ou que saiu: fora
                if n not in cob and (not MES_ARQ.search(n) or (cobertura_nome(n)[1] > ini
                                                               and cobertura_nome(n) not in meses_cob))}
    arquivos = sorted(arquivos | set(cob))
    ultimos = [c[2] for c in cob.values() if c[2]]
    if focos_antes.get('ultimo_utc'):
        ultimos.append(utc(focos_antes['ultimo_utc']))
    mun_rede = {m for m in rede.mun if m}
    resumo = {
        'gerado': iso(agora_utc()),
        'meses': meses,
        'historico_ate': iso(corte),
        'agora_somado_ate': iso(pontos_ate_t) if agora else None,
        'hora': 'local (UTC-3); o mês e o dia saem da hora local',
        'faixas': FAIXAS,
        'faixas_exclusivas': True,
        'pontos_ate': pontos_ate,
        'fontes': {
            'focos': {'sensores': list(SENSORES),
                      'arquivos': arquivos,
                      'origem': 'INPE dados abertos (csv mensal; NOAA-20, NOAA-21, Aqua e Terra vêm do FIRMS NRT)'
                      if any(MES_ARQ.search(n) for n in arquivos) else 'FIRMS',
                      'primeiro': min((p[2] for ps in pontos.values() for p in ps), default=None),
                      'ultimo_utc': iso(max(ultimos)) if ultimos else None,
                      'duplicados': f'mesma detecção repetida: mesmo satélite e minuto a até {DUP_M} m',
                      'focos_ate_5km': cont['até 5 km da rede']},
            'critica': {'meses': meses_crit, 'ultima_abertura': ult_crit,
                        'incendios': {'HO': sum(x[5] == 'HO' for ls in inc.values() for x in ls),
                                      'texto': sum(x[5] == 'texto' for ls in inc.values() for x in ls)}},
            'agora': {'gerado': agora['gerado'], 'somado_ate': iso(pontos_ate_t), 'margem_atraso_h': MARGEM_ATRASO_H,
                      'focos_somados': sum(n_agora.values()),
                      'fora_do_resumo': dict(agora_fora)} if agora else None,
        },
        'al': {al: bloco(contagem['al'].get(al, {})) for al in sorted(set(rede.als) | set(contagem['al']))},
        'mun': {m: bloco(contagem['mun'].get(m, {})) for m in sorted(mun_rede | set(contagem['mun']))},
        'dias': dias,
        'al_dias': dias_de(por_dia['al']),
        'mun_dias': dias_de(por_dia['mun']),
    }
    tam_res = grava(saida / 'resumo.json', resumo)
    if tmpdir:
        tmpdir.cleanup()

    # ---- relatório
    print('\nfocos (sensores do FIRMS):', dict(cont))
    for n, (c0, c1, u) in sorted(cob.items()):
        print(f'  {n}: cobre {iso(c0)} a {iso(c1)} (UTC); foco mais novo {iso(u) if u else "-"}')
    print('mês     | arquivos | NOAA-20 NOAA-21 AQUA TERRA | até 5 km |  sob  1km  5km   (até 5 km: com os gravados)')
    for m in meses:
        c = por_mes[m]
        print(f"{m} | {c['no período']:8d} | {c['NOAA-20']:7d} {c['NOAA-21']:7d} {c['AQUA']:4d} {c['TERRA']:5d} | "
              f"{c['até 5 km']:8d} | {c['sob']:4d} {c['1km']:4d} {c['5km']:4d}")
    print('agora.json somado no resumo (depois do corte):', dict(n_agora) or 'nada', '· outros sensores, fora:',
          dict(agora_fora) or 'nenhum')
    if arqs_c:
        print('incêndios da Crítica desta rodada (por alimentador):', dict(tot_inc))
    inc_mes = Counter((x[8], x[5]) for ls in inc.values() for x in ls)
    print('incêndios gravados por mês (HO+texto):',
          ', '.join(f'{m} {inc_mes[(m, "HO")]}+{inc_mes[(m, "texto")]}' for m in meses
                    if inc_mes[(m, 'HO')] or inc_mes[(m, 'texto')]) or 'nenhum',
          f'; Crítica {", ".join(meses_crit) or "nenhum mês"}, última abertura {ult_crit}')
    print(f'pontos em al/: do CSV até {iso(corte)} e do agora.json até {iso(pontos_ate_t)}')
    print(f'alimentadores com foco até 5 km: {len(pontos)}; com incêndio: {len(inc)}; arquivos al/: '
          f'{len(list(pasta_al.glob("*.json")))}; por dia ({dias[0]} a {dias[-1]}): '
          f'{len(resumo["al_dias"])} alimentadores, {len(resumo["mun_dias"])} municípios')
    print(f'tamanho: resumo.json {tam_res / 1e6:.2f} MB; al/ {tam_al / 1e6:.2f} MB (pontos até {pontos_ate})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
