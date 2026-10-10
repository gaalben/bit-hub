// bit:hub — eszköz-oldal.
//
// Ezt futtatja a diák micro:bitje. Három dolgot csinál:
//   1. bemutatkozik (hello + modul-deklarációk), amíg a hub vissza nem igazolja
//   2. jelenti a mért értékeket — de csak akkor, ha VÁLTOZTAK, vagy lejárt a
//      maximális időköz (report by exception: ettől bírja a rádió 15 eszközzel)
//   3. életjelet ad, ha sokáig nincs más forgalma
//   4. végrehajtja a felületről jövő parancsot (>), és az új állapotot
//      eseménnyel (*) azonnal visszajelzi — ez egyben a parancs nyugtája
//
// A szabályok az 5. lépésben kerülnek ide.

/**
 * bit:hub — IoT devices with the micro:bit.
 */
//% color=#9a4f28 icon="\uf1eb" block="bit:hub"
//% jsdoc.loc.hu="bit:hub — IoT-eszközök micro:bittel."
//% groups='["Setup", "Modules", "Sending", "Hub"]'
namespace bithub {

    class Module {
        slot: number
        code: string
        dir: string          // i | o | a | v
        needsPower: boolean
        pin: number
        value: number
        sentValue: number
        sentAt: number
        minChange: number
        maxIntervalMs: number
        hasValue: boolean
        holdUntil: number    // ideiglenes parancs lejárta (futásidő, ms); 0 = nincs
        holdBack: number     // az érték, amire a lejártakor visszaáll
        builtIn: number      // BitHubBuiltIn, ha a micro:bit beépített része; 0 = nem az
        pins: number[]       // további lábak (pl. a közlekedési lámpa három LED-je)
        pinValues: number[]  // melyik láb melyik értéknél aktív
        progSet: boolean     // a program kapcsolta-e már (bithub.setActuator)
        progValue: number    // a program legutóbbi döntése

        constructor(slot: number, code: string, dir: string) {
            this.slot = slot
            this.code = code
            this.dir = dir
            this.needsPower = false
            this.pin = -1
            this.value = 0
            this.sentValue = 0
            this.sentAt = 0
            this.minChange = 0
            this.maxIntervalMs = DEFAULT_MAX_INTERVAL_MS
            this.hasValue = false
            this.holdUntil = 0
            this.holdBack = 0
            this.builtIn = 0
            this.pins = []
            this.pinValues = []
            this.progSet = false
            this.progValue = 0
        }
    }

    let _deviceId = 0
    let _room = 1
    let _running = false
    let _acked = false
    let _lastTxAt = 0
    let _rulesVersion = 0
    let _modules: Module[] = []
    // Parancskezelők, modulhelyenként. Külön listában, hogy a "ha parancs
    // érkezik" blokk a bejelentés ELŐTT is állhasson a programban.
    let _cmdSlots: number[] = []
    let _cmdHandlers: ((value: number) => void)[] = []

    // --- belső segédek ---------------------------------------------------

    function findModule(slot: number): Module {
        for (let i = 0; i < _modules.length; i++) {
            if (_modules[i].slot == slot) return _modules[i]
        }
        return null
    }

    function addModule(slot: number, code: string, dir: string,
                       needsPower: boolean, pin: number): void {
        slot = Math.round(slot)
        // A slot egy jegyű marad, hogy a 19 karakteres keret ne szakadjon
        // szét. Korábban itt csendes csonkolás volt — az két modult
        // ugyanarra a helyre tett volna, némán. Most inkább látszik.
        if (slot < 1 || slot > MAX_MODULES) {
            basic.showString("?", 60)
            return
        }
        let m = findModule(slot)
        if (!m && _modules.length >= MAX_MODULES) {
            basic.showString("?", 60)
            return
        }

        // IDEMPOTENS: ugyanazt a bejelentést akárhányszor meg lehet ismételni.
        // Ez azért fontos, mert a diákok gyakran az "állandóan" ciklusba
        // teszik a bejelentést — ha minden kör újraindítaná a bemutatkozást,
        // az eszköz sosem jutna el a jelentésig.
        let changed = false
        if (!m) {
            m = new Module(slot, code, dir)
            if (dir != "i") {
                // Az aktuátor állását is jelentjük: egyszer rögtön a nyugta
                // után (hogy a csempén ne "nincs jel" álljon), aztán ritkán,
                // hogy egy elveszett esemény se ragadjon be a felületen.
                m.hasValue = true
                m.maxIntervalMs = ACTUATOR_REFRESH_MS
                m.sentAt = 0 - ACTUATOR_REFRESH_MS
            }
            _modules.push(m)
            changed = true
        } else if (m.code != code || m.dir != dir) {
            m.code = code
            m.dir = dir
            changed = true
        }
        if (m.needsPower != needsPower) {
            m.needsPower = needsPower
            changed = true
        }
        m.pin = pin

        // Csak VALÓDI változásnál jelentkezünk be újra, különben a szerver
        // nem tudna az új modulról.
        if (changed) _acked = false
    }

