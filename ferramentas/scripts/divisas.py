"""Divisas dos municípios e contorno do Tocantins no mapa do alimentador, sem rodar o gerador inteiro.

python scripts/divisas.py <pasta do site> <pasta com malha-TO.geojson e municipios-TO.json> [--arquivo municipios.js]

  - alimentadores/<AL>/<arquivo> (municipios.js por padrão): window.MUNICIPIOS, os municípios em volta da rede, com a
    mesma função do gerador (gera_trechos.divisas_js) e a malha do IBGE (API de malhas v3, qualidade máxima);
  - dados/tocantins.js: window.TOCANTINS = [[[lat, lon], ...], ...], o contorno do estado inteiro (malha do IBGE do
    estado, qualidade intermediária, uf-TO.geojson na mesma pasta), que o mapa desenha completo com o traço-ponto da
    divisa do TO (assets/municipios.js).
A malha vem do cache do gerador (--cache) ou da API do IBGE. Observação: o servidor do IBGE manda o certificado sem o
intermediário da Sectigo; quem baixa por fora (curl) precisa juntar o "Sectigo Public Server Authentication CA DV R36"
ao pacote de certificados.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gera_trechos as g  # noqa: E402


def contorno_uf(pasta):
    geo = json.loads((Path(pasta) / 'uf-TO.geojson').read_text(encoding='utf-8'))
    aneis = []
    for f in geo['features']:
        geom = f['geometry']
        for pol in (geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]):
            aneis += [[[round(y, 4), round(x, 4)] for x, y, *_ in anel] for anel in pol[:1]]   # só o anel de fora
    return aneis


def main(site, pasta, arquivo='municipios.js'):
    site, pasta = Path(site), Path(pasta)
    malha = g.carregar_malha(None, pasta)
    n = 0
    for c in g.carregar_dados(site):
        al = c['alimentador']
        if c['validacao']['status'] == 'falha' or not (site / 'alimentadores' / al / 'index.html').exists():
            continue
        (site / 'alimentadores' / al / arquivo).write_text(g.divisas_js(malha, c), encoding='utf-8')
        n += 1
    uf = contorno_uf(pasta)
    (site / 'dados' / 'tocantins.js').write_text(
        'window.TOCANTINS = ' + json.dumps(uf, separators=(',', ':')) + ';\n', encoding='utf-8')
    return n, sum(map(len, uf))


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) not in (2, 4) or (len(a) == 4 and a[2] != '--arquivo'):
        sys.exit(__doc__)
    n, pts = main(a[0], a[1], a[3] if len(a) == 4 else 'municipios.js')
    print(f'{n} alimentadores com divisas · contorno do Tocantins com {pts} pontos')
