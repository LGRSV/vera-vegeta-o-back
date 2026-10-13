"""Inspeção visual de MT no mapa do alimentador: lê a base de inspeção (OS INSP-RD, aba "Dados") e grava
alimentadores/<AL>/inspecao.js com as inspeções EXECUTADAS e os vãos que cada uma cobriu.

Onde a inspeção passou: o BLOCO do ELEMENTO, da chave do ELEMENTO descendo pela rede até as próximas chaves (cada
uma é um fim do bloco). A ABRANGENCIA é a chave a montante do ELEMENTO (e a MONT_ABRANGENCIA, a montante dela).
Conferido com as OS de manutenção geradas pelas inspeções (base de 13/10/2026): dos defeitos com poste no mapa, 96%
estão abaixo do ELEMENTO sem nenhuma chave no meio, e só 2% fora; o caminho ELEMENTO → ABRANGENCIA (a leitura
anterior) quase não tinha defeito.
  - ELEMENTO no mapa do alimentador da OS: os vãos do bloco. O ramo sai da posição da chave (num poste com várias
    saídas, só o ramo onde a chave está); para em todo poste com chave do mapa.
  - Só a ABRANGENCIA no mapa: o bloco fica sem posição (o ELEMENTO, em geral um "90..." de bloco de chave faca, não
    tem ponto no GIS nem no KML); a ABRANGENCIA fica de referência.
  - Nenhum dos dois: sem posição (fica na lista).
Cada OS guarda o ponto do ELEMENTO (pe, início do bloco), as chaves onde o bloco termina (fins: [lat, lon, código]) e
o ponto da ABRANGENCIA (pa, a montante): na página, os pontos vermelhos de início e fim são pe e fins.
Ativo no mapa: chave do alimentador (dados/alimentadores/<AL>.json) ou, pelo índice de ativos do site (dados/ativos:
transformadores e chaves com coordenada), o poste do mapa mais perto, até LIM_M.
Data da inspeção: FIM_EXEC; se o FIM vier mais de 60 dias depois do INICIO_EXEC (fechamento em lote), INICIO_EXEC
(a mesma regra da limpeza de faixa).
Todo alimentador com página ganha o inspecao.js (sem OS quando não tem inspeção): a página não pede arquivo que não existe.

Uso:
  python scripts/inspecao.py "BASE INSPEÇÃO.xlsx" <pasta do site>
Depois, rodar gera_trechos.py --so-interface (a página do alimentador carrega o inspecao.js).
"""
import datetime as dt
import json
import math
import re
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gera_trechos import chave_ativo, fatia  # noqa: E402  (mesma chave e mesma fatia do índice de ativos)

LIM_M = 50          # ativo do índice a mais que isso do poste mais perto do mapa não entra (mesmo limite dos trafos)
LOTE_DIAS = 60      # FIM_EXEC mais de 60 dias depois do INICIO_EXEC: vale o INICIO_EXEC
SEM_DESC = ('OS despachada automaticamente',)   # descrição automática do sistema: não vai para a página


def le_js(p):
    s = p.read_text(encoding='utf-8')
    return json.loads(s[s.index('=') + 1:].strip().rstrip(';'))


def le_base(xlsx):
    """Linhas da aba Dados (ou da 1ª aba) como dicionários."""
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    ws = wb['Dados'] if 'Dados' in wb.sheetnames else wb.worksheets[0]
    linhas = ws.iter_rows(values_only=True)
    cab = [str(c).strip() if c is not None else '' for c in next(linhas)]
    return [dict(zip(cab, r)) for r in linhas if any(v not in (None, '') for v in r)]


def texto(v):
    return '' if v is None else re.sub(r'\s+', ' ', str(v)).strip()


def data_insp(r):
    ini, fim = r.get('INICIO_EXEC'), r.get('FIM_EXEC')
    if not isinstance(fim, dt.datetime):
        return None
    if isinstance(ini, dt.datetime) and (fim - ini).days > LOTE_DIAS:
        return ini.date().isoformat()
    return fim.date().isoformat()


class Indice:
    """dados/ativos/<fatia>.json do site, lido por pedaço conforme a busca."""
    def __init__(self, site):
        self.pasta, self.cache = site / 'dados' / 'ativos', {}

    def busca(self, cod):
        k = chave_ativo(cod)
        f = fatia(k)
        if f not in self.cache:
            p = self.pasta / f'{f}.json'
            self.cache[f] = json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}
        return self.cache[f].get(k, [])


