"""NAE/100 km com a NAE no alimentador onde o ativo está hoje no GIS.

A Crítica lança a NAE num alimentador e o GIS às vezes tem o ativo em outro (rede transferida e cadastro
desatualizado de um dos lados). A coluna NAE continua seguindo a Crítica, mas o NAE/100 km divide pela rede
do GIS, então a NAE da conta tem que ser da mesma rede (campo nae_rede):
  nae_rede = NAE da Crítica
             - NAE cujo ativo hoje está em outro alimentador ("fora": "hoje no X")
             + NAE de outro alimentador cujo ativo hoje está aqui, se a Crítica daqui ainda não tem o mesmo
               evento (mesmo ativo, mesma hora: a Crítica às vezes lança o evento nos dois alimentadores)
             - NAE cujo ativo não está no GIS ("fora do cadastro atual"), a não ser que o ativo esteja no export
               anterior (../teste-acervo, 02/10) a até LIMITE_M de um vão de hoje: aí conta no alimentador desse vão.
               A Crítica não traz coordenada, e o código vizinho não serve de referência (chaves de número
               seguido caem no mesmo trecho só 19% das vezes).
Exemplo: AL02003097 tem 14,2 m de rede no GIS e 1 NAE no trafo 5700003097, que no GIS está no AL02003036
(T3-HY). Antes: 1 NAE / 0,0142 km = 7.042 NAE/100 km. Agora: 0 no AL02003097 e +1 no AL02003036.

Grava nae_rede em assets/ranking-nae.js (por alimentador) e em assets/ranking-polos-dados.js (por alimentador
em cada polo). No polo: a NAE que sai sai do polo onde o alimentador tem mais rede (é onde a NAE sem trecho
conta, e toda NAE com o ativo em outro alimentador está sem trecho); a que entra vai para o polo do trecho do
ativo, ou para o polo onde o alimentador tem mais rede se o ativo não tem trecho.
Antes de gravar, refaz a NAE de cada alimentador em cada polo a partir dos dados.js e para se não bater com
o que já está no arquivo. Roda depois de gerar o site; rodar de novo dá o mesmo resultado.

Uso:
  python teste/ferramentas/nae_rede.py [pasta do site]
"""
import glob
import json
import os
import math
import re
import sys
from collections import Counter, defaultdict

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../teste
LIMITE_M = 50  # ativo do cadastro anterior a mais que isso da rede de hoje não conta


def le_js(caminho):
    """window.X = {...}; -> (prefixo, objeto)"""
    with open(caminho, encoding="utf-8") as f:
        txt = f.read()
    m = re.match(r"window\.\w+\s*=\s*", txt)
    return m.group(0), json.loads(txt[m.end():].rstrip().rstrip(";"))


def grava_js(caminho, prefixo, obj):
    with open(caminho, "w", encoding="utf-8", newline="\n") as f:
        f.write(prefixo + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";\n")


def evento(o):
    return o["dia"], o["ativo"]


def cadastro_anterior(raiz):
    """Chaves do export anterior do GIS (../teste-acervo, 02/10/2026): código sem zeros à esquerda -> (lat, lon)."""
    pos = {}
    for f in glob.glob(os.path.join(os.path.dirname(os.path.abspath(raiz)), "teste-acervo", "alimentadores", "*", "dados.js")):
        d = le_js(f)[1]
        for c in d.get("principais", []) + d.get("fusiveis", []):
            if c.get("lat") is not None:
                pos.setdefault(str(c["nome"]).lstrip("0"), (c["lat"], c["lon"]))
    return pos


def vao_mais_perto(D, lat, lon):
    """(distância em m, alimentador, trecho) do vão da rede de hoje mais perto do ponto."""
    kx, ky = math.cos(math.radians(lat)) * 111320, 110540
    melhor = (math.inf, None, None)
    for al, d in D.items():
        for v in d["vaos"]:
            ax, ay, bx, by = (v[1] - lon) * kx, (v[0] - lat) * ky, (v[3] - lon) * kx, (v[2] - lat) * ky
            vx, vy = bx - ax, by - ay
            t = max(0.0, min(1.0, -(ax * vx + ay * vy) / ((vx * vx + vy * vy) or 1)))
            dist = math.hypot(ax + t * vx, ay + t * vy)
            if dist < melhor[0]:
                melhor = (dist, al, d["trechos"][v[4]]["nome"])
    return melhor


