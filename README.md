# bit:hub

MakeCode-bővítmény a **bit:hub** IoT-platformhoz: micro:bit-eszközök bemutatkoznak,
jelentik a mért értékeiket, és (a későbbi lépésekben) helyben futtatják a rájuk
letöltött küszöbszabályokat.

Testvérprojekt: **bit:plot** (szenzor-vizualizáció). A bit:plot mér és elemez,
a bit:hub vezérel és állapotot mutat.

## Használat

A MakeCode-ban: **Bővítmények** → illeszd be ezt a címet:

```
https://github.com/gaalben/bit-hub
```

### Eszköz (a diák micro:bitje)

A modult **névvel** választod a legördülőből (a „Add a new module…" opcióval
hozol létre újat, pl. `homerseklet`, `talaj`, `pumpa`) — sorszámot sehol nem
kell beírni, azt a MakeCode rendeli hozzá. A forrást a bejelentésnél adod meg
**egyszer**, onnantól magától olvas és jelent, ciklus nélkül:

```blocks
bithub.start(1, 1)
bithub.declareSensor(1, BitHubSensor.Temperature, BitHubSource.Builtin)
bithub.declareSensor(2, BitHubSensor.SoilMoisture, BitHubSource.AnalogP0)
```

Ha olyan értéket akarsz küldeni, amit a micro:bit nem tud magától olvasni
(pl. két szenzor különbsége), válaszd a **kézi** forrást, és add meg a
`jelentés` blokkal:

```blocks
bithub.start(1, 1)
bithub.declareSensor(1, BitHubSensor.OtherSensor, BitHubSource.Manual)
basic.forever(function () {
    bithub.report(1, input.acceleration(Dimension.X))
    basic.pause(500)
})
```

### Hub (egy külön micro:bit, USB-n a géphez kötve)

```blocks
bithub.startHub(1)
```

Egy micro:bit **vagy eszköz, vagy hub** — a kettőt ne tedd ugyanabba a programba.

## Hogyan működik

- A **szoba** a rádiócsoport (0-255). Egy szobában legfeljebb 99 eszköz lehet,
  a gyakorlati létszám 10-15.
- Az eszköz bekapcsoláskor **bemutatkozik** (`!` hello + `#` modul-deklarációk),
  amíg a hub vissza nem igazolja (`A`). Az indulási fázis az azonosítóból jön,
  hogy 15 egyszerre bekapcsolt eszköz ne egyszerre kezdjen beszélni.
- A `report` blokk **nem küld azonnal**: eltárolja az értéket, és egy háttérszál
  akkor továbbítja, ha az érték változott, vagy lejárt a maximális időköz
  (alapból 5 másodperc). Ettől bírja a rádió 15 eszközzel.
- A micro:bitnek nincs órája, ezért minden üzenet a **futásidőt** viszi magával;
  az abszolút időt az átjáró számolja belőle.

## Protokoll

A rádiócsomag miatt minden üzenet legfeljebb **19 karakter**. Teljes leírás:
a `bit-hub-terv.md` 3. fejezete.

| Jel | Jelentés | Példa |
|---|---|---|
| `!` | hello | `!7,3,142` |
| `#` | modul-deklaráció | `#7,1,tmp,i` |
| `=` | telemetria | `=7,1,23.5,148` |
| `~` | életjel | `~7,150,4` |
| `A` | nyugta (hub → eszköz) | `A7,9412` |

## Nyelvek

A blokkok **angolul és magyarul** érhetők el. A forrás angol, a magyar fordítás a
`block.loc.hu` / `jsdoc.loc.hu` annotációkban van a kód mellett — ez a megbízható
út GitHubról betöltött bővítménynél (a `_locales/` mappa elsősorban a beépített
bővítmények útja, de a teljesség kedvéért az is itt van).

**A magyar blokkfeliratokhoz a MakeCode nyelvét magyarra kell állítani**
(fogaskerék → Language → Magyar), és a bővítményt újra betölteni.

## Állapot

**0.0.1 — 1. lépés:** bemutatkozás, modul-deklaráció, jelentés, hub-mód.
Az aktuátor-vezérlés és a szabályok a 4-5. lépésben jönnek.

## Licenc

MIT
