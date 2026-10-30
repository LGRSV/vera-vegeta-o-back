"""OS de manutenção geradas pela inspeção, no mapa do alimentador: lê a base "OS geradas pela inspeção" (1ª aba) e
grava alimentadores/<AL>/manutencao.js com as OS, menos as CANCELADAS.

Onde fica cada OS: no poste da ESTRUTURA ("190-426869" -> poste 426869 do mapa do alimentador da OS). Conferido na base
de 13/10/2026: 86% das OS não canceladas têm o poste no mapa; o poste fica, na mediana, a 2 km da inspeção que gerou a
OS, contra 24 km de um poste qualquer do alimentador (o casamento é real), e 92% deles caem no bloco dessa inspeção.
Sem o poste no mapa, a OS fica na lista (a página mostra o bloco da inspeção de origem).
Situação na página (pela data do dia): executada; vencida (não executada e DATA_LIMITE já passou); no prazo.
Todo alimentador com página ganha o manutencao.js (sem OS quando não tem): a página não pede arquivo que não existe.

Uso:
  python scripts/manutencao.py "OS GERADAS PELA INSPECAO.xlsx" <pasta do site>
  python scripts/manutencao.py --os-status OS_STATUS.parquet <pasta do site>
    (só atualiza a situação e a execução das OS já publicadas pelo OS status, pelo número da OS; as que ficaram
     CANCELADAS saem; prazo, criação e a inspeção de origem continuam os da base da inspeção)
Depois, rodar gera_trechos.py --so-interface (a página do alimentador carrega o manutencao.js).
"""
import datetime as dt
import json
import re
import sys
from collections import Counter
from pathlib import Path

import openpyxl


def le_js(p):
    s = p.read_text(encoding='utf-8')
    return json.loads(s[s.index('=') + 1:].strip().rstrip(';'))


def le_base(xlsx):
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    linhas = wb.worksheets[0].iter_rows(values_only=True)
    cab = [str(c).strip() if c is not None else '' for c in next(linhas)]
    return [dict(zip(cab, r)) for r in linhas if any(v not in (None, '') for v in r)]


def texto(v):
    return '' if v is None else re.sub(r'\s+', ' ', str(v)).strip()


def dia(v):
    return v.date().isoformat() if isinstance(v, dt.datetime) else None


def poste_da_estrutura(v):
    """'190-426869' -> '426869' (o número do poste no mapa)."""
    t = texto(v)
    return t.split('-')[-1] if t else ''


