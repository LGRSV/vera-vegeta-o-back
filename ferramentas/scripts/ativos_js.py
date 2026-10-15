"""ativos.js de cada alimentador: os ativos da linha que o mapa mostra de perto (assets/ativos-zoom.js).

python scripts/ativos_js.py <pasta do site>

Grava alimentadores/<AL>/ativos.js com window.ATIVOS = {"tr": [[código, lat, lon, trecho], ...],
"eq": [[código, tipo, lat, lon, trecho], ...]}:
  - tr: transformadores do GIS no trecho do alimentador (dados/alimentadores/<AL>.json → 'ativos_kml', só os que
    caíram num trecho; os longe da rede ficam de fora, como na NAE);
  - eq: os outros equipamentos do índice de busca (dados/ativos/*.json) que o mapa ainda não desenha: tudo menos
    poste, transformador, DJ, religador (79), fusíveis (03, 33, seccionamento, fusível no tronco) e as chaves que já
    vêm no chaves.js (88, faca 80, passagem 90/31/68); só tipo de 2 dígitos, capacitor, regulador ou chave.
Os postes não precisam de arquivo: o mapa usa as pontas dos vãos do dados.js, que já estão na página.
A página só baixa o ativos.js quando o mapa chega perto (zoom 16): abrir o alimentador não fica mais pesado.
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

JA_NO_MAPA = {'poste', 'TR', 'DJ', '79', '03', '33', 'SEC', 'FTR', '88', '80', '90', '31', '68'}
TIPO_OK = re.compile(r'^(\d\d|Capacitor|Regulador|Chave|ChaveNA)$')   # o índice tem uns tipos tortos (PR…, ETO…): ficam de fora


def le_js(p):
    s = p.read_text(encoding='utf-8')
    return json.loads(s[s.index('=') + 1:].strip().rstrip(';'))


def main(site):
    site = Path(site)
    pags = sorted(p.parent.name for p in (site / 'alimentadores').glob('*/dados.js') if (p.parent / 'index.html').exists())
    eq = defaultdict(dict)                                   # al -> {código: [código, tipo, lat, lon, trecho]}
    for f in sorted((site / 'dados' / 'ativos').glob('*.json')):
        for cod, ents in json.loads(f.read_text(encoding='utf-8')).items():
            for al, tipo, trecho, _papel, lat, lon in ents:
                if tipo not in JA_NO_MAPA and TIPO_OK.match(tipo) and lat is not None:
                    c = cod.zfill(10) if cod.isdigit() else cod   # o índice guarda sem os zeros da frente
                    eq[al].setdefault(c, [c, tipo, round(lat, 6), round(lon, 6), trecho or None])
    tot = defaultdict(int)
    for al in pags:
        j = site / 'dados' / 'alimentadores' / f'{al}.json'
        kml = json.loads(j.read_text(encoding='utf-8')).get('ativos_kml') or [] if j.exists() else []
        tr = sorted({a[0]: [a[0], round(a[3], 6), round(a[2], 6), a[4]] for a in kml if a[1] == 'TR' and a[4]}.values())
        out = {'tr': tr, 'eq': sorted(eq.get(al, {}).values())}
        (site / 'alimentadores' / al / 'ativos.js').write_text(
            'window.ATIVOS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
        tot['alimentadores'] += 1
        tot['transformadores'] += len(tr)
        tot['outros equipamentos'] += len(out['eq'])
    return dict(tot)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    print(' · '.join(f'{v} {k}' for k, v in main(sys.argv[1]).items()))
