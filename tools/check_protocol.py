# A bit:hub protokoll hosszellenorzese: minden uzenetnek <= 19 karakternek kell lennie.
# A MakeCode oldali fitNumber / seconds logikajanak porttja.

MAX_LINE = 19
TIME_MOD = 65536


def round_with_precision(v, digits):
    # A MakeCode Math.roundWithPrecision viselkedese: kerekites, majd
    # a felesleges nullak elhagyasa a szoveges alakban.
    m = 10 ** digits
    r = round(v * m) / m
    if r == int(r):
        return str(int(r))
    return repr(r)


def fit_number(v, max_len):
    if max_len < 1:
        return "0"
    s = round_with_precision(v, 2)
    if len(s) <= max_len:
        return s
    s = round_with_precision(v, 1)
    if len(s) <= max_len:
        return s
    s = str(int(round(v)))
    if len(s) <= max_len:
        return s
    return s[:max_len]


def rule_cond(dev, idx, inp, op, thr, hys=None):
    """R<id>,<idx>,<be>,<op><kuszob>[,<hiszterezis>] - a szamok a maradek helyre."""
    head = "R%d,%d,%d,%s" % (dev, idx, inp, op)
    if hys is None:
        return head + fit_number(thr, MAX_LINE - len(head))
    # A hiszterezis legfeljebb 4 karakter, a kuszob kapja a tobbit.
    h = fit_number(hys, 4)
    budget = MAX_LINE - len(head) - 1 - len(h)
    return head + fit_number(thr, budget) + "," + h


def telemetry(dev, slot, value, t):
    head = "=%d,%d," % (dev, slot)
    tail = ",%d" % (t % TIME_MOD)
    return head + fit_number(value, MAX_LINE - len(head) - len(tail)) + tail


CASES = []

# --- hello: !id,modulszam,ido
for dev in (1, 7, 99):
    for n in (0, 3, 8):
        for t in (0, 999, 65535):
            CASES.append(("hello", "!%d,%d,%d" % (dev, n, t % TIME_MOD)))

# --- modul-deklaracio: #id,slot,tipus,irany[,p]
for dev in (1, 99):
    for slot in (1, 8):
        for code in ("tmp", "soi", "mtx", "oth"):
            for d in ("i", "o", "a", "v"):
                CASES.append(("decl", "#%d,%d,%s,%s" % (dev, slot, code, d)))
                CASES.append(("decl+p", "#%d,%d,%s,%s,p" % (dev, slot, code, d)))

# --- telemetria: a legrosszabb ertekekkel
VALUES = [0, 1, -1, 0.5, -0.5, 23.456, -123.456, 999.99, -999.99,
          123456.789, -123456.789, 9999999, -9999999, 0.001, -0.001]
for dev in (1, 7, 99):
    for slot in (1, 8):
        for v in VALUES:
            for t in (0, 65535):
                CASES.append(("telem", telemetry(dev, slot, v, t)))

# --- eletjel: ~id,ido,szabalyverzio
for dev in (1, 99):
    for t in (0, 65535):
        for rv in (0, 999):
            CASES.append(("hb", "~%d,%d,%d" % (dev, t % TIME_MOD, rv)))

# --- nyugta (hub -> eszkoz): Aid,ido
for dev in (1, 99):
    for t in (0, 65535):
        CASES.append(("ack", "A%d,%d" % (dev, t % TIME_MOD)))

# --- a 4-5. lepes uzenetei (elore ellenorizve, hogy kesobb ne torjon el)
for dev in (1, 99):
    for slot in (1, 8):
        for val in (0, 1, 180, 1023):
            for hold in (0, 300, 65535):
                CASES.append(("cmd", ">%d,%d,%d,%d" % (dev, slot, val, hold)))
# A szabaly KET uzenet: R = feltetel, Q = akcio.
# Egyben nem fer bele 19 karakterbe, es igy bovitheto is (hiszterezis).
for dev in (1, 99):
    for idx in (0, 7):
        for inp in (1, 8):
            for op in (">", "<"):
                for thr in (25, -40.5, 1023, -999.99):
                    CASES.append(("rule-cond", rule_cond(dev, idx, inp, op, thr)))
                    for hys in (0.5, 10):
                        CASES.append(("rule-cond+h",
                                      rule_cond(dev, idx, inp, op, thr, hys)))
        for out in (1, 8):
            for ov in (0, 1, 180, 1023):
                CASES.append(("rule-act", "Q%d,%d,%d,%d" % (dev, idx, out, ov)))
for dev in (1, 99):
    for slot in (1, 8):
        for mode in ("h", "t", "o"):
            CASES.append(("mode", "M%d,%d,%s" % (dev, slot, mode)))

bad = [(k, s) for (k, s) in CASES if len(s) > MAX_LINE]

print("Ellenorzott uzenetek:", len(CASES))
print("Leghosszabb:", max(CASES, key=lambda x: len(x[1])))
if bad:
    print("\n!!! TUL HOSSZU (%d db):" % len(bad))
    seen = set()
    for k, s in bad:
        if k not in seen:
            seen.add(k)
            print("   [%s] %r -> %d karakter" % (k, s, len(s)))
else:
    print("\nOK - minden uzenet belefer %d karakterbe." % MAX_LINE)

# Pelda-kimenet emberi ellenorzeshez
print("\nMintak:")
for s in ["!7,3,142", "#7,1,tmp,i", "#7,3,rly,o,p",
          telemetry(7, 1, 23.456, 148), telemetry(99, 8, -123456.789, 65535),
          telemetry(99, 8, 9999999, 65535),
          "~7,150,4", "A7,9412"]:
    print("   %-22r %d" % (s, len(s)))