    /** Egy sor kiküldése rádión, a 19 karakteres kerettel. */
    function tx(line: string): void {
        if (line.length > MAX_LINE) line = line.substr(0, MAX_LINE)
        radio.sendString(line)
        _lastTxAt = input.runningTime()
    }

    // --- aktuátorok ------------------------------------------------------

    function findHandler(slot: number): (value: number) => void {
        for (let i = 0; i < _cmdSlots.length; i++) {
            if (_cmdSlots[i] == slot) return _cmdHandlers[i]
        }
        return null
    }

    /**
     * Az aktuátor tényleges meghajtása. Ha a diák adott "ha parancs érkezik"
     * blokkot, AZ dönt; különben a micro:bit beépített részét (hangszóró,
     * LED-kijelző) vagy a bejelentett lábat állítjuk.
     */
    function drive(m: Module): void {
        const handler = findHandler(m.slot)
        if (handler) {
            // Külön szálon: a diák kódja akár dallamot is játszhat, attól
            // a rádió vétele nem állhat meg.
            const v = m.value
            control.inBackground(function () {
                handler(v)
            })
            return
        }
        if (m.builtIn == BitHubBuiltIn.Speaker) {
            // Folyamatos hang, amíg ki nem kapcsolják; 0 Hz = csend.
            // (Beépített hangszóró csak a v2-n van; v1-en a hang a P0-ra megy.)
            music.ringTone(m.value > 0 ? BUILTIN_TONE_HZ : 0)
            return
        }
        if (m.builtIn == BitHubBuiltIn.Display) {
            // Nem ikont rajzolunk: a showIcon várakozik, és addig a parancs
            // nyugtája sem menne ki.
            if (m.value > 0) {
                for (let x = 0; x < 5; x++) {
                    for (let y = 0; y < 5; y++) led.plot(x, y)
                }
            } else {
                basic.clearScreen()
            }
            return
        }
        // További lábak: mindegyik akkor aktív, amikor az aktuátor értéke
        // épp az övé (közlekedési lámpa: 1 = piros, 2 = sárga, 3 = zöld).
        for (let i = 0; i < m.pins.length; i++) {
            pins.digitalWritePin(m.pins[i], m.value == m.pinValues[i] ? 1 : 0)
        }
        if (m.pin < 0) return
        if (m.dir == "o") {
            pins.digitalWritePin(m.pin, m.value > 0 ? 1 : 0)
        } else if (m.dir == "a") {
            pins.analogWritePin(m.pin, Math.constrain(Math.round(m.value), 0, 1023))
        } else if (m.dir == "v") {
            pins.servoWritePin(m.pin, Math.constrain(Math.round(m.value), 0, 180))
        }
    }

    /**
     * Aktuátor átállítása + esemény AZONNAL (nem várja az ütemet).
     * A parancsra nincs külön nyugta: az új állapot jelentése a nyugta.
     * Ok: m = kézi parancs, t = ideiglenes parancs lejárt, p = az eszköz
     * saját programja kapcsolta.
     */
    function applyActuator(m: Module, value: number, reason: string): void {
        m.value = value
        drive(m)
        sendEvent(m, reason)
    }

    /** Az aktuátor mostani állása eseményként (*), a megadott okkal. */
    function sendEvent(m: Module, reason: string): void {
        const head = "*" + _deviceId + "," + m.slot + ","
        const tail = "," + reason + "," + seconds()
        tx(head + fitNumber(m.value, MAX_LINE - head.length - tail.length) + tail)
        m.sentValue = m.value
        m.sentAt = input.runningTime()
    }

    // --- bejövő üzenetek -------------------------------------------------

