"""Trechos nomeados pelos ativos: T1, T2, T2-A…, T3-A…, cada um com ativo de início e fim.

Regras (a partir do resultado de regras.analisar):
    - T1: do DJ até o 1º religador. Derivação em poste sem ativo continua no T1.
    - T2: do 1º religador (onde o tronco sai do T1) até o próximo religador. Derivação em poste sem ativo continua no T2.
    - T2-A, T2-B…: cada religador seguinte abre um novo T2 (de religador até religador), no tronco ou fora dele,
      em ordem de distância a partir do DJ. A letra só nasce em ativo.
    - T3-A, T3-B…: cada fusível (03/33/02), inclusive fusível dentro de fusível (não existe T4), em ordem de
      distância a partir do DJ: A…Z, AA, AB…
    - Chave de seccionamento (SEC), 88 e outras não criam trecho.
Início e fim vão de chave até chave: T1 = DJ → religador; T2 = religador → religador (ou → chave); do T2 pra frente,
chave → chave. Fim do trecho: o religador do tronco (ou de dentro do ramal) onde começa o T2 seguinte; sem ele,
seguindo a linha principal (rumo ao ponto mais distante do DJ), a 1ª chave onde começa outro trecho ou, se não houver,
o poste de fim de linha. Religador fora do tronco que sai do T1/T2 é derivação, não fim.
"""
import json
import zipfile
from collections import defaultdict
from pathlib import Path
from xml.sax.saxutils import escape

from . import regras as _regras

# Uma fonte só: duplicar a lista aqui fez o trip saver (40/41) virar zona T3
# em regras.py sem abrir trecho aqui, e a checagem de coerência estourava.
FUSIVEIS = set(_regras.FUSIVEIS)