class Rede:
    """Mapa do alimentador (dados.js): árvore a partir do DJ, para o bloco abaixo de uma chave."""
    def __init__(self, site, al):
        self.D = le_js(site / 'alimentadores' / al / 'dados.js')
        js = json.loads((site / 'dados' / 'alimentadores' / f'{al}.json').read_text(encoding='utf-8'))
        self.chave = {chave_ativo(c['nome']): c['poste'] for c in js['chaves'] if c.get('poste')}
        self.ll_chave = {chave_ativo(c['nome']): (c['lonlat'][1], c['lonlat'][0]) for c in js['chaves'] if c.get('lonlat')}
        self.nomes_poste = defaultdict(list)            # poste -> chaves dele (as chaves que fecham um bloco)
        for c in js['chaves']:
            if c.get('poste'):
                self.nomes_poste[c['poste']].append(c['nome'])
        viz, self.coord = defaultdict(list), {}
        for i, v in enumerate(self.D['vaos']):
            viz[v[6]].append((v[7], i))
            viz[v[7]].append((v[6], i))
            self.coord.setdefault(v[6], (v[0], v[1]))
            self.coord.setdefault(v[7], (v[2], v[3]))
        raiz = self.D['trechos'][0]['inicio_poste']
        self.pai, self.nivel = {raiz: (None, None)}, {raiz: 0}
        self.filhos = defaultdict(list)
        fila = deque([raiz])
        while fila:
            p = fila.popleft()
            for q, i in viz[p]:
                if q not in self.pai:
                    self.pai[q], self.nivel[q] = (p, i), self.nivel[p] + 1
                    self.filhos[p].append((q, i))
                    fila.append(q)

    def dist_vao(self, i, lat, lon):
        v = self.D['vaos'][i]
        k = math.cos(math.radians(lat))
        ax, ay, bx, by = (v[1] - lon) * k, v[0] - lat, (v[3] - lon) * k, v[2] - lat
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, -(ax * dx + ay * dy) / ((dx * dx + dy * dy) or 1)))
        return math.hypot(ax + t * dx, ay + t * dy)

    def bloco(self, p0, ll=None):
        """Vãos do bloco abaixo da chave no poste p0, até os postes com chave; e esses postes (os fins do bloco).
        Com a posição da chave (ll), o bloco começa no ramo onde ela está; sem ela, em todos os ramos do poste."""
        if p0 not in self.pai:
            return [], []
        inicio = list(self.filhos.get(p0, []))
        if ll and inicio:
            cand = inicio + ([(None, self.pai[p0][1])] if self.pai[p0][1] is not None else [])
            q, i = min(cand, key=lambda qi: self.dist_vao(qi[1], *ll))
            if q is not None:                           # a chave está num dos ramos que descem do poste
                inicio = [(q, i)]
        vs, fins, pilha = [], [], inicio
        while pilha:
            q, i = pilha.pop()
            vs.append(i)
            if self.nomes_poste.get(q):                 # outra chave: o bloco termina aqui
                fins.append(q)
                continue
            pilha.extend(self.filhos.get(q, []))
        return sorted(vs), fins

    def poste_perto(self, lat, lon):
        k = math.cos(math.radians(lat))
        melhor, dmin = None, float('inf')
        for p, (la, lo) in self.coord.items():
            d = ((lo - lon) * k) ** 2 + (la - lat) ** 2
            if d < dmin:
                melhor, dmin = p, d
        return melhor, math.sqrt(dmin) * 111320