    function onRadioString(received: string): void {
        if (!_running || received.length < 2) return
        const kind = received.charAt(0)
        const parts = split(received.substr(1, received.length - 1), ",")
        if (parts.length < 1) return
        if (parseInt(parts[0]) != _deviceId) return   // nem nekünk szól

        if (kind == "A") {
            // A<id>,<szerveridő> — a hub vette a bemutatkozásunkat
            _acked = true
        } else if (kind == ">") {
            // ><id>,<slot>,<érték>,<tartás_mp> — kézi parancs a felületről.
            // Ha a tartás nem nulla, ennyi másodperc múlva visszaáll a
            // korábbi értékre (pl. tűzjelző-próba: 3 mp-ig szól, aztán csend).
            if (parts.length < 3) return
            const m = findModule(parseInt(parts[1]))
            if (!m || m.dir == "i") return
            const value = parseFloat(parts[2])
            if (isNaN(value)) return
            const hold = parts.length > 3 ? parseInt(parts[3]) : 0
            // Futó ideiglenes parancs alatt az EREDETI értéket őrizzük meg,
            // különben az ismételt próba "bekapcsolva" állapotra állna vissza.
            if (m.holdUntil == 0) m.holdBack = m.value
            m.holdUntil = hold > 0 ? input.runningTime() + hold * 1000 : 0
            applyActuator(m, value, "m")
        }
        // Az R, Q, M, X üzenetek az 5-6. lépésben kerülnek ide.
    }

    // --- háttérszálak ----------------------------------------------------

    /**
     * Bemutatkozás, amíg a hub nem nyugtázza.
     * Az indulási fázis az eszköz azonosítójából jön: 15 eszköz egyszerre
     * bekapcsolva így nem egyszerre kezd beszélni. A visszalépő újrapróbálás
     * (2 s → 30 s) azt akadályozza meg, hogy hub nélkül teleszemeteljük az étert.
     */
    function announceLoop(): void {
        basic.pause((_deviceId * 137) % 2000)
        let attempt = 0
        while (_running) {
            if (_acked) {
                basic.pause(500)
                attempt = 0
                continue
            }
            attempt = attempt + 1
            tx("!" + _deviceId + "," + _modules.length + "," + seconds())
            basic.pause(300)
            // A deklarációk MINDIG kimennek a hello után, akkor is, ha közben
            // megjött a nyugta. A hub ezredmásodpercek alatt nyugtáz, tehát a
            // "csak nyugta nélkül" feltétellel a modulok típusa SOSEM jutott el
            // a felületre — minden csempe "egyéb" lett.
            for (let i = 0; i < _modules.length; i++) {
                const m = _modules[i]
                let line = "#" + _deviceId + "," + m.slot + "," + m.code + "," + m.dir
                if (m.needsPower) line = line + ",p"
                tx(line)
                basic.pause(120)
            }
            basic.pause(Math.min(30000, 2000 * attempt))
        }
    }

    /**
     * Jelentés: változásra vagy lejárt időközre. Nem a diák ciklusa küld —
     * ez a szál dönt, így a rádióterhelés akkor is kordában marad, ha a diák
     * programja szorosan pörög.
     */
    function reportLoop(): void {
        while (_running) {
            basic.pause(100)
            const now = input.runningTime()
            // Lejárt ideiglenes parancsok — ez a hubtól függetlenül is fut:
            // a szóló zsongor akkor is elhallgat, ha közben megszakadt a kapcsolat.
            for (let i = 0; i < _modules.length; i++) {
                const m = _modules[i]
                if (m.holdUntil > 0 && now >= m.holdUntil) {
                    m.holdUntil = 0
                    applyActuator(m, m.holdBack, "t")
                }
            }
            if (!_acked) continue
            for (let i = 0; i < _modules.length; i++) {
                const m = _modules[i]
                if (!m.hasValue) continue
                // A program által állított aktuátor (pl. potméterrel hajtott
                // motor) folyamatosan változhat: a legfrissebb állását
                // eseményként küldjük, de ritkítva, hogy a rádió bírja.
                if (m.dir != "i" && m.value != m.sentValue
                    && Math.abs(m.value - m.sentValue) >= m.minChange
                    && now - m.sentAt >= ACTUATOR_MIN_EVENT_MS) {
                    sendEvent(m, "p")
                    basic.pause(Math.randomRange(10, 40))   // ütközés-jitter
                    continue
                }
                const changed = m.value != m.sentValue
                    && Math.abs(m.value - m.sentValue) >= m.minChange
                const overdue = now - m.sentAt >= m.maxIntervalMs
                if (changed || overdue) {
                    // A számnak annyi hely jut, amennyi a keretből marad.
                    const head = "=" + _deviceId + "," + m.slot + ","
                    const tail = "," + seconds()
                    tx(head + fitNumber(m.value, MAX_LINE - head.length - tail.length)
                        + tail)
                    m.sentValue = m.value
                    m.sentAt = input.runningTime()
                    basic.pause(Math.randomRange(10, 40))   // ütközés-jitter
                }
            }
            if (input.runningTime() - _lastTxAt >= HEARTBEAT_MS) {
                tx("~" + _deviceId + "," + seconds() + "," + _rulesVersion)
            }
        }
    }