def letras(i):
    """0 → A, 25 → Z, 26 → AA, 27 → AB…"""
    s, i = '', i + 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def segmentar(nos, res, nomes_fixos=None):
    vaos = res['vaos']
    tipo_at = {a['nome']: a['tipo'] for a in res['ativos']}
    filhos = defaultdict(list)
    for v in vaos:
        filhos[v['_p']].append(v)
    chegada = {v['_c']: v for v in vaos}
    raiz = next(v['_p'] for v in vaos if v['_p'] not in chegada)
    tipo = lambda n: 'P' if nos[n]['tipo'] == 'P' else tipo_at.get(nos[n]['nome'], nos[n]['tipo'])
    dist_no = lambda n: chegada[n]['dist_dj'] if n in chegada else 0.0

    # chave do trecho de cada vão, da raiz para as pontas
    chave_vao, inicio_no = {}, {}
    pilha = [(raiz, None)]
    while pilha:
        n, atual = pilha.pop()
        t = tipo(n)
        for v in filhos[n]:
            if t == 'DJ':
                k = 'T1'
            elif t in FUSIVEIS:
                k = ('F', n)
            elif t == '79':
                k = 'T2' if atual == 'T1' and any(x['tronco'] for x in filhos[n]) else ('R', n)
            else:
                k = atual
            if k != atual or t == '79':
                ns = inicio_no.setdefault(k, [])
                if n not in ns:
                    ns.append(n)
            chave_vao[v['id']] = k
            pilha.append((v['_c'], k))

    # nomes: letras em ordem de distância do ativo de início
    nome_de = {'T1': 'T1', 'T2': 'T2'}
    ramais = sorted((k for k in inicio_no if k[0] == 'R'), key=lambda k: dist_no(k[1]))
    nome_de.update({k: f'T2-{letras(i)}' for i, k in enumerate(ramais)})
    zona_k = {k: 1 if k == 'T1' else 2 if k == 'T2' or k[0] == 'R' else filhos[ns[0]][0]['zona'] for k, ns in inicio_no.items()}
    por_zona = defaultdict(list)
    for k in inicio_no:
        if k[0] == 'F':
            por_zona[zona_k[k]].append(k)
    for z, ks in por_zona.items():
        ks.sort(key=lambda k: dist_no(k[1]))
        nome_de.update({k: f'T{z}-{letras(i)}' for i, k in enumerate(ks)})
    if nomes_fixos:
        # trecho que já existia (mesma chave de início) fica com o nome de antes; trecho novo recebe a próxima letra
        # livre da sua classe (T2-…, T3-…), sem mudar o nome de nenhum outro
        ini = {k: nos[min(ns, key=dist_no)]['nome'] for k, ns in inicio_no.items()}
        novo = {k: nomes_fixos[ini[k]] for k in inicio_no if ini[k] in nomes_fixos}
        usados = set(novo.values())
        for k in sorted(inicio_no, key=lambda k: dist_no(min(inicio_no[k], key=dist_no))):
            if k in novo:
                continue
            if '-' not in nome_de[k]:                  # T1/T2: o nome é a posição
                nm = nome_de[k]
            else:
                pre, i = nome_de[k].partition('-')[0], 0
                while f'{pre}-{letras(i)}' in usados:
                    i += 1
                nm = f'{pre}-{letras(i)}'
            novo[k] = nm
            usados.add(nm)
        nome_de = novo

    # monta os trechos
    tr = {}
    for k, ns in inicio_no.items():
        ns = sorted(ns, key=dist_no)
        n0 = ns[0]
        z = zona_k[k]
        pai = chave_vao[chegada[n0]['id']] if n0 in chegada else None
        tr[k] = dict(nome=nome_de[k], zona=z, tipo='principal' if k in ('T1', 'T2') else 'ramal' if k[0] == 'R' else 'fusivel',
                     inicio=nos[n0]['nome'], inicio_tipo=tipo(n0), inicio_poste=nos[n0]['poste'],
                     inicio_lat=nos[n0]['lat'], inicio_lon=nos[n0]['lon'], dist_inicio=round(dist_no(n0)),
                     passa=[nos[n]['nome'] for n in ns[1:]], pai=nome_de[pai] if pai else None,
                     ext=0.0, qtd=0, vaos=[], fim=[], derivacoes=[], _nos=ns)
    for v in vaos:
        t = tr[chave_vao[v['id']]]
        if v['zona'] != t['zona']:
            raise ValueError(f"vão {v['id']} é T{v['zona']} mas caiu no trecho {t['nome']}")
        t['ext'] += v['ext']
        t['qtd'] += 1
        t['tronco'] = t.get('tronco', False) or v['tronco']
        t['vaos'].append(v['id'])
        v['trecho'] = t['nome']

    # fim e derivações (em ordem de distância do DJ). O T2 seguinte é fim do trecho quando começa num religador
    # do tronco (T1 → T2, fim do tronco → T2-A) ou dentro de um ramal T2; religador fora do tronco é derivação.
    no_tronco = {a['nome']: a['no_tronco'] for a in res['ativos']}
    for t in sorted(tr.values(), key=lambda t: t['dist_inicio']):
        if t['pai'] is None:
            continue
        pai = next(x for x in tr.values() if x['nome'] == t['pai'])
        if t['zona'] <= 2 and (pai['tipo'] != 'principal' or no_tronco[t['inicio']]):
            pai['fim'].append(t['inicio'])
        else:
            pai['derivacoes'].append(t['nome'])
    # alcance: maior distância do DJ que se atinge descendo de cada nó
    ordem = [raiz]
    for n in ordem:
        ordem.extend(v['_c'] for v in filhos[n])
    alcance = {}
    for n in reversed(ordem):
        alcance[n] = max((alcance[v['_c']] for v in filhos[n]), default=dist_no(n))
    no_de = {nos[n]['nome']: n for n in ordem if nos[n]['tipo'] != 'P'}
    for k, t in tr.items():
        if t['fim']:
            fins = [no_de[a] for a in t['fim']]
        else:   # segue a linha principal (rumo ao ponto mais distante) até a 1ª chave de outro trecho ou o fim de linha
            n = t['_nos'][0]
            while True:
                v = max(filhos[n], key=lambda v: alcance[v['_c']], default=None)
                if v is None or chave_vao[v['id']] != k:
                    break
                n = v['_c']
            fins = [n]
            t['fim'] = [nos[n]['nome'] if filhos[n] else f"fim de linha · poste {nos[n]['poste']}"]
        t['fim_pts'] = [[round(nos[n]['lat'], 7), round(nos[n]['lon'], 7)] for n in fins]
        t['ext'] = round(t['ext'], 1)
        t['rotulo'] = _ponto_rotulo(t, vaos, chave_vao, chegada, k)
        del t['_nos']
    grupo = {'principal': 0, 'ramal': 1, 'fusivel': 2}
    sufixo = lambda t: t['nome'].partition('-')[2]   # as letras já seguem a distância do DJ (A…Z, AA…)
    return sorted(tr.values(), key=lambda t: (grupo[t['tipo']], t['zona'], len(sufixo(t)), sufixo(t)))


