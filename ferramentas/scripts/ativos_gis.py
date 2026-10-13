"""Transformadores do GIS no site: trecho de cada um e as NAE deles que estavam sem trecho.

python scripts/ativos_gis.py <pasta do site> <pasta com os Transformadores.kmz do acervo GIS> [--relatorio arq.json]

A rede do site continua a mesma (GIS, KMZ_GOOGLE_EARTH2). A conversão dela não traz os transformadores, então toda NAE de
transformador ficava "ativo fora do KML". Aqui entram os pontos da camada Transformadores do próprio GIS (acervo por
alimentador, um Transformadores.kmz por pasta; a pasta é lida inteira, recursiva):
  - cada transformador vai para o vão mais próximo da rede do alimentador do site, até LIM_M; mais longe que isso
    não entra em trecho (rede incompleta na fonte ou ponto errado) e fica registrado com a distância;
  - dados/alimentadores/<AL>.json → 'ativos_kml': [[nome, 'TR', lon, lat, trecho ou None, distância em m, vão], ...]
    com os transformadores que o GIS põe nesse alimentador e os das NAE dele;
  - NAE 'ativo fora do KML' cujo ativo é um desses transformadores, até LIM_M da rede do alimentador da NAE: trecho,
    regra 'vão mais próximo do ativo (GIS)' e dist_m, no JSON e no alimentadores/<AL>/dados.js. Se o GIS põe o
    transformador em outro alimentador e ele está longe desta rede, a NAE continua sem trecho com fora = 'hoje no X'.
O total de NAE de cada alimentador não muda (vem da Crítica); muda só o trecho.

Depois, NAE cujo ativo hoje está em outro alimentador (fora = 'hoje no X': chave remanejada, ou trafo que o GIS põe
no X): conta nas duas pontas. Fica no total do alimentador da Crítica (Y), sem trecho, com 'hoje': [X, trecho]; e
entra em 'nae.ext' do X, no trecho onde o ativo está hoje, com 'de': Y. Assim o bloco de NAE do trecho soma a NAE de
todos os ativos dele (a soma dos trechos pode passar do total do alimentador). 'nae.ext' é refeito a cada execução.
Grava também dados/trafos_gis.json (todos os transformadores do acervo com o alimentador do GIS): é o que a Crítica
nova usa para achar o trecho do trafo sem o acervo (scripts/atualiza_critica.py).
Depois rodar gera_trechos.py --so-interface (ranking, polos, busca de ativo) e planilha_trechos.py.
"""
import json
import math
import re
import sys
import zipfile
from pathlib import Path

LIM_M = 50           # transformador fica no poste da rede de média: mais longe que isso, a rede do site não tem o ramal
CELULA = 0.002       # ~220 m: grade para achar os vãos perto do ponto
REGRA = 'vão mais próximo do ativo (GIS)'
REGRA_EXT = 'ativo hoje neste alimentador'
E_TRAFO = lambda o: str(o.get('abr', '')).startswith('TR') or o.get('abr') == 'UC'   # NAE individual: o ativo é o trafo


def le_js(p):
    s = p.read_text(encoding='utf-8')
    i = s.index('{', s.index('='))                 # 'window.D = ' fica igual
    return s[:i], json.loads(s[i:].strip().rstrip(';'))


def num(s):
    return float(s.replace(',', '.'))


def transformadores(pasta):
    """{código: (lon, lat, alimentador no GIS)} de todos os Transformadores.kmz/.kml da pasta."""
    pts, rep = {}, 0
    for f in sorted(Path(pasta).rglob('*')):
        if f.suffix.lower() == '.kmz':
            with zipfile.ZipFile(f) as z:
                k = z.read(next(n for n in z.namelist() if n.lower().endswith('.kml'))).decode('utf-8')
        elif f.suffix.lower() == '.kml':
            k = f.read_text(encoding='utf-8')
        else:
            continue
        if '<name>Transformadores</name>' not in k[:2000]:
            continue
        for pm in re.findall(r'<Placemark\b[^>]*>.*?</Placemark>', k, re.S):
            m = re.search(r'<name>(.*?)</name>', pm, re.S)
            if not m or not m.group(1).strip():
                continue
            nome = m.group(1).strip()
            dado = dict(re.findall(r'<Data name="([^"]+)"><value>([^<]*)</value></Data>', pm))
            c = re.search(r'<coordinates>\s*([-\d.]+),([-\d.]+)', pm)
            if c:
                lon, lat = float(c.group(1)), float(c.group(2))
            elif dado.get('Long') and dado.get('Lat'):
                lon, lat = num(dado['Long']), num(dado['Lat'])
            else:
                continue
            if nome in pts:
                rep += 1
            pts[nome] = (lon, lat, dado.get('Alimentador', '').strip())
    return pts, rep