    // --- blokkok ---------------------------------------------------------

    /**
     * A modulok legördülője. A diák elnevezi a modult ("homerseklet",
     * "talaj", "pumpa"), a MakeCode pedig sorszámot rendel hozzá 1-től —
     * ez lesz a protokoll slot-mezője. Így a számot sehol nem kell kézzel
     * beírni: a bejelentésnél és a jelentésnél is a NEVE látszik.
     *
     * A "Add a new module..." opció a legördülő alján hoz létre újat.
     */
    //% shim=ENUM_GET
    //% blockId=bithub_module_shim
    //% block="module $arg"
    //% block.loc.hu="modul $arg"
    //% enumName="BitHubModules"
    //% enumMemberName="module"
    //% enumPromptHint="e.g. temperature, soil, pump ..."
    //% enumPromptHint.loc.hu="pl. homerseklet, talaj, pumpa ..."
    //% enumInitialMembers="sensor1"
    //% enumStartValue=1
    //% blockHidden=true
    export function _moduleEnumShim(arg: number): number {
        return arg
    }

    /**
     * Starts the bit:hub device: sets up the radio and begins announcing itself.
     * The device number must be unique within the room — two devices with the
     * same number would write to the same tile on the dashboard.
     * @param device the device number within the room, 1-99
     * @param room the room (radio group), 0-255
     */
    //% blockId=bithub_start
    //% block="bit:hub start | device number %device | room %room"
    //% block.loc.hu="bit:hub indítása | eszköz sorszáma %device | szoba %room"
    //% jsdoc.loc.hu="Elindítja a bit:hub eszközt: beállítja a rádiót és elkezd bemutatkozni. Az eszköz sorszámának a szobán belül egyedinek kell lennie — két azonos sorszámú eszköz ugyanarra a csempére írna."
    //% device.loc.hu="az eszköz sorszáma a szobán belül, 1-99"
    //% room.loc.hu="a szoba (rádiócsoport), 0-255"
    //% device.min=1 device.max=99 device.defl=1
    //% room.min=0 room.max=255 room.defl=1
    //% weight=100 blockGap=8
    //% group="Setup"
    export function start(device: number, room: number): void {
        if (_running) return
        _deviceId = Math.constrain(Math.round(device), 1, 99)
        _room = Math.constrain(Math.round(room), 0, 255)
        radio.setGroup(_room)
        radio.setTransmitPower(7)
        radio.onReceivedString(onRadioString)
        _running = true
        control.inBackground(announceLoop)
        control.inBackground(reportLoop)
    }

    /**
     * True if the hub has acknowledged our announcement.
     * Useful for showing an icon so the student can see whether we are in.
     */
    //% blockId=bithub_connected
    //% block="bit:hub connected"
    //% block.loc.hu="bit:hub csatlakozva"
    //% jsdoc.loc.hu="Igaz, ha a hub már nyugtázta a bemutatkozásunkat. Jó ikont rajzolni vele, hogy a diák lássa: bent vagyunk-e a rendszerben."
    //% weight=95
    //% group="Setup"
    export function connected(): boolean {
        return _acked
    }

