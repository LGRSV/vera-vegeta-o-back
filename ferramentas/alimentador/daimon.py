"""Leitura do export do Daimon (SE-XXXX_Circ-ALxxxxxxxxx.kml) para a árvore de vãos usada em regras.analisar().

Segue o prompt original:
    - Só as pastas "Chave" e "Trecho" interessam. Cada chave tem um trecho irmão "Suporte Chave <NOME>",
      em série na rede; atravessar esse trecho é atravessar a chave.
    - Raiz: a ponta do "Suporte Chave DJ_<CIRCUITO>_FICT" mais longe do ponto do DJ.
    - Nós = coordenadas arredondadas a 6 casas; caminho a partir da raiz por Dijkstra.
    - Peso altíssimo (10000) nos suportes de chaves 02, 68, 90 e 31, para o caminho não passar por desvio.
Além disso, chaves com estilo "ChaveNA" (normalmente abertas) são tiradas da rede: a energia não passa por elas.
Chaves 90, 31 e 68 viram passagem (o prompt manda apagá-las da saída).
"""
import heapq
import math
import xml.etree.ElementTree as ET
from pathlib import Path

from .regras import haversine

KML = '{http://www.opengis.net/kml/2.2}'
PESO_DESVIO = 10000.0
PREFIXO_DESVIO = ('02', '68', '90', '31')
PREFIXO_APAGAR = ('90', '31', '68')


def _pasta(root, nome):
    for f in root.iter(KML + 'Folder'):
        n = f.find(KML + 'name')
        if n is not None and (n.text or '').strip() == nome:
            return f
    raise ValueError(f'pasta "{nome}" não encontrada no KML')


def _coords(pm):
    c = pm.find('.//' + KML + 'coordinates')
    pts = []
    for tok in (c.text or '').split():
        lon, lat = tok.split(',')[:2]
        pts.append((round(float(lat), 6), round(float(lon), 6)))
    return pts


def _fase(pm):
    """Fases do vão, se o KML trouxer (FaseConcat/Fase/fase no ExtendedData)."""
    for d in pm.iter(KML + 'Data'):
        if (d.get('name') or '').lower() in ('faseconcat', 'fase', 'fases'):
            v = (d.findtext(KML + 'value') or '').strip().upper()
            return ''.join(sorted(set(c for c in v if c in 'ABC')))
    return ''


def _prefixo(nome):
    return nome[:2] if nome[:2].isdigit() else nome.split('_')[0]


