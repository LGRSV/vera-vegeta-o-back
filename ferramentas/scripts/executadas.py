"""OS de manutenção EXECUTADAS no mapa do alimentador (card "Manutenção"): lê a base "OS_STATUS_Executadas" (.txt
separado por ";", ou o .zip com ele) e grava alimentadores/<AL>/executadas.js com as OS de manutenção corretiva (MC) e
preventiva (MP) e o ativo onde cada uma foi feita. Inspeções (INSP), manobras (AG), construção (ETO), comissionamento
(COM) e afins ficam de fora: não são manutenção do ativo (as inspeções já estão no card Inspeção).

Onde fica cada OS (o ativo manutencionado), pelo índice de ativos do site (dados/ativos, o mesmo da busca):
  1. o poste da ESTRUTURA ("190-426869" -> poste 426869);
  2. o código da ESTRUTURA quando ela é o próprio ativo ("CAG-57-5700316113" -> transformador 5700316113);
  3. o ELEMENTO da OS (o transformador ou a chave que atende o local), quando o poste não está no mapa (rede BT).
Conferido na base 2021-2026: 89% das OS de alimentadores do site ganham posição (40% pelo poste da ESTRUTURA).
A OS fica na página do alimentador da OS; se o ativo hoje está só em outro alimentador, vai para a página dele (com o
alimentador da OS anotado), como no NAE/100 km. Sem posição, a OS fica só na lista do alimentador da OS.
Todo alimentador com página ganha o executadas.js (sem OS quando não tem): a página não pede arquivo que não existe.

Uso:
  python scripts/executadas.py OS_STATUS_Executadas_2021-2026.zip <pasta do site>
Depois, rodar gera_trechos.py --so-interface (a página do alimentador carrega o executadas.js).
"""
import csv
import datetime as dt
import io
import json
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gera_trechos import chave_ativo, fatia  # noqa: E402  (a mesma chave e fatia da busca de ativo)

csv.field_size_limit(10 ** 8)
MANUTENCAO = re.compile(r'^M[CP] - ')               # MC = corretiva, MP = preventiva
DESC_MAX = 160


def texto(v):
    return re.sub(r'\s+', ' ', str(v or '')).replace('�', '?').strip()


def dia(v):
    """'05/03/2024 14:10:00' -> '2024-03-05'."""
    m = re.match(r'(\d\d)/(\d\d)/(\d{4})', texto(v))
    return f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else None


def linhas(arq):
    """Linhas da base (dicionários), do .txt ou do 1º .txt dentro do .zip."""
    arq = Path(arq)
    if arq.suffix.lower() != '.zip':
        with open(arq, encoding='utf-8-sig', newline='') as f:
            yield from csv.DictReader(f, delimiter=';')
        return
    with zipfile.ZipFile(arq) as z:
        nomes = [n for n in z.namelist() if n.lower().endswith(('.txt', '.csv'))]
        if not nomes:
            raise SystemExit(f'{arq.name}: nenhum .txt dentro do .zip')
        with io.TextIOWrapper(z.open(nomes[0]), encoding='utf-8-sig', newline='') as f:
            yield from csv.DictReader(f, delimiter=';')


def codigos(r):
    """Códigos a procurar no índice, na ordem: poste da ESTRUTURA, código da ESTRUTURA, ELEMENTO."""
    est, el = texto(r.get('ESTRUTURA')), texto(r.get('ELEMENTO'))
    m = re.fullmatch(r'190-(\d+)', est)
    out = [('p', m.group(1))] if m else [('e', est.split('-')[-1])] if est else []
    if el:
        out.append(('l', el))
    return [(como, chave_ativo(c), c) for como, c in out if c]   # (de onde, chave do índice, código como está na OS)


def le_indice(site, chaves):
    """Só as entradas das chaves pedidas: {chave: [[al, tipo, trecho, papel, lat, lon], ...]}."""
    por_fatia = defaultdict(set)
    for k in chaves:
        por_fatia[fatia(k)].add(k)
    idx = {}
    for f, ks in por_fatia.items():
        p = Path(site) / 'dados' / 'ativos' / f'{f}.json'
        if p.exists():
            d = json.loads(p.read_text(encoding='utf-8'))
            idx.update((k, d[k]) for k in ks if k in d)
    return idx