    /**
     * Announces a sensor. This is what makes its tile appear on the dashboard.
     * Put it at the start, once per sensor; the values come from the report
     * block. Repeating the same announcement is harmless.
     * @param slot which module
     * @param kind the sensor type
     */
    //% blockId=bithub_declare_sensor
    //% block="announce sensor | %slot | type %kind"
    //% block.loc.hu="szenzor bejelentése | %slot | típus %kind"
    //% jsdoc.loc.hu="Bejelent egy szenzort. A felületen ettől jelenik meg a csempéje. A program elejére való, szenzoronként egyszer; az értéket a jelentés blokk adja. Ugyanazt a bejelentést megismételni ártalmatlan."
    //% slot.loc.hu="melyik modul (a legördülőből, vagy hozz létre újat)"
    //% kind.loc.hu="a szenzor típusa"
    //% slot.shadow="bithub_module_shim"
    //% weight=90 blockGap=8
    //% group="Modules"
    export function declareSensor(slot: number, kind: BitHubSensor): void {
        addModule(slot, sensorCode(kind), "i", false, -1)
    }

    /**
     * Announces an actuator. The dashboard shows the "needs external power"
     * flag on the tile — a motor or pump cannot run off a micro:bit pin.
     * @param slot the module position on the device, 1-8
     * @param kind the actuator type
     * @param pin which pin it is wired to
     * @param power true if it needs an external power supply
     */
    //% blockId=bithub_declare_actuator
    //% block="announce actuator | %slot | type %kind | pin %pin | needs external power %power"
    //% block.loc.hu="aktuátor bejelentése | %slot | típus %kind | láb %pin | külső táp kell %power"
    //% jsdoc.loc.hu="Bejelent egy aktuátort. A „külső táp kell” jelzést a felület kiírja a csempére — motor és pumpa a micro:bit lábáról közvetlenül NEM megy."
    //% slot.loc.hu="melyik modul (a legördülőből, vagy hozz létre újat)"
    //% kind.loc.hu="az aktuátor típusa"
    //% pin.loc.hu="melyik lábon van"
    //% power.loc.hu="igaz, ha külső tápot igényel"
    //% slot.shadow="bithub_module_shim"
    //% power.shadow="toggleYesNo"
    //% weight=85 blockGap=8
    //% group="Modules"
    export function declareActuator(slot: number, kind: BitHubActuator,
                                    pin: DigitalPin, power: boolean): void {
        addModule(slot, actuatorCode(kind), actuatorDir(kind), power, pin)
    }

    /**
     * Announces a built-in part of the micro:bit as an actuator, so it can be
     * switched from the dashboard: the speaker sounds a tone, the LED display
     * lights up. No wiring and no extra code is needed.
     * @param slot which module
     * @param what which built-in part of the micro:bit
     */
    //% blockId=bithub_declare_builtin
    //% block="announce built-in actuator | %slot | %what"
    //% block.loc.hu="beépített aktuátor bejelentése | %slot | %what"
    //% jsdoc.loc.hu="Bejelenti a micro:bit egy beépített részét aktuátorként, hogy a felületről kapcsolni lehessen: a hangszóró megszólal, a LED-kijelző kigyullad. Nem kell hozzá se vezeték, se külön kód."
    //% slot.loc.hu="melyik modul (a legördülőből, vagy hozz létre újat)"
    //% what.loc.hu="a micro:bit melyik beépített része"
    //% slot.shadow="bithub_module_shim"
    //% weight=84 blockGap=8
    //% group="Modules"
    export function declareBuiltIn(slot: number, what: BitHubBuiltIn): void {
        addModule(slot, what == BitHubBuiltIn.Speaker ? "buz" : "mtx", "o", false, -1)
        const m = findModule(Math.round(slot))
        if (m) m.builtIn = what
    }

    /**
     * Announces a traffic light: three LEDs on three pins, shown as ONE tile
     * on the dashboard. Its value is 0 = dark, 1 = red, 2 = yellow, 3 = green.
     * @param slot which module
     * @param red the pin of the red LED
     * @param yellow the pin of the yellow LED
     * @param green the pin of the green LED
     */
    //% blockId=bithub_declare_traffic_light
    //% block="announce traffic light | %slot | red %red | yellow %yellow | green %green"
    //% block.loc.hu="közlekedési lámpa bejelentése | %slot | piros %red | sárga %yellow | zöld %green"
    //% jsdoc.loc.hu="Bejelent egy közlekedési lámpát: három LED három lábon, a felületen EGY csempeként. Az értéke 0 = sötét, 1 = piros, 2 = sárga, 3 = zöld."
    //% slot.loc.hu="melyik modul (a legördülőből, vagy hozz létre újat)"
    //% red.loc.hu="a piros LED lába"
    //% yellow.loc.hu="a sárga LED lába"
    //% green.loc.hu="a zöld LED lába"
    //% slot.shadow="bithub_module_shim"
    //% red.defl=DigitalPin.P0 yellow.defl=DigitalPin.P1 green.defl=DigitalPin.P2
    //% weight=83 blockGap=8
    //% group="Modules"
    export function declareTrafficLight(slot: number, red: DigitalPin,
                                        yellow: DigitalPin, green: DigitalPin): void {
        addModule(slot, "tlt", "o", false, -1)
        addPin(slot, red, 1)
        addPin(slot, yellow, 2)
        addPin(slot, green, 3)
    }