def grade_de(vaos):
    g = {}
    for i, v in enumerate(vaos):
        for gx in range(int(min(v[0], v[2]) // CELULA), int(max(v[0], v[2]) // CELULA) + 1):
            for gy in range(int(min(v[1], v[3]) // CELULA), int(max(v[1], v[3]) // CELULA) + 1):
                g.setdefault((gx, gy), []).append(i)
    return g


def vao_mais_perto(vaos, lon, lat, grade):
    """(índice do vão, distância em m) do vão mais próximo; procura em anéis da grade até achar ou passar de LIM_M."""
    k = math.cos(math.radians(lat))
    gx, gy = int(lon // CELULA), int(lat // CELULA)
    melhor = (None, float('inf'))
    for r in range(0, 4):                          # anel r: até ~r*220 m; para quando o achado já é mais perto
        anel = {(gx + dx, gy + dy) for dx in range(-r, r + 1) for dy in range(-r, r + 1) if max(abs(dx), abs(dy)) == r}
        for i in {i for c in anel for i in grade.get(c, ())}:
            ax, ay, bx, by = vaos[i][0] * k, vaos[i][1], vaos[i][2] * k, vaos[i][3]
            px, py = lon * k, lat
            dx, dy = bx - ax, by - ay
            l2 = dx * dx + dy * dy
            f = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2)) if l2 else 0.0
            d = math.hypot(ax + f * dx - px, ay + f * dy - py) * 111320
            if d < melhor[1]:
                melhor = (i, d)
        if melhor[1] <= r * CELULA * 111320 * k:
            break
    return melhor


def grava_trafos(site, pts):
    """dados/trafos_gis.json: {código: [lon, lat, alimentador no GIS]} de todos os transformadores do acervo. Com ele a
    Crítica nova acha o trecho do trafo sem o acervo (scripts/atualiza_critica.py)."""
    arq = site / 'dados' / 'trafos_gis.json'
    arq.write_text(json.dumps({k: list(v) for k, v in sorted(pts.items())}, ensure_ascii=False, separators=(',', ':')),
                   encoding='utf-8')
    return arq


def le_trafos(site):
    arq = site / 'dados' / 'trafos_gis.json'
    return {k: tuple(v) for k, v in json.loads(arq.read_text(encoding='utf-8')).items()} if arq.exists() else None


def onde_no(c, pts):
    """onde(código) → (trecho até LIM_M ou None, distância em m, vão) do trafo na rede do alimentador c (com cache)."""
    vaos, ts, grade, cache = c['vaos'], c['trechos'], grade_de(c['vaos']), {}

    def onde(cod):
        if cod not in cache:
            lon, lat = pts[cod][0], pts[cod][1]
            i, d = vao_mais_perto(vaos, lon, lat, grade)
            cache[cod] = (ts[vaos[i][4]]['nome'] if i is not None and d <= LIM_M else None,
                          round(d, 1) if i is not None else None, i if i is not None and d <= LIM_M else None)
        return cache[cod]
    return onde


def no_gis(o, al, pts, onde):
    """NAE 'ativo fora do KML' de transformador: trecho pelo ponto do GIS. Devolve o que houve (None: não é o caso)."""
    if o.get('trecho') or o.get('regra') != 'ativo fora do KML' or not E_TRAFO(o):
        return None
    cod = next((x for x in (o.get('ativo'), o.get('prob')) if x in pts), None)
    if not cod:
        return 'sem_ponto'
    t, d, _ = onde(cod)
    if t:
        o['trecho'], o['dist_m'] = t, d
        o['ativo'], o['fora'], o['regra'] = cod, None, REGRA
        return 'localizada'
    if pts[cod][2] and pts[cod][2] != al:
        o['fora'] = f'hoje no {pts[cod][2]}'
        return 'hoje'
    o['fora'], o['dist_m'] = 'longe da rede do site', d
    return 'longe'


def aplica(site, pasta_kmz=None, pts=None):
    if pts is None:
        pts, rep = transformadores(pasta_kmz)
    else:
        rep = 0
    tot = dict(transformadores_gis=len(pts), repetidos=rep, alimentadores=0, ativos_kml=0, no_trecho=0,
               nae_sem_trecho_tr=0, nae_localizadas=0, nae_longe=0, nae_hoje_em_outro=0, nae_sem_ponto=0)
    longe = []
    for jf in sorted((site / 'dados' / 'alimentadores').glob('*.json')):
        al = jf.stem
        mf = site / 'alimentadores' / al / 'dados.js'
        c = json.loads(jf.read_text(encoding='utf-8'))
        if c['validacao']['status'] == 'falha' or not mf.exists():
            continue
        onde = onde_no(c, pts)
        conta_de = dict(sem_ponto='nae_sem_ponto', hoje='nae_hoje_em_outro', longe='nae_longe')

        def localiza(oc, conta):
            n = 0
            for o in oc:
                r = no_gis(o, al, pts, onde)
                if r is None:
                    continue
                n += r == 'localizada'
                if conta:
                    tot['nae_sem_trecho_tr'] += 1
                    if r in conta_de:
                        tot[conta_de[r]] += 1
                    if r == 'longe':
                        longe.append((al, o.get('ativo') if o.get('ativo') in pts else o.get('prob'), o['dist_m']))
            return n

        cab, D = le_js(mf)
        oc_c, oc_d = (c.get('nae') or {}).get('oc') or [], (D.get('nae') or {}).get('oc') or []   # sem Crítica: sem NAE
        n = localiza(oc_c, True)
        if localiza(oc_d, False) != n:                          # confere antes de gravar: os dois arquivos andam juntos
            raise SystemExit(f'{al}: NAE do JSON e do dados.js não batem')
        usados = {o['ativo'] for o in oc_c if o.get('regra') == REGRA}
        meus = sorted({k for k, p in pts.items() if p[2] == al} | usados)
        c['ativos_kml'] = [[k, 'TR', pts[k][0], pts[k][1], *onde(k)] for k in meus]
        jf.write_text(json.dumps(c, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        mf.write_text(cab + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
        tot['alimentadores'] += 1
        tot['ativos_kml'] += len(meus)
        tot['no_trecho'] += sum(1 for a in c['ativos_kml'] if a[4])
        tot['nae_localizadas'] += n
    return tot, longe


def outros(site, pasta_kmz=None, pts=None):
    """NAE 'hoje no X': trecho do ativo na rede do X; a NAE vai também para 'nae.ext' do X (fica no total do Y)."""
    if pts is None:
        pts = transformadores(pasta_kmz)[0] if pasta_kmz else {}
    arq = {jf.stem: jf for jf in (site / 'dados' / 'alimentadores').glob('*.json')}
    carrega = lambda al: json.loads(arq[al].read_text(encoding='utf-8'))
    pedidos = {}                                     # X → [(Y, índice da ocorrência no Y)]
    for al, jf in sorted(arq.items()):
        c = carrega(al)
        for i, o in enumerate((c.get('nae') or {}).get('oc') or []):
            x = (o.get('fora') or '')[8:] if not o.get('trecho') and (o.get('fora') or '').startswith('hoje no ') else ''
            if x in arq and x != al:
                pedidos.setdefault(x, []).append((al, i))
    tot = dict(nae_hoje_em_outro=sum(map(len, pedidos.values())), no_trecho_do_outro=0, sem_trecho_no_outro=0)
    achado = {}                                      # (Y, i) → (X, trecho, regra, distância)
    for x in sorted(arq):
        c = carrega(x)
        ok = c['validacao']['status'] != 'falha' and (site / 'alimentadores' / x / 'dados.js').exists()
        ext = []
        if ok and x in pedidos:
            vaos, ts = c['vaos'], c['trechos']
            grade, inicio = grade_de(vaos), {(t['inicio'] or {}).get('chave'): t['nome'] for t in ts}
            chave = {ch['nome']: ch['lonlat'] for ch in c['chaves']}
            # chave do KML fora da topologia (tipo não reconhecido): trecho já guardado (gera_trechos/atualiza_critica)
            fora_topo = {q[0]: q for q in c.get('chaves_sem_topologia') or [] if q[3] and (q[4] or 0) <= LIM_M}
            cache = {}
            for y, i in pedidos[x]:
                if y not in cache:
                    cache[y] = carrega(y)['nae']['oc']
                o = cache[y][i]
                cod = next((k for k in (o.get('ativo'), o.get('prob')) if k), None)
                t, d, regra = None, None, None
                if cod in inicio:
                    t, regra = inicio[cod], 'chave de início do trecho'
                else:
                    ll = chave.get(cod) or (pts[cod][:2] if cod in pts else None)
                    if ll:
                        j, dd = vao_mais_perto(vaos, ll[0], ll[1], grade)
                        if j is not None and dd <= LIM_M:
                            t, d, regra = ts[vaos[j][4]]['nome'], round(dd, 1), 'vão mais próximo do ativo'
                    if not t and cod in fora_topo:
                        t, d, regra = fora_topo[cod][3], fora_topo[cod][4], 'vão mais próximo do ativo'
                achado[(y, i)] = (x, t)
                if t:
                    e = {k: v for k, v in o.items() if k not in ('hoje', 'lonlat')}    # de uma rodada anterior: não vale aqui
                    ext.append(dict(e, trecho=t, ativo=cod, fora=None, dist_m=d, regra=f'{REGRA_EXT} ({regra})', de=y))
                    tot['no_trecho_do_outro'] += 1
                else:
                    tot['sem_trecho_no_outro'] += 1
        if ok and (ext or (c.get('nae') or {}).get('ext')):
            ext.sort(key=lambda o: (o['mes'], o.get('dia') or ''))
            grava(site, x, lambda n: n.__setitem__('ext', ext) if ext else n.pop('ext', None))
    for y in sorted(arq):                              # no Y: onde o ativo está hoje (X e trecho), para o link na página
        c = carrega(y)
        oc = (c.get('nae') or {}).get('oc') or []
        if not any('hoje' in o for o in oc) and not any(yy == y for yy, _ in achado):
            continue
        if c['validacao']['status'] == 'falha' or not (site / 'alimentadores' / y / 'dados.js').exists():
            continue

        def marca(n, y=y):                               # refeito a cada rodada: tira o 'hoje' velho e põe o atual
            for i, o in enumerate(n['oc']):
                o.pop('hoje', None)
                if (y, i) in achado:
                    o['hoje'] = list(achado[(y, i)])
        grava(site, y, marca)
    return tot


def posicoes(site, pasta_kmz=None, pts=None):
    """'lonlat' em cada NAE com trecho: onde está o ativo (chave da rede do site ou trafo do GIS), para o mapa marcar."""
    if pts is None:
        pts = transformadores(pasta_kmz)[0] if pasta_kmz else {}
    tot = dict(nae_com_posicao=0, nae_no_trecho_sem_posicao=0)
    for jf in sorted((site / 'dados' / 'alimentadores').glob('*.json')):
        c = json.loads(jf.read_text(encoding='utf-8'))
        if c['validacao']['status'] == 'falha' or not (site / 'alimentadores' / jf.stem / 'dados.js').exists() \
                or not (c.get('nae') or {}).get('oc'):
            continue
        chave = {ch['nome']: ch['lonlat'] for ch in c['chaves']}
        dj = next((ch['lonlat'] for ch in c['chaves'] if ch.get('tipo') == 'DJ'), None)

        def poe(n):
            for o in n['oc'] + (n.get('ext') or []):
                o.pop('lonlat', None)
                if not o.get('trecho'):
                    continue
                cod = o.get('ativo')
                ll = chave.get(cod) or (pts[cod][:2] if cod in pts else None) or (dj if o.get('abr') == 'DJ' else None)
                if ll:
                    o['lonlat'] = [round(ll[0], 6), round(ll[1], 6)]
        grava(site, jf.stem, poe)
        for o in json.loads(jf.read_text(encoding='utf-8'))['nae']['oc']:
            if o.get('trecho'):
                tot['nae_com_posicao' if o.get('lonlat') else 'nae_no_trecho_sem_posicao'] += 1
    return tot


def grava(site, al, muda):
    """Aplica muda(nae) no JSON canônico e no dados.js do alimentador (os dois têm a mesma lista de NAE)."""
    jf, mf = site / 'dados' / 'alimentadores' / f'{al}.json', site / 'alimentadores' / al / 'dados.js'
    c = json.loads(jf.read_text(encoding='utf-8'))
    cab, D = le_js(mf)
    if not c.get('nae') or not D.get('nae'):
        return
    if [(o['mes'], o.get('dia'), o.get('prob')) for o in c['nae']['oc']] != \
            [(o['mes'], o.get('dia'), o.get('prob')) for o in D['nae']['oc']]:
        raise SystemExit(f'{al}: NAE do JSON e do dados.js não batem')
    muda(c['nae'])
    muda(D['nae'])
    jf.write_text(json.dumps(c, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    mf.write_text(cab + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')


if __name__ == '__main__':
    tot, longe = aplica(Path(sys.argv[1]), sys.argv[2])
    grava_trafos(Path(sys.argv[1]), transformadores(sys.argv[2])[0])
    tot.update(outros(Path(sys.argv[1]), sys.argv[2]))
    tot.update(posicoes(Path(sys.argv[1]), sys.argv[2]))
    print(json.dumps(tot, ensure_ascii=False))
    if '--relatorio' in sys.argv:
        Path(sys.argv[sys.argv.index('--relatorio') + 1]).write_text(
            json.dumps(dict(totais=tot, longe=longe), ensure_ascii=False, indent=1), encoding='utf-8')