def _ponto_rotulo(t, vaos, chave_vao, chegada, k):
    """Meio do caminho mais longo do trecho (do início até o vão mais distante do DJ)."""
    proprios = [v for v in vaos if chave_vao[v['id']] == k]
    v = max(proprios, key=lambda v: v['dist_dj'])
    cam = []
    while v is not None and chave_vao[v['id']] == k:
        cam.append(v)
        v = chegada.get(v['_p'])
    cam.reverse()
    total, acc = sum(x['ext'] for x in cam), 0.0
    for x in cam:
        acc += x['ext']
        if acc >= total / 2:
            return [round((x['a'][0] + x['b'][0]) / 2, 7), round((x['a'][1] + x['b'][1]) / 2, 7)]
    return [round(cam[-1]['b'][0], 7), round(cam[-1]['b'][1], 7)]


def dados_mapa(nos, res, interrupcoes=None, nomes_fixos=None):
    """Trechos e o objeto de dados do mapa (o `D` de mapa_trechos.html; coordenadas [lat, lon]).

    interrupcoes: ocorrências de critica.por_trecho(); viram o NAE por trecho e mês na lista lateral.
    """
    ts = segmentar(nos, res, nomes_fixos)
    idx = {t['nome']: i for i, t in enumerate(ts)}
    inicio_de = {t['inicio']: t['nome'] for t in ts if t['tipo'] == 'fusivel'}
    r7 = lambda x: round(x, 7)
    dados = dict(
        trechos=[{k: v for k, v in t.items() if k != 'vaos'} for t in ts],
        vaos=[[r7(v['a'][0]), r7(v['a'][1]), r7(v['b'][0]), r7(v['b'][1]), idx[v['trecho']], v['id'], v['ini'], v['fim'],
               round(v['ext'], 1)] for v in res['vaos']],
        principais=[dict(nome=a['nome'], t=a['tipo'], lat=r7(a['lat']), lon=r7(a['lon']), poste=a['poste'])
                    for a in res['ativos'] if a['tipo'] in ('DJ', '79')],
        fusiveis=[dict(nome=a['nome'], t=a['tipo'], lat=r7(a['lat']), lon=r7(a['lon']), trecho=inicio_de.get(a['nome']))
                  for a in res['ativos'] if a['tipo'] in FUSIVEIS or a['tipo'] in ('SEC', 'FTR')])
    if interrupcoes is not None:
        dados['nae'] = dict(meses=sorted({o['mes'] for o in interrupcoes}), oc=[dict(
            mes=o['mes'], dia=f"{o['abert'][8:10]}/{o['abert'][5:7]} {o['abert'][11:16]}", col=o['coletiva'], abr=o['abr'],
            ativo=o['ativo'], prob=o['prob'], causa=o['causa'], sub=o['sub'], prog=o['programada'], cons=o['cons'], dur=o['dur'],
            trecho=o['trecho'], fora=o.get('fora'), regra=o.get('regra'), dist_m=o.get('dist_m')) for o in interrupcoes])
    return ts, dados


