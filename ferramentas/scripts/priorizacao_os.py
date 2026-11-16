"""OS de limpeza de faixa da Priorização (assets/priorizacao-dados.js) a partir do mapa dos alimentadores.

Troca só a lista "os" de cada trecho da Priorização pelas OS do limpeza.js do alimentador (o mesmo que o mapa pinta:
OS status, RD e LD, parciais fora; vale só a OS mãe, com o trecho todo). O resto (ocorrências, inspeções, recorte de
trechos) fica como está.

Cada OS do trecho: [dia (desde d0), situação (1 executada, 2 criada, 3 a reprogramar/reprogramada, 9 outra),
cobertura (fração dos metros do trecho nos vãos da OS), número da OS]. Dia = execução; sem execução, a criação.

Uso:
  python scripts/priorizacao_os.py <pasta do site>
  (roda sozinho na automação depois da Crítica ou da limpeza: atualiza_bases.py)
"""
import datetime as dt
import json
import sys
from collections import defaultdict
from pathlib import Path

SIT = {'EXECUTADA': 1, 'CRIADA': 2, 'A REPROGRAMAR': 3, 'REPROGRAMADA': 3}


def le_js(p):
    s = p.read_text(encoding='utf-8')
    return json.loads(s[s.index('=') + 1:].strip().rstrip(';'))


def main(site):
    site = Path(site)
    arq = site / 'assets' / 'priorizacao-dados.js'
    txt = arq.read_text(encoding='utf-8')
    i = txt.index('window.DADOS =')
    cab, D = txt[:i], json.loads(txt[i + len('window.DADOS ='):].strip().rstrip(';'))
    d0 = dt.date.fromisoformat(D['d0'])
    por_al = defaultdict(list)
    for t in D['trechos']:
        por_al[D['alims'][t['a']][0]].append(t)
    antes = sum(len(t['os']) for t in D['trechos'])
    sem_mapa, datas, n_os = [], [], set()
    for al, ts in por_al.items():
        pl, pd_ = site / 'alimentadores' / al / 'limpeza.js', site / 'alimentadores' / al / 'dados.js'
        if not (pl.exists() and pd_.exists()):
            sem_mapa.append(al)
            continue
        L, M = le_js(pl), le_js(pd_)
        nome = [t['nome'] for t in M['trechos']]
        tot, vao = defaultdict(float), {}
        for v in M['vaos']:
            tot[nome[v[4]]] += v[8]
            vao[v[5]] = (nome[v[4]], v[8])
        cob = defaultdict(lambda: defaultdict(float))             # trecho -> OS -> metros
        for vid, oss in L['vaos'].items():
            if vid in vao:
                tr, m = vao[vid]
                for k in oss:
                    cob[tr][k] += m
        for t in ts:
            lst = []
            for k, m in cob.get(t['n'], {}).items():
                o = L['os'][k]
                if o.get('mae') or o['sit'] == 'CANCELADA':
                    continue
                dia = o['data'] or o['criada']
                if not dia:
                    continue
                datas.append(dia)
                n_os.add(o['os_completa'])
                lst.append([(dt.date.fromisoformat(dia) - d0).days, SIT.get(o['sit'], 9),
                            round(min(1.0, m / tot[t['n']]), 2) if tot[t['n']] else 0.0, o['os_completa']])
            t['os'] = sorted(lst)
    D['os_inicio'] = min(datas)
    D['os_gerado'] = dt.date.today().isoformat()
    D['os_fonte'] = 'OS status de ' + max(datas)[8:10] + '/' + max(datas)[5:7] + '/' + max(datas)[:4] + ' (RD e LD, só OS mãe)'
    cab = cab.rstrip('\n') + '\n// OS de limpeza por trecho refeitas em ' + D['os_gerado'] + ' pelo mapa (scripts/priorizacao_os.py).\n'
    if cab.count('// OS de limpeza por trecho refeitas') > 1:              # mantém só a anotação mais nova
        ls = [x for x in cab.split('\n') if not x.startswith('// OS de limpeza por trecho refeitas')]
        cab = '\n'.join(ls).rstrip('\n') + '\n// OS de limpeza por trecho refeitas em ' + D['os_gerado'] + ' pelo mapa (scripts/priorizacao_os.py).\n'
    arq.write_text(cab + 'window.DADOS = ' + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    return dict(antes=antes, depois=sum(len(t['os']) for t in D['trechos']), os=len(n_os), sem_mapa=sem_mapa,
                de=D['os_inicio'], ate=max(datas))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    print(main(sys.argv[1]))