def ler_circuito(caminho, postes=None, raio_poste=6.0):
    """Lê o KML do circuito. postes: lista opcional de {'id','lat','lon'} para dar nome aos nós.

    Devolve (nos, vaos, raiz, info) no formato de regras.analisar(), mais info com contagens e avisos.
    """
    root = ET.parse(caminho).getroot()
    doc = root.find(KML + 'Document')
    observacao = ((doc.findtext(KML + 'description') if doc is not None else None) or '').strip()
    chaves = {}
    for pm in _pasta(root, 'Chave').findall(KML + 'Placemark'):
        nome = (pm.findtext(KML + 'name') or '').strip()
        estilo = (pm.findtext(KML + 'styleUrl') or '')
        chaves[nome] = dict(pt=_coords(pm)[0], na='ChaveNA' in estilo)
    trechos, fases = [], []
    for pm in _pasta(root, 'Trecho').findall(KML + 'Placemark'):
        pts = _coords(pm)
        if len(pts) != 2:
            raise ValueError(f'trecho {pm.findtext(KML + "name")} com {len(pts)} pontos (esperado 2)')
        trechos.append(((pm.findtext(KML + 'name') or '').strip(), pts[0], pts[1]))
        fases.append(_fase(pm))

    dj = [k for k in chaves if k.startswith('DJ_') and k.endswith('_FICT')]
    if len(dj) != 1:
        raise ValueError(f'esperado 1 chave DJ_<CIRCUITO>_FICT, achei {dj}')
    dj = dj[0]
    sup_dj = [t for t in trechos if t[0] == f'Suporte Chave {dj}']
    if len(sup_dj) != 1:
        raise ValueError(f'"Suporte Chave {dj}" não encontrado')
    _, a, b = sup_dj[0]
    # raiz: a ponta do suporte do DJ que encosta na rede; a distância ao ponto do DJ só desempata
    # (o ponto do DJ costuma ficar bem no meio do suporte, e aí "a ponta mais longe" empata)
    grau = {}
    for _, x, y in trechos:
        grau[x] = grau.get(x, 0) + 1
        grau[y] = grau.get(y, 0) + 1
    raiz_pt = max((a, b), key=lambda p: (grau[p] > 1, haversine(p, chaves[dj]['pt'])))
    if grau[raiz_pt] <= 1:
        raise ValueError(f'nenhuma ponta de "Suporte Chave {dj}" encosta em outro trecho')

    avisos, abertas = [], []
    adj = {}
    chave_do_trecho = {}
    for i, (nome, a, b) in enumerate(trechos):
        if nome == f'Suporte Chave {dj}':
            continue
        chave = nome[len('Suporte Chave '):] if nome.startswith('Suporte Chave ') else None
        if chave is not None:
            if chave not in chaves:
                avisos.append(f'"{nome}" sem chave correspondente; tratado como trecho comum.')
                chave = None
            elif chaves[chave]['na']:
                abertas.append(chave)
                continue
        peso = haversine(a, b) + (PESO_DESVIO if chave and _prefixo(chave) in PREFIXO_DESVIO else 0)
        adj.setdefault(a, []).append((b, peso, i))
        adj.setdefault(b, []).append((a, peso, i))
        if chave:
            chave_do_trecho[i] = chave

    # Dijkstra a partir da raiz
    dist, pai, via = {raiz_pt: 0.0}, {}, {}
    fila = [(0.0, raiz_pt)]
    while fila:
        d, x = heapq.heappop(fila)
        if d > dist[x]:
            continue
        for y, w, i in adj.get(x, []):
            if d + w < dist.get(y, math.inf):
                dist[y], pai[y], via[y] = d + w, x, i
                heapq.heappush(fila, (d + w, y))
    usados = set(via.values())
    fora = [i for i in range(len(trechos)) if trechos[i][0] != f'Suporte Chave {dj}' and i not in usados
            and not (trechos[i][0].startswith('Suporte Chave ') and trechos[i][0][14:] in abertas)]
    soltos = [x for x in adj if x not in dist]
    if soltos:
        avisos.append(f'{len(soltos)} ponto(s) sem ligação com o DJ depois de abrir as chaves NA; ficaram de fora.')
    fechando_laco = [i for i in fora if trechos[i][1] in dist and trechos[i][2] in dist]
    if fechando_laco:
        avisos.append(f'{len(fechando_laco)} trecho(s) fechavam laço e ficaram fora da árvore: '
                      + ', '.join(trechos[i][0] or '(sem nome)' for i in fechando_laco[:10]))
    sup_fora = [chave_do_trecho[i] for i in fechando_laco if i in chave_do_trecho]
    if sup_fora:
        avisos.append('Chave(s) fora do caminho da energia (em paralelo): ' + ', '.join(sup_fora))

    # nós: DJ na raiz; a chave fica no nó de chegada do seu suporte
    ids = {raiz_pt: 'DJ'}
    for p in sorted(dist, key=dist.get):
        if p != raiz_pt:
            ids[p] = f'n{len(ids)}'
    nos = {}
    nomes_postes = _nomear_postes(list(ids), postes, raio_poste)
    for p, nid in ids.items():
        poste = nomes_postes.get(p) or f'N{nid[1:] if nid != "DJ" else "0"}'
        nos[nid] = dict(tipo='P', nome=poste, poste=poste, lat=p[0], lon=p[1], poste_real=p in nomes_postes)
    nos['DJ'].update(tipo='DJ', nome=dj.replace('_FICT', '').replace('DJ_', 'DJ '))
    for y, i in via.items():
        chave = chave_do_trecho.get(i)
        if chave:
            pre = _prefixo(chave)
            if pre in PREFIXO_APAGAR:
                continue
            nos[ids[y]].update(tipo=pre, nome=chave)
    vaos = [(ids[pai[y]], ids[y]) for y in pai]
    if not vaos:
        raise ValueError('nenhum trecho ligado ao DJ')
    nomes_vaos = {(ids[pai[y]], ids[y]): trechos[via[y]][0] for y in pai}
    fases_vaos = {(ids[pai[y]], ids[y]): fases[via[y]] for y in pai}

    info = dict(dj=dj, chaves=len(chaves), trechos=len(trechos), vaos=len(vaos), abertas=abertas,
                fora_da_arvore=len(fora), avisos=avisos, nomes_vaos=nomes_vaos, fases_vaos=fases_vaos, observacao=observacao,
                nomes_chaves=sorted(chaves),
                postes_ligados=sum(1 for p in ids if p in nomes_postes))
    return nos, vaos, 'DJ', info


def _nomear_postes(pontos, postes, raio):
    """Liga cada nó ao poste mais próximo (até `raio` metros). Cada poste nomeia um nó só."""
    if not postes:
        return {}
    grade = {}
    for p in postes:
        grade.setdefault((round(p['lat'], 3), round(p['lon'], 3)), []).append(p)
    candidatos = []
    for pt in pontos:
        la, lo = round(pt[0], 3), round(pt[1], 3)
        for dla in (-0.001, 0, 0.001):
            for dlo in (-0.001, 0, 0.001):
                for p in grade.get((round(la + dla, 3), round(lo + dlo, 3)), []):
                    d = haversine(pt, (p['lat'], p['lon']))
                    if d <= raio:
                        candidatos.append((d, pt, str(p['id'])))
    nomes, usados = {}, set()
    for d, pt, pid in sorted(candidatos):
        if pt not in nomes and pid not in usados:
            nomes[pt] = pid
            usados.add(pid)
    return nomes


def gerar(caminho_kml, pasta_saida, postes=None):
    """Lê o circuito, aplica as regras e grava KMZ, Excel e mapa em pasta_saida."""
    from . import exporta, regras
    nos, vaos, raiz, info = ler_circuito(caminho_kml, postes)
    res = regras.analisar(nos, vaos, raiz)
    for v in res['vaos']:
        v['trecho_daimon'] = info['nomes_vaos'].get((v['_p'], v['_c']), '')
    res['avisos'] = info['avisos'] + res['avisos']
    nome = Path(caminho_kml).stem.split('Circ-')[-1]
    saida = Path(pasta_saida)
    saida.mkdir(parents=True, exist_ok=True)
    exporta.kmz(res, nome, saida / f'{nome}.kmz')
    exporta.excel(res, nome, saida / f'{nome}.xlsx')
    exporta.mapa(res, nome, saida / 'mapa-blocos.html')
    return res, info