def mapa(nos, res, nome, caminho, interrupcoes=None):
    """Mapa HTML com os trechos (uma visão só): DJ e religadores com código, fusíveis como ponto, 88 escondidas."""
    ts, dados = dados_mapa(nos, res, interrupcoes)
    modelo = (Path(__file__).resolve().parent / 'mapa_trechos.html').read_text(encoding='utf-8')
    html = (modelo.replace('%%TITULO%%', escape(nome)).replace('%%ROTULO%%', escape(f'Alimentador {nome}'))
            .replace('%%DADOS%%', json.dumps(dados, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')))
    assert '%%' not in html
    Path(caminho).write_text(html, encoding='utf-8')
    return ts


COR_Z = {1: '3b82f6', 2: '22c55e', 3: 'facc15'}               # mesmas cores do mapa_trechos.html
TIPO_AT = {'DJ': 'disjuntor', '79': 'religador', '03': 'fusível 03', '33': 'fusível 33', '02': 'chave 02',
           '40': 'trip saver 40', '41': 'trip saver 41',
           'SEC': 'seccionamento', 'FTR': 'fusível no tronco'}
ICONES = 'http://maps.google.com/mapfiles/kml/shapes/'


def _cadeias(t, por_id):
    """Vãos do trecho juntados em linhas contínuas (uma por pedaço entre derivações)."""
    vs = [por_id[i] for i in t['vaos']]
    chega = {v['_c'] for v in vs}
    fil = defaultdict(list)
    for v in vs:
        fil[v['_p']].append(v)
    linhas = []
    for v in vs:
        if v['_p'] in chega and len(fil[v['_p']]) == 1:
            continue   # vem emendado no vão anterior
        pts, cur = [v['a'], v['b']], v
        while len(fil[cur['_c']]) == 1:
            cur = fil[cur['_c']][0]
            pts.append(cur['b'])
        linhas.append(pts)
    assert sum(len(p) - 1 for p in linhas) == len(vs)
    return linhas


def kmz(nos, res, nome, caminho, nomes_fixos=None):
    """KMZ para Google Earth (e importável no Google My Maps): uma pasta por trecho, início e fim no balão."""
    ts = segmentar(nos, res, nomes_fixos)
    por_id = {v['id']: v for v in res['vaos']}
    cor = {t['nome']: COR_Z.get(t['zona'], 'd946ef') for t in ts}      # cor pela classe: T2, T2-A… na mesma cor
    kml_cor = lambda h: 'ff' + h[4:6] + h[2:4] + h[0:2]
    largura = {'principal': 6, 'ramal': 5, 'fusivel': 3.5}
    km = lambda m: f'{m:.0f} m' if m < 1000 else f'{m / 1000:.2f} km'.replace('.', ',')
    pt = lambda p: f'{p[1]:.7f},{p[0]:.7f},0'
    papel = defaultdict(list)
    for t in ts:
        papel[t['inicio']].append(f"início do {t['nome']}")
        for f in t['fim']:
            papel[f].append(f"fim do {t['nome']}")

    def balao(t):
        itens = [('Início', f"{t['inicio']} · {TIPO_AT.get(t['inicio_tipo'], t['inicio_tipo'])} · poste {t['inicio_poste']}"),
                 ('Fim', ' / '.join(t['fim']))]
        if t['passa']:
            itens.append(('Passa por', ', '.join(t['passa'])))
        itens += [('Extensão', f"{km(t['ext'])} · {t['qtd']} {'vão' if t['qtd'] == 1 else 'vãos'}"),
                  ('Vem de', t['pai'] or '—'), ('Derivações', ', '.join(t['derivacoes']) or '—')]
        return '<![CDATA[' + '<br>'.join(f'<b>{a}:</b> {escape(b)}' for a, b in itens) + ']]>'

    lats = [p[0] for v in res['vaos'] for p in (v['a'], v['b'])]
    lons = [p[1] for v in res['vaos'] for p in (v['a'], v['b'])]
    clat, clon = (min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2
    diag = ((max(lats) - min(lats)) ** 2 + ((max(lons) - min(lons)) * 0.99) ** 2) ** 0.5 * 111_320
    regra = ('T1: DJ → 1º religador. T2: 1º → 2º religador. T2-A, T2-B…: cada religador seguinte abre um novo T2, '
             'em ordem a partir do DJ. T3-A, T3-B…: cada fusível, em ordem a partir do DJ (não existe T4). '
             'Toque numa linha para ver a chave de início e de fim.')
    k = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
         f'<name>{escape(nome)} · trechos</name><open>1</open><description>{escape(regra)}</description>',
         f'<LookAt><longitude>{clon:.6f}</longitude><latitude>{clat:.6f}</latitude><altitude>0</altitude>'
         f'<heading>0</heading><tilt>0</tilt><range>{max(diag * 1.6, 1500):.0f}</range></LookAt>']
    for i, t in enumerate(ts):
        c = kml_cor(cor[t['nome']])
        k.append(f'<Style id="l{i}"><LineStyle><color>{c}</color><width>{largura[t["tipo"]]}</width></LineStyle></Style>'
                 f'<Style id="n{i}"><IconStyle><scale>0</scale></IconStyle><LabelStyle><color>{c}</color>'
                 f'<scale>{1.1 if t["tipo"] != "fusivel" else 0.8}</scale></LabelStyle></Style>')
    k.append(f'<Style id="rl"><IconStyle><scale>1.1</scale><Icon><href>{ICONES}placemark_square.png</href></Icon>'
             '</IconStyle><LabelStyle><scale>0.9</scale></LabelStyle></Style>'
             f'<Style id="fus"><IconStyle><scale>0.6</scale><Icon><href>{ICONES}placemark_circle.png</href></Icon>'
             '</IconStyle><LabelStyle><scale>0</scale></LabelStyle></Style>')

    k.append('<Folder><name>Trechos</name><open>1</open>')
    for tipo, titulo in (('principal', 'T1 e T2'), ('ramal', 'T2-A, T2-B… (um por religador)'), ('fusivel', 'T3 (depois de fusível)')):
        grupo = [(i, t) for i, t in enumerate(ts) if t['tipo'] == tipo]
        if not grupo:
            continue
        k.append(f'<Folder><name>{titulo}</name><open>{0 if tipo == "fusivel" else 1}</open>')
        for i, t in grupo:
            fim = ' / '.join(f.replace('fim de linha · poste ', 'fim ') for f in t['fim'])
            k.append(f'<Folder><name>{escape(t["nome"])} · {escape(t["inicio"])} → {escape(fim)} · {km(t["ext"])}</name>'
                     f'<description>{balao(t)}</description>')
            for pts in _cadeias(t, por_id):
                k.append(f'<Placemark><name>{escape(t["nome"])}</name><description>{balao(t)}</description>'
                         f'<styleUrl>#l{i}</styleUrl><LineString><tessellate>1</tessellate><coordinates>'
                         + ' '.join(pt(p) for p in pts) + '</coordinates></LineString></Placemark>')
            k.append('</Folder>')
        k.append('</Folder>')
    k.append('</Folder><Folder><name>Nomes dos trechos</name>')
    for i, t in enumerate(ts):
        k.append(f'<Placemark><name>{escape(t["nome"])}</name><description>{balao(t)}</description>'
                 f'<styleUrl>#n{i}</styleUrl><Point><coordinates>{pt(t["rotulo"])}</coordinates></Point></Placemark>')
    k.append('</Folder>')
    for titulo, tipos, estilo in (('DJ e religadores', ('DJ', '79'), 'rl'),
                                  ('Chaves fusíveis e trip savers', tuple(sorted(FUSIVEIS)) + ('SEC', 'FTR'), 'fus')):
        k.append(f'<Folder><name>{titulo}</name>')
        for a in res['ativos']:
            if a['tipo'] in tipos:
                d = ' · '.join([TIPO_AT.get(a['tipo'], a['tipo']), f"poste {a['poste']}"] + papel.get(a['nome'], []))
                k.append(f'<Placemark><name>{escape(a["nome"])}</name><description>{escape(d)}</description>'
                         f'<styleUrl>#{estilo}</styleUrl><Point><coordinates>{a["lon"]:.7f},{a["lat"]:.7f},0'
                         '</coordinates></Point></Placemark>')
        k.append('</Folder>')
    k.append('</Document></kml>')
    with zipfile.ZipFile(caminho, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('doc.kml', '\n'.join(k))
    return ts