def main(raiz=RAIZ):
    D = {}
    for f in sorted(glob.glob(os.path.join(raiz, "alimentadores", "*", "dados.js"))):
        D[os.path.basename(os.path.dirname(f))] = le_js(f)[1]
    proprio = {al: {evento(o) for o in d["nae"]["oc"]} for al, d in D.items()}

    antes = cadastro_anterior(raiz)
    saem = Counter()                     # al -> NAE da Crítica daqui com o ativo hoje em outro alimentador
    entram = defaultdict(dict)           # al -> {evento: trecho do ativo aqui (ou None)}
    sem_destino, sem_ativo, achados = [], [], []
    for al, d in D.items():
        for o in d["nae"]["oc"]:
            fora = o.get("fora") or ""
            if fora == "fora do cadastro atual":
                # o ativo não está no GIS: vale o lugar do cadastro anterior se cair na rede de hoje; senão não conta
                p = antes.get(o["ativo"].lstrip("0"))
                perto = vao_mais_perto(D, *p) if p else None
                if perto and perto[0] <= LIMITE_M:
                    achados.append((al, o["dia"], o["ativo"], perto[1], perto[2], perto[0]))
                    if perto[1] == al:
                        continue
                    destino, trecho = perto[1], perto[2]
                else:
                    sem_ativo.append((al, o["dia"], o["ativo"]))
                    saem[al] += 1
                    continue
            elif fora.startswith("hoje no "):
                destino = o["hoje"][0] if o.get("hoje") else fora[len("hoje no "):].strip()
                trecho = (o.get("hoje") or [None, None])[1] or None
            else:
                continue
            if destino == al:
                continue
            if o.get("trecho"):
                sys.exit(f"{al} {o['dia']} {o['ativo']}: NAE com o ativo em {destino} mas com trecho {o['trecho']} aqui")
            saem[al] += 1
            if destino not in D:
                sem_destino.append((al, o["dia"], o["ativo"], destino))
            elif evento(o) not in proprio[destino]:
                entram[destino].setdefault(evento(o), trecho)

    # ---------- página inicial: um número por alimentador ----------
    arq_r = os.path.join(raiz, "assets", "ranking-nae.js")
    pre_r, R = le_js(arq_r)
    rede = {}
    for a in R["als"]:
        al = a["al"]
        if al not in D or a["nae"] != len(D[al]["nae"]["oc"]):
            sys.exit(f"ranking-nae.js: NAE do {al} não bate com o dados.js")
        rede[al] = a["nae_rede"] = a["nae"] - saem[al] + len(entram.get(al, {}))
    mexe = set(saem) | set(entram)
    fora_rank = sorted(al for al in mexe if al not in rede)

    # ---------- polos: um número por alimentador em cada polo ----------
    arq_p = os.path.join(raiz, "assets", "ranking-polos-dados.js")
    pre_p, P = le_js(arq_p)
    polo_do_trecho, linhas = {}, defaultdict(dict)
    for p in P["polos"]:
        for t in p.get("trs") or []:
            polo_do_trecho[(t["al"], t["t"])] = p["id"]
        for a in p["als"]:
            linhas[a["al"]][p["id"]] = a
    principal = {al: max(ps, key=lambda pid: ps[pid]["km"]) for al, ps in linhas.items()}
    polo = lambda al, trecho: (polo_do_trecho.get((al, trecho)) if trecho else None) or principal[al]

    erros = []
    for al, ps in linhas.items():
        conta = Counter(polo(al, o.get("trecho")) for o in D[al]["nae"]["oc"])
        erros += [f"{al} no polo {pid}: arquivo {a['nae']}, refeito {conta[pid]}" for pid, a in ps.items() if a["nae"] != conta[pid]]
    if erros:
        sys.exit("ranking-polos-dados.js não bate com os dados.js; nada foi gravado:\n  " + "\n  ".join(erros[:20]))

    for al, ps in linhas.items():
        chega = Counter(polo(al, t) for t in entram.get(al, {}).values())
        for pid, a in ps.items():
            a["nae_rede"] = a["nae"] - (saem[al] if pid == principal[al] else 0) + chega[pid]
    fora_polos = sorted(al for al in mexe if al not in linhas)
    difere = [al for al, ps in linhas.items() if al in rede and sum(a["nae_rede"] for a in ps.values()) != rede[al]]
    if difere:
        sys.exit("soma dos polos diferente do alimentador; nada foi gravado: " + ", ".join(difere[:20]))

    grava_js(arq_r, pre_r, R)
    grava_js(arq_p, pre_p, P)
    return saem, entram, sem_destino, fora_rank, fora_polos, sem_ativo, achados


if __name__ == "__main__":
    saem, entram, sem_destino, fora_rank, fora_polos, sem_ativo, achados = main(*sys.argv[1:2])
    print(f"NAE que saem do alimentador da Crítica: {sum(saem.values())} em {len(saem)} alimentadores")
    print(f"  ativo fora do GIS e sem lugar provável (não contam no NAE/100 km): {len(sem_ativo)}")
    for al, dia, ativo, onde, trecho, dist in achados:
        print(f"  {al} {dia} {ativo}: ativo achado no cadastro anterior, a {dist:.0f} m do {onde} {trecho}")
    print(f"Entram no alimentador do ativo: {sum(map(len, entram.values()))} em {len(entram)} alimentadores "
          "(o resto a Crítica já lança também lá)")
    for al, dia, ativo, destino in sem_destino:
        print(f"  {al} {dia} {ativo}: ativo no {destino}, que não está no site (a NAE sai e não entra em lugar nenhum)")
    if fora_rank:
        print("  fora do ranking da página inicial (alimentador bloqueado no site):", ", ".join(fora_rank))
    if fora_polos:
        print("  fora do ranking dos polos (alimentador bloqueado no site):", ", ".join(fora_polos))