def main(arq, site):
    site = Path(site)
    pags = sorted(p.parent.name for p in (site / 'alimentadores').glob('*/dados.js') if (p.parent / 'index.html').exists())
    pset = set(pags)
    oss, fora, total = {}, Counter(), 0
    for r in linhas(arq):
        total += 1
        tipo = texto(r.get('DESCESQUEMA'))
        if texto(r.get('SITUACAO')).upper() != 'EXECUTADA':
            fora['não executada'] += 1
            continue
        if not MANUTENCAO.match(tipo):
            fora[tipo.split(' - ')[0] if ' - ' in tipo else tipo] += 1
            continue
        num = texto(r.get('NUMERO_OS'))
        oss[num] = {                                    # a mesma OS repetida na base vale uma vez
            'os': num, 'tipo': tipo, 'exec': dia(r.get('FIM_EXEC')) or dia(r.get('INICIO_EXEC')),
            'eq': texto(r.get('CODEQUIPE')), 'crit': texto(r.get('CRITICIDADE')).lower(),
            'desc': texto(r.get('DESCRICAO_OS'))[:DESC_MAX], 'al': texto(r.get('ALIMENTADOR')).upper(),
            'cods': codigos(r),
        }
    idx = le_indice(site, {k for o in oss.values() for _, k, _ in o['cods']})
    por_al = {a: {'ativos': {}, 'os': []} for a in pags}
    cont, sem_pagina = Counter(), Counter()
    for o in oss.values():
        onde = None
        for como, k, cod in o['cods']:
            ents = [e for e in idx.get(k, []) if e[0] in pset]
            if ents:
                e = next((e for e in ents if e[0] == o['al']), ents[0])
                onde = (como, k, cod, e)
                break
        if onde:
            como, k, cod, e = onde
            al = e[0]
            cont[{'p': 'no poste da ESTRUTURA', 'e': 'no ativo da ESTRUTURA', 'l': 'no ELEMENTO (trafo ou chave do local)'}[como]] += 1
            if al != o['al']:
                cont['em outro alimentador (onde o ativo está hoje)'] += 1
        elif o['al'] in pset:
            al = o['al']
            cont['sem posição (só na lista)'] += 1
        else:
            sem_pagina[o['al']] += 1
            continue
        pag = por_al[al]
        ia = None
        if onde:
            ia = (k, e[1])                              # o mesmo ativo (código e tipo) vira um ponto só
            pag['ativos'].setdefault(ia, [cod, e[1], e[2], e[4], e[5], como])
        pag['os'].append((o, ia))
    execs = [o['exec'] for o in oss.values() if o['exec']]
    de, ate = (min(execs), max(execs)) if execs else (None, None)
    hoje = dt.date.today().isoformat()
    for al, pag in por_al.items():
        ordem = {c: i for i, c in enumerate(pag['ativos'])}
        tipos = sorted({o['tipo'] for o, _ in pag['os']})
        it = {t: i for i, t in enumerate(tipos)}
        lst = sorted(pag['os'], key=lambda x: (x[0]['exec'] or '', x[0]['os']), reverse=True)
        out = {'fonte': Path(arq).name, 'gerado': hoje, 'de': de, 'ate': ate, 'tipos': tipos,
               # ativo: [código, tipo no índice (poste, TR, 03, 88...), trecho, lat, lon, de onde veio (p, e ou l)]
               'ativos': list(pag['ativos'].values()),
               # OS: [número, tipo (índice em tipos), data de execução, equipe, ativo (índice em ativos ou -1),
               #      descrição, criticidade, alimentador da OS quando é outro]
               'os': [[o['os'], it[o['tipo']], o['exec'], o['eq'], ordem[ia] if ia is not None else -1, o['desc'], o['crit'],
                       o['al'] if o['al'] != al else ''] for o, ia in lst]}
        (site / 'alimentadores' / al / 'executadas.js').write_text(
            'window.EXECUTADAS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    return dict(linhas=total, manutencao=len(oss), fora=dict(fora.most_common()), situacao=dict(cont),
                em_paginas=sum(len(p['os']) for p in por_al.values()), alimentadores=sum(bool(p['os']) for p in por_al.values()),
                paginas=len(pags), sem_pagina=dict(sem_pagina.most_common()), de=de, ate=ate)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    r = main(sys.argv[1], sys.argv[2])
    print(f"{r['linhas']} linhas na base · {r['manutencao']} OS de manutenção (MC e MP) executadas de {r['de']} a {r['ate']} · "
          f"{r['em_paginas']} em alimentadores do site ({r['alimentadores']} alimentadores)")
    print('  fora (não é manutenção): ' + ', '.join(f'{k} {n}' for k, n in r['fora'].items()))
    for k, n in r['situacao'].items():
        print(f'  {k}: {n}')
    if r['sem_pagina']:
        print(f"  alimentador sem página no site: {len(r['sem_pagina'])} ({sum(r['sem_pagina'].values())} OS)")