def main(xlsx, site):
    site = Path(site)
    base = le_base(xlsx)
    validas = [r for r in base if texto(r.get('SITUACAO')).upper() != 'CANCELADA']
    pags = sorted(p.parent.name for p in (site / 'alimentadores').glob('*/dados.js') if (p.parent / 'index.html').exists())
    por_al = {a: [] for a in pags}
    coords, cont, sem_pagina = {}, Counter(), Counter()
    for r in validas:
        al = texto(r.get('ALIMENTADOR')).upper()
        if al not in por_al:
            sem_pagina[al] += 1
            continue
        if al not in coords:
            co = {}
            for v in le_js(site / 'alimentadores' / al / 'dados.js')['vaos']:
                co.setdefault(v[6], [v[0], v[1]])
                co.setdefault(v[7], [v[2], v[3]])
            coords[al] = co
        poste = poste_da_estrutura(r.get('ESTRUTURA'))
        ll = coords[al].get(poste)
        cont['no poste do mapa' if ll else 'sem o poste no mapa'] += 1
        num = texto(r.get('NUMERO_OS'))
        sit = texto(r.get('SITUACAO')).upper()
        por_al[al].append({
            'os': num.split()[-1] if num else '',
            'os_completa': num,
            'sit': sit,
            'tipo': re.sub(r'^M[CP] - ', '', texto(r.get('DESCESQUEMA'))),
            'defeito': texto(r.get('DESCRICAO_OS')).replace('�', '?')[:200],
            'crit': texto(r.get('CRITICIDADE')).lower(),
            'criada': dia(r.get('DATA_CRIACAO')),
            'limite': dia(r.get('DATA_LIMITE')),
            'exec': dia(r.get('FIM_EXEC')) if sit == 'EXECUTADA' else None,
            'eq': texto(r.get('CODEQUIPE')),
            'executora': texto(r.get('EQUIPE_EXECUTORA')),
            'insp': texto(r.get('INSP_NUMERO_OS')),
            'insp_data': dia(r.get('INSP_FIM_EXEC')),
            'poste': poste,
            'll': ll,
        })
    criadas = [d for d in (dia(r.get('DATA_CRIACAO')) for r in validas) if d]
    hoje = dt.date.today().isoformat()
    for al, lst in por_al.items():
        lst.sort(key=lambda o: (o['limite'] or '9', o['os_completa']))
        out = {'fonte': Path(xlsx).name, 'gerado': hoje, 'base_ate': max(criadas) if criadas else None, 'os': lst}
        (site / 'alimentadores' / al / 'manutencao.js').write_text(
            'window.MANUTENCAO = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    return dict(linhas=len(base), canceladas=len(base) - len(validas), validas=len(validas),
                em_paginas=sum(cont.values()), situacao=dict(cont), alimentadores=sum(bool(v) for v in por_al.values()),
                paginas=len(pags), sem_pagina=dict(sem_pagina.most_common()), base_ate=max(criadas) if criadas else None)


def atualiza_status(parquet, site):
    import pandas as pd
    d = pd.read_parquet(parquet, columns=['NUMERO_OS', 'SITUACAO', 'FIM_EXEC', 'CODEQUIPE', 'EQUIPE_EXECUTORA'])
    d['k'] = d['NUMERO_OS'].astype(str).str.split().str.join(' ')    # o OS status separa o prefixo com 2 espaços
    st = d.drop_duplicates('k', keep='last').set_index('k')
    cont, ate = Counter(), d['FIM_EXEC'].max()
    for js in sorted(Path(site).glob('alimentadores/*/manutencao.js')):
        out = le_js(js)
        lst = []
        for o in out['os']:
            r = st.loc[o['os_completa']] if o['os_completa'] in st.index else None
            if r is None:
                cont['fora do OS status (mantida)'] += 1
                lst.append(o)
                continue
            sit = texto(r['SITUACAO']).upper()
            if sit == 'CANCELADA':
                cont['cancelada (sai)'] += 1
                continue
            cont['mudou de situação' if sit != o['sit'] else 'mesma situação'] += 1
            o['sit'] = sit
            o['exec'] = r['FIM_EXEC'].date().isoformat() if sit == 'EXECUTADA' and pd.notna(r['FIM_EXEC']) else None
            if sit == 'EXECUTADA':
                o['eq'] = texto(r['CODEQUIPE']) or o['eq']
                o['executora'] = texto(r['EQUIPE_EXECUTORA']) or o['executora']
            lst.append(o)
        out.update(os=lst, situacao_de=Path(parquet).name, situacao_ate=ate.date().isoformat() if pd.notna(ate) else None,
                   gerado=dt.date.today().isoformat())
        js.write_text('window.MANUTENCAO = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n',
                      encoding='utf-8')
    return cont


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == '--os-status':
        print(dict(atualiza_status(sys.argv[2], sys.argv[3])))
        sys.exit()
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    r = main(sys.argv[1], sys.argv[2])
    print(f"{r['linhas']} OS na base · {r['canceladas']} canceladas fora · {r['validas']} OS · "
          f"{r['em_paginas']} em alimentadores do site ({r['alimentadores']} alimentadores)")
    for k, n in r['situacao'].items():
        print(f'  {k}: {n}')
    if r['sem_pagina']:
        print('  alimentador sem página no site: ' + ', '.join(f'{a} ({n})' for a, n in r['sem_pagina'].items()))