    /**
     * Adds one more pin to an actuator. The pin is on while the actuator has
     * the given value and off otherwise — so one actuator can drive several
     * pins. Announce the actuator first.
     * @param slot which actuator
     * @param pin the extra pin
     * @param value the actuator value at which this pin is on; eg: 1
     */
    //% blockId=bithub_add_pin
    //% block="add pin | to %slot | pin %pin | on at value %value"
    //% block.loc.hu="további láb | ehhez: %slot | láb %pin | ennél az értéknél aktív %value"
    //% jsdoc.loc.hu="Még egy lábat ad egy aktuátorhoz. A láb akkor aktív, amikor az aktuátor értéke a megadott érték, különben kikapcsol — így egy aktuátor több lábat is hajthat. Előbb jelentsd be az aktuátort."
    //% slot.loc.hu="melyik aktuátor (a legördülőből)"
    //% pin.loc.hu="a további láb"
    //% value.loc.hu="az aktuátor melyik értékénél legyen aktív ez a láb"
    //% slot.shadow="bithub_module_shim"
    //% weight=82 blockGap=8
    //% group="Modules"
    export function addPin(slot: number, pin: DigitalPin, value: number): void {
        const m = findModule(Math.round(slot))
        if (!m || m.dir == "i") {
            basic.showString("?", 60)
            return
        }
        // IDEMPOTENS, ahogy a bejelentés is: ciklusban sem halmozódik.
        for (let i = 0; i < m.pins.length; i++) {
            if (m.pins[i] == pin) {
                m.pinValues[i] = value
                return
            }
        }
        m.pins.push(pin)
        m.pinValues.push(value)
        pins.digitalWritePin(pin, m.value == value ? 1 : 0)
    }

    /**
     * Sets an actuator from your own program and reports the new state to
     * the dashboard right away. Works for every kind: on/off, analog (PWM)
     * and servo. Safe to call in a loop: it only acts when the value changes.
     * @param slot which actuator
     * @param value on/off: 0 or 1; analog: 0-1023; servo: 0-180 degrees; traffic light: 0-3; eg: 1
     */
    //% blockId=bithub_set_actuator
    //% block="bit:hub set | %slot | to %value"
    //% block.loc.hu="bit:hub kapcsolás | %slot | értéke %value"
    //% jsdoc.loc.hu="A saját programodból állít egy aktuátort, és az új állapotot rögtön jelenti a felületnek. Minden fajtára jó: ki/be, analóg (PWM) és szervo. Nyugodtan hívható ciklusban: csak akkor tesz bármit, ha a kért érték megváltozik."
    //% slot.loc.hu="melyik aktuátor (a legördülőből)"
    //% value.loc.hu="ki/be: 0 vagy 1; analóg: 0-1023; szervo: 0-180 fok; közlekedési lámpa: 0-3"
    //% slot.shadow="bithub_module_shim"
    //% weight=81 blockGap=8
    //% group="Modules"
    export function setActuator(slot: number, value: number): void {
        const m = findModule(Math.round(slot))
        if (!m || m.dir == "i") {
            basic.showString("?", 60)
            return
        }
        // A program ÉLRE kapcsol: amíg a döntése nem változik, nem ír felül
        // semmit. Így a felületről adott kézi parancs megmarad a program
        // következő váltásáig, akkor is, ha ez a blokk ciklusban fut.
        if (m.progSet && m.progValue == value) return
        m.progSet = true
        m.progValue = value
        if (m.holdUntil > 0) {
            // Ideiglenes kézi parancs fut: annak lejártakor erre áll vissza.
            m.holdBack = value
            return
        }
        if (m.value == value) return
        // A lábat AZONNAL állítjuk; a jelentést ritkítjuk. Ha az előző
        // esemény óta túl kevés idő telt el, a jelentő szál küldi el a
        // legfrissebb állást — így egy folyamatosan változó analóg érték
        // sem árasztja el a rádiót.
        m.value = value
        drive(m)
        if (input.runningTime() - m.sentAt >= ACTUATOR_MIN_EVENT_MS) {
            sendEvent(m, "p")
        }
    }

