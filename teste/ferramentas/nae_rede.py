"""NAE/100 km com a NAE no alimentador onde o ativo está hoje no GIS.

A Crítica lança a NAE num alimentador e o GIS às vezes tem o ativo em outro (rede transferida e cadastro
desatualizado de um dos lados). A coluna NAE continua seguindo a Crítica, mas o NAE/100 km divide pela rede
do GIS, então a NAE da conta tem que ser da mesma rede (campo nae_rede):
  nae_rede = NAE da Crítica
             - NAE cujo ativo hoje está em outro alimentador ("fora": "hoje no X")
             + NAE de outro alimentador cujo ativo hoje está aqui, se a Crítica daqui ainda não tem o mesmo
               evento (mesmo ativo, mesma hora: a Crítica às vezes lança o evento nos dois alimentadores)
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
import re
import sys
from collections import Counter, defaultdict

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../teste


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


def main(raiz=RAIZ):
    D = {}
    for f in sorted(glob.glob(os.path.join(raiz, "alimentadores", "*", "dados.js"))):
        D[os.path.basename(os.path.dirname(f))] = le_js(f)[1]
    proprio = {al: {evento(o) for o in d["nae"]["oc"]} for al, d in D.items()}

    saem = Counter()                     # al -> NAE da Crítica daqui com o ativo hoje em outro alimentador
    entram = defaultdict(dict)           # al -> {evento: trecho do ativo aqui (ou None)}
    sem_destino = []
    for al, d in D.items():
        for o in d["nae"]["oc"]:
            fora = o.get("fora") or ""
            if not fora.startswith("hoje no "):
                continue
            destino = o["hoje"][0] if o.get("hoje") else fora[len("hoje no "):].strip()
            if destino == al:
                continue
            if o.get("trecho"):
                sys.exit(f"{al} {o['dia']} {o['ativo']}: NAE com o ativo em {destino} mas com trecho {o['trecho']} aqui")
            saem[al] += 1
            if destino not in D:
                sem_destino.append((al, o["dia"], o["ativo"], destino))
            elif evento(o) not in proprio[destino]:
                entram[destino].setdefault(evento(o), (o.get("hoje") or [None, None])[1] or None)

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
    return saem, entram, sem_destino, fora_rank, fora_polos


if __name__ == "__main__":
    saem, entram, sem_destino, fora_rank, fora_polos = main(*sys.argv[1:2])
    print(f"NAE com o ativo hoje em outro alimentador: {sum(saem.values())} em {len(saem)} alimentadores")
    print(f"Entram no alimentador do ativo: {sum(map(len, entram.values()))} em {len(entram)} alimentadores "
          "(o resto a Crítica já lança também lá)")
    for al, dia, ativo, destino in sem_destino:
        print(f"  {al} {dia} {ativo}: ativo no {destino}, que não está no site (a NAE sai e não entra em lugar nenhum)")
    if fora_rank:
        print("  fora do ranking da página inicial (alimentador bloqueado no site):", ", ".join(fora_rank))
    if fora_polos:
        print("  fora do ranking dos polos (alimentador bloqueado no site):", ", ".join(fora_polos))
