"""UCs ligadas por trecho, a partir da planilha de UC por trafo (uc_por_trafo.csv: ID_TRAFO;TRAFO;QTD_CLIENTES_CADASTRO;
PONTOS_DE_ENTREGA;UCS_LIGADAS;UCS_TOTAL;DIFERENCA).

    python scripts/ucs_trechos.py <uc_por_trafo.csv> <pasta do site (teste/)>

O código da coluna TRAFO é o mesmo dos transformadores do site (dados/ativos/*.json: código -> [alimentador, tipo, trecho, ...]).
Cada trafo conta no trecho em que está. Grava <site>/dados/ucs-trechos.js (window.UCS_TRECHOS, para a Priorização) e <site>/dados/ucs/<AL>.json (para o painel do trecho):
  {"fonte", "gerado", "coluna": "UCS_LIGADAS", "al": {"AL...": {"T2-A": [diretas, a_jusante, trafos]}}}
  diretas   = UCs dos trafos do próprio trecho;
  a_jusante = diretas + as dos trechos que saem dele (o trecho e tudo que ele alimenta: o que um evento nele pode desligar);
  trafos    = quantidade de trafos do trecho com UC.
Só entram trechos com UC. Trafo que aparece em mais de um alimentador conta no primeiro (a lista de conflitos sai no final).
"""
import csv
import datetime as dt
import glob
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

COLUNA = 'UCS_LIGADAS'


def chave(s):
    k = re.sub(r'[^0-9A-Z]', '', str(s).upper())
    return (k.lstrip('0') or '0') if k.isdigit() else k


def main(csv_path, site):
    site = Path(site)
    uc = {}
    with open(csv_path, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f, delimiter=';'):
            uc[chave(r['TRAFO'])] = int(r[COLUNA] or 0)
    onde = {}
    conflitos = 0
    for p in sorted(glob.glob(str(site / 'dados' / 'ativos' / '*.json'))):
        for cod, lst in json.loads(Path(p).read_text(encoding='utf-8')).items():
            for al, tipo, trecho, *_ in lst:
                if tipo == 'TR':
                    if cod in onde and onde[cod] != (al, trecho):
                        conflitos += 1
                        continue
                    onde[cod] = (al, trecho)
    diretas, ntraf = defaultdict(lambda: defaultdict(int)), defaultdict(lambda: defaultdict(int))
    sem_csv = 0
    for cod, (al, trecho) in onde.items():
        if cod not in uc:
            sem_csv += 1
            continue
        if uc[cod]:
            diretas[al][trecho] += uc[cod]
            ntraf[al][trecho] += 1
    saida, sem_rede = {}, []
    for al, ds in diretas.items():
        arq = site / 'dados' / 'alimentadores' / (al + '.json')
        if arq.exists():
            pai = {t['nome']: t.get('pai') for t in json.loads(arq.read_text(encoding='utf-8'))['trechos']}
        else:                                        # alimentador sem a rede no site: só as UCs diretas
            pai = {}
            sem_rede.append(al)
        acum = dict(ds)
        for t, u in ds.items():                      # cada trecho soma nele e em todos os ancestrais
            p, vistos = pai.get(t), {t}
            while p and p not in vistos:
                acum[p] = acum.get(p, 0) + u
                vistos.add(p)
                p = pai.get(p)
        saida[al] = {t: [ds.get(t, 0), a, ntraf[al].get(t, 0)] for t, a in sorted(acum.items())}
    out = {'fonte': Path(csv_path).name, 'gerado': dt.date.today().isoformat(), 'coluna': COLUNA, 'al': saida}
    (site / 'dados').mkdir(exist_ok=True)
    js = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    (site / 'dados' / 'ucs-trechos.js').write_text('window.UCS_TRECHOS = ' + js + ';\n', encoding='utf-8')   # Priorização (script comum)
    (site / 'dados' / 'ucs').mkdir(exist_ok=True)
    for al, d in saida.items():                                                  # painel do trecho no mapa (um arquivo por alimentador)
        (site / 'dados' / 'ucs' / (al + '.json')).write_text(json.dumps(d, separators=(',', ':')), encoding='utf-8')
    tot = sum(v[0] for d in saida.values() for v in d.values())
    print(f'{len(saida)} alimentadores, {sum(len(d) for d in saida.values())} trechos com UC, {tot} UCs; '
          f'trafos do site sem linha no CSV: {sem_csv}; trafos em 2+ alimentadores: {conflitos}; alimentadores sem a rede no site (só UCs diretas): {len(sem_rede)}')


if __name__ == '__main__':
    main(*sys.argv[1:3])