    /**
     * Runs your code when a command for this actuator arrives from the
     * dashboard — for when switching a pin is not enough (a melody, an
     * animation). If an actuator has this block, bit:hub does not drive it itself.
     * @param slot which module the command is for
     * @param handler the code to run; value is the commanded value
     */
    //% blockId=bithub_on_command
    //% block="on bit:hub command | for %slot"
    //% block.loc.hu="ha bit:hub parancs érkezik | ide: %slot"
    //% jsdoc.loc.hu="Lefuttatja a kódodat, ha a felületről parancs érkezik erre az aktuátorra. Akkor kell, ha egy láb kapcsolása kevés (dallam, animáció). Ha egy aktuátorhoz van ilyen blokk, azt a bit:hub nem állítja magától."
    //% slot.loc.hu="melyik modulnak szól a parancs (a legördülőből)"
    //% slot.shadow="bithub_module_shim"
    //% draggableParameters="reporter"
    //% weight=79 blockGap=8
    //% group="Modules"
    export function onCommand(slot: number, handler: (value: number) => void): void {
        slot = Math.round(slot)
        for (let i = 0; i < _cmdSlots.length; i++) {
            if (_cmdSlots[i] == slot) {
                _cmdHandlers[i] = handler
                return
            }
        }
        _cmdSlots.push(slot)
        _cmdHandlers.push(handler)
    }

    /**
     * Gives a sensor its latest value. It is not sent immediately: bit:hub
     * forwards it when the value has changed or the maximum interval elapsed.
     * So it is safe to call often, inside a loop.
     * @param slot which module the value belongs to
     * @param value the measured value
     */
    //% blockId=bithub_report
    //% block="bit:hub report | %slot | value %value"
    //% block.loc.hu="bit:hub jelentés | %slot | érték %value"
    //% jsdoc.loc.hu="Megadja egy szenzor friss értékét. Nem küld azonnal: a bit:hub akkor továbbítja, ha az érték változott, vagy lejárt a maximális időköz. Ezért nyugodtan hívható sűrűn, ciklusban."
    //% slot.loc.hu="melyik modul értéke (a legördülőből)"
    //% value.loc.hu="a mért érték"
    //% slot.shadow="bithub_module_shim"
    //% weight=80 blockGap=8
    //% group="Sending"
    export function report(slot: number, value: number): void {
        const m = findModule(slot)
        if (!m) {
            // Nem bejelentett helyre jelentettünk — elgépelt helyszám.
            // Korábban ez NÉMÁN eldobódott; most látszik a kijelzőn.
            basic.showString("?", 60)
            return
        }
        m.value = value
        m.hasValue = true
    }

    /**
     * Fine-tunes how often a module reports.
     * @param slot which module
     * @param minChange the value must change this much to be sent at once; eg: 0.5
     * @param maxSeconds report at least this often even without a change
     */
    //% blockId=bithub_set_reporting
    //% block="bit:hub reporting | %slot | on change of %minChange | at least every %maxSeconds s"
    //% block.loc.hu="bit:hub jelentési ütem | %slot | küldés ennyi változásra %minChange | legalább ennyi másodpercenként %maxSeconds"
    //% jsdoc.loc.hu="Finomhangolja, milyen sűrűn jelent egy modul."
    //% slot.loc.hu="melyik modul"
    //% minChange.loc.hu="ennyivel kell változnia, hogy azonnal menjen"
    //% maxSeconds.loc.hu="ennyi másodpercenként akkor is jelent, ha nem változott"
    //% slot.shadow="bithub_module_shim"
    //% maxSeconds.min=1 maxSeconds.max=300 maxSeconds.defl=5
    //% weight=70
    //% advanced=true group="Sending"
    export function setReporting(slot: number, minChange: number,
                                 maxSeconds: number): void {
        const m = findModule(slot)
        if (!m) return
        m.minChange = Math.abs(minChange)
        m.maxIntervalMs = Math.constrain(Math.round(maxSeconds), 1, 300) * 1000
    }
}