def main(xlsx, site):
    site = Path(site)
    base = le_base(xlsx)
    exec_ = [r for r in base if texto(r.get('SITUACAO')).upper() == 'EXECUTADA']
    datas = [d for d in map(data_insp, exec_) if d]
    pags = sorted(p.parent.name for p in (site / 'alimentadores').glob('*/dados.js')
                  if (p.parent / 'index.html').exists() and (site / 'dados' / 'alimentadores' / f'{p.parent.name}.json').exists())
    idx, redes = Indice(site), {}
    por_al = {a: [] for a in pags}
    cont, sem_pagina = Counter(), Counter()

    def ll_indice(al, cod):
        """posição do ativo no índice do site (trafo e outros que não são chave do mapa), para achar o ramo."""
        for a, _tipo, _t, _papel, lat, lon in idx.busca(cod):
            if a == al and lat is not None:
                return lat, lon
        return None

    def ponto(rede, al, cod):
        """código -> poste do mapa do alimentador (ou None)."""
        k = chave_ativo(cod)
        if not k:
            return None
        if k in rede.chave:
            return rede.chave[k]
        for a, _tipo, _t, _papel, lat, lon in idx.busca(cod):
            if a == al and lat is not None:
                p, d = rede.poste_perto(lat, lon)
                if d <= LIM_M:
                    return p
        return None

    for r in exec_:
        al = texto(r.get('ALIMENTADOR')).upper()
        if al not in por_al:
            sem_pagina[al] += 1
            continue
        rede = redes.get(al) or redes.setdefault(al, Rede(site, al))
        el, ab, mo = (texto(r.get(c)) for c in ('ELEMENTO', 'ABRANGENCIA', 'MONT_ABRANGENCIA'))
        pe, pa = ponto(rede, al, el), ponto(rede, al, ab)
        vs, fins, pt = [], [], None
        if pe:
            vs, fins = rede.bloco(pe, rede.ll_chave.get(chave_ativo(el)) or ll_indice(al, el))
            if vs:
                metodo = 'bloco abaixo do ELEMENTO, até as próximas chaves'
            else:
                pt, metodo = pe, 'só o ponto do ELEMENTO: não há rede do mapa abaixo dele'
        elif pa:
            pt, metodo = pa, (f'bloco sem posição: o ELEMENTO {el or "(vazio)"} não está no mapa deste alimentador; '
                              'fica o ponto da ABRANGÊNCIA (a montante), de referência')
        else:
            metodo = 'sem posição: ELEMENTO e ABRANGÊNCIA não estão no mapa deste alimentador'
        cont['no mapa (bloco)' if vs else 'só o ponto' if pt else 'sem posição'] += 1
        num = texto(r.get('NUMERO_OS'))
        desc = texto(r.get('DESCRICAO_OS'))
        reg = {
            'os': num.split()[-1] if num else '',
            'os_completa': num,
            'eq': texto(r.get('CODEQUIPE')),
            'data': data_insp(r),
            'crit': texto(r.get('CRITICIDADE')).lower(),
            'elem': el, 'abr': ab, 'mont': mo,
            'desc': '' if desc.startswith(SEM_DESC) else desc.replace('�', '?')[:300],
            'metodo': metodo,
            'm': round(sum(rede.D['vaos'][i][8] for i in vs), 1),
            'pt': list(rede.coord[pt]) if pt else None,
            'pe': list(rede.coord[pe]) if pe else None,   # ponto do ELEMENTO (início do bloco)
            'fins': [[*rede.coord[f], ' / '.join(rede.nomes_poste[f])] for f in fins],   # chaves onde o bloco termina
            'pa': list(rede.coord[pa]) if pa else None,   # ponto da ABRANGÊNCIA (a montante)
        }
        por_al[al].append((reg, vs))

    hoje = dt.date.today().isoformat()
    km = 0.0
    for al, lst in por_al.items():
        lst.sort(key=lambda ov: (ov[0]['data'] or '', ov[0]['os_completa']))
        out = {'fonte': Path(xlsx).name, 'gerado': hoje, 'base_ate': max(datas) if datas else None,
               'os': [o for o, _ in lst], 'vaos': {}}
        if lst:
            rede = redes[al]
            for k, (_, vs) in enumerate(lst):
                for i in vs:
                    out['vaos'].setdefault(rede.D['vaos'][i][5], []).append(k)
            km += sum(rede.D['vaos'][i][8] for i in {i for _, vs in lst for i in vs}) / 1000
        (site / 'alimentadores' / al / 'inspecao.js').write_text(
            'window.INSPECAO = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    return dict(linhas=len(base), executadas=len(exec_), em_paginas=sum(cont.values()), situacao=dict(cont),
                km_inspecionados=round(km, 1), alimentadores_com_inspecao=sum(bool(v) for v in por_al.values()),
                paginas=len(pags), sem_pagina=dict(sem_pagina.most_common()), base_ate=max(datas) if datas else None)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    r = main(sys.argv[1], sys.argv[2])
    print(f"{r['linhas']} OS na base · {r['executadas']} executadas (até {r['base_ate']}) · "
          f"{r['em_paginas']} em alimentadores do site")
    for k, n in r['situacao'].items():
        print(f'  {k}: {n}')
    print(f"  {r['km_inspecionados']} km de rede inspecionados em {r['alimentadores_com_inspecao']} alimentadores "
          f"(inspecao.js gravado nos {r['paginas']} com página)")
    if r['sem_pagina']:
        print('  alimentador sem página no site (fora do mapa): ' +
              ', '.join(f'{a} ({n})' for a, n in r['sem_pagina'].items()))
