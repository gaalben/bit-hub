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
hozol létre újat, pl. `hőmérő`, `talaj`, `pumpa`) — sorszámot sehol nem kell
beírni, azt a MakeCode rendeli hozzá. A bejelentés a program elejére való,
szenzoronként egyszer; az értéket a `jelentés` blokk adja:

```blocks
bithub.start(1, 1)
bithub.declareSensor(1, BitHubSensor.Temperature)
bithub.declareSensor(2, BitHubSensor.SoilMoisture)

basic.forever(function () {
    bithub.report(1, input.temperature())
    bithub.report(2, pins.analogReadPin(AnalogPin.P0))
    basic.pause(500)
})
```

A `jelentés` blokk **nem küld azonnal**: eltárolja az értéket, és a bit:hub
akkor továbbítja, ha változott, vagy lejárt a maximális időköz (alapból
5 másodperc). Ezért nyugodtan hívható sűrűn.

A bejelentés **idempotens** — ha az „állandóan" ciklusba kerül, az sem baj.

### Aktuátorok — a felületről kapcsolhatók

A micro:bit **beépített részei** vezeték és külön kód nélkül bejelenthetők:
a hangszóró megszólal, a LED-kijelző kigyullad, ha a felületen bekapcsolják.

```blocks
bithub.start(1, 1)
bithub.declareSensor(1, BitHubSensor.Temperature)
bithub.declareBuiltIn(2, BitHubBuiltIn.Speaker)
bithub.declareBuiltIn(3, BitHubBuiltIn.Display)
```

Ha a **saját programod** kapcsol (pl. 30 fok fölött szóljon a riasztó), a
`bit:hub kapcsolás` blokkot használd — így az aktuátor átvált, ÉS a felületen
is azonnal látszik. Minden fajtára jó: ki/be (0/1), analóg (0–1023) és szervo
(0–180). Amit a bit:hub megkerülésével állítasz (`digitális írás`,
`music.ringTone`), arról a felület nem tud.

```blocks
basic.forever(function () {
    bithub.report(1, input.temperature())
    bithub.setActuator(2, input.temperature() > 30 ? 1 : 0)
    basic.pause(500)
})
```

**Egy aktuátorhoz több láb is tartozhat.** A közlekedési lámpa három LED,
mégis EGY csempe a felületen (0 = sötét, 1 = piros, 2 = sárga, 3 = zöld):

```blocks
bithub.declareTrafficLight(4, DigitalPin.P0, DigitalPin.P1, DigitalPin.P2)
bithub.setActuator(4, 3)
```

Más aktuátorhoz a `további láb` blokkal adható láb: megadod, az aktuátor
melyik értékénél legyen aktív.

Lábra kötött aktuátornál (`aktuátor bejelentése`) a bit:hub a megadott lábat
állítja. Ha ennél több kell (dallam, animáció), a `ha bit:hub parancs érkezik`
blokkban a saját kódod dönt — ilyenkor a bit:hub nem nyúl az aktuátorhoz.

A parancsra nincs külön nyugta: az eszköz az **új állapotot** jelenti vissza,
a felület ebből tudja, hogy a kapcsolás megtörtént. Az ideiglenes parancs
(pl. a hangszóró „Próba" gombja) a megadott másodperc után magától visszaáll.

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
| `*` | esemény (aktuátor új állása) | `*7,3,1,m,148` |
| `~` | életjel | `~7,150,4` |
| `>` | parancs (hub → eszköz) | `>7,3,1,3` |
| `A` | nyugta (hub → eszköz) | `A7,9412` |

## Nyelvek

A blokkok **angolul és magyarul** érhetők el. A forrás angol, a magyar fordítás a
`block.loc.hu` / `jsdoc.loc.hu` annotációkban van a kód mellett — ez a megbízható
út GitHubról betöltött bővítménynél (a `_locales/` mappa elsősorban a beépített
bővítmények útja, de a teljesség kedvéért az is itt van).

**A magyar blokkfeliratokhoz a MakeCode nyelvét magyarra kell állítani**
(fogaskerék → Language → Magyar), és a bővítményt újra betölteni.

## Állapot

**0.2.0 — 4. lépés:** bemutatkozás, modul-deklaráció, jelentés, hub-mód,
aktuátorok kézi kapcsolása (beépített hangszóró és LED-kijelző, lábra kötött
modulok, saját parancskezelő). A szabályok az 5. lépésben jönnek.

## Licenc

MIT
