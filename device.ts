// bit:hub — eszköz-oldal.
//
// Ezt futtatja a diák micro:bitje. Három dolgot csinál:
//   1. bemutatkozik (hello + modul-deklarációk), amíg a hub vissza nem igazolja
//   2. jelenti a mért értékeket — de csak akkor, ha VÁLTOZTAK, vagy lejárt a
//      maximális időköz (report by exception: ettől bírja a rádió 15 eszközzel)
//   3. életjelet ad, ha sokáig nincs más forgalma
//
// A vezérlés (parancsok, szabályok) a 4-5. lépésben kerül ide.

/**
 * bit:hub — IoT-eszközök micro:bittel.
 */
//% color=#1E88E5 icon="" block="bit:hub"
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
        }
    }

    let _deviceId = 0
    let _room = 1
    let _running = false
    let _acked = false
    let _lastTxAt = 0
    let _rulesVersion = 0
    let _modules: Module[] = []

    // --- belső segédek ---------------------------------------------------

    function findModule(slot: number): Module {
        for (let i = 0; i < _modules.length; i++) {
            if (_modules[i].slot == slot) return _modules[i]
        }
        return null
    }

    function addModule(slot: number, code: string, dir: string,
                       needsPower: boolean, pin: number): void {
        if (_modules.length >= MAX_MODULES) return
        slot = Math.constrain(Math.round(slot), 1, MAX_MODULES)
        let m = findModule(slot)
        if (!m) {
            m = new Module(slot, code, dir)
            _modules.push(m)
        } else {
            m.code = code
            m.dir = dir
        }
        m.needsPower = needsPower
        m.pin = pin
        // Új modul jött a bemutatkozás UTÁN → jelentkezzünk be újra,
        // különben a szerver nem tudna róla.
        _acked = false
    }

    /** Egy sor kiküldése rádión, a 19 karakteres kerettel. */
    function tx(line: string): void {
        if (line.length > MAX_LINE) line = line.substr(0, MAX_LINE)
        radio.sendString(line)
        _lastTxAt = input.runningTime()
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
        }
        // A >, R, M, X üzenetek a 4-5. lépésben kerülnek ide.
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
            for (let i = 0; i < _modules.length && !_acked; i++) {
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
            if (!_acked) continue
            const now = input.runningTime()
            for (let i = 0; i < _modules.length; i++) {
                const m = _modules[i]
                if (m.dir != "i" || !m.hasValue) continue
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
     * Elindítja a bit:hub eszközt: beállítja a rádiót és elkezd bemutatkozni.
     * @param device az eszköz azonosítója a szobán belül, 1-99
     * @param room a szoba (rádiócsoport), 0-255
     */
    //% blockId=bithub_start
    //% block="bit:hub start | device %device | room %room"
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
     * Igaz, ha a hub már nyugtázta a bemutatkozásunkat.
     * Jó ikont rajzolni vele, hogy a diák lássa: bent vagyunk-e a rendszerben.
     */
    //% blockId=bithub_connected
    //% block="bit:hub connected"
    //% weight=95
    //% group="Setup"
    export function connected(): boolean {
        return _acked
    }

    /**
     * Bejelent egy szenzort. A felületen ettől jelenik meg a csempéje.
     * @param slot a modul helye az eszközön, 1-8
     * @param kind a szenzor típusa
     */
    //% blockId=bithub_declare_sensor
    //% block="announce sensor | slot %slot | type %kind"
    //% slot.min=1 slot.max=8 slot.defl=1
    //% weight=90 blockGap=8
    //% group="Modules"
    export function declareSensor(slot: number, kind: BitHubSensor): void {
        addModule(slot, sensorCode(kind), "i", false, -1)
    }

    /**
     * Bejelent egy aktuátort. A "külső táp kell" jelzést a felület kiírja
     * a csempére — motor és pumpa a micro:bit lábáról közvetlenül NEM megy.
     * @param slot a modul helye az eszközön, 1-8
     * @param kind az aktuátor típusa
     * @param pin melyik lábon van
     * @param power igaz, ha külső tápot igényel
     */
    //% blockId=bithub_declare_actuator
    //% block="announce actuator | slot %slot | type %kind | pin %pin | needs external power %power"
    //% slot.min=1 slot.max=8 slot.defl=3
    //% power.shadow="toggleYesNo"
    //% weight=85 blockGap=8
    //% group="Modules"
    export function declareActuator(slot: number, kind: BitHubActuator,
                                    pin: DigitalPin, power: boolean): void {
        addModule(slot, actuatorCode(kind), actuatorDir(kind), power, pin)
    }

    /**
     * Megadja egy szenzor friss értékét. Nem küld azonnal: a bit:hub akkor
     * továbbítja, ha az érték változott, vagy lejárt a maximális időköz.
     * Ezért nyugodtan hívható sűrűn, ciklusban.
     * @param slot melyik modul értéke
     * @param value a mért érték
     */
    //% blockId=bithub_report
    //% block="bit:hub report | slot %slot | value %value"
    //% slot.min=1 slot.max=8 slot.defl=1
    //% weight=80 blockGap=8
    //% group="Sending"
    export function report(slot: number, value: number): void {
        const m = findModule(slot)
        if (!m) return
        m.value = value
        m.hasValue = true
    }

    /**
     * Finomhangolja, milyen sűrűn jelent egy modul.
     * @param slot melyik modul
     * @param minChange ennyivel kell változnia, hogy azonnal menjen; eg.: 0.5
     * @param maxSeconds ennyi másodpercenként akkor is jelent, ha nem változott
     */
    //% blockId=bithub_set_reporting
    //% block="bit:hub reporting | slot %slot | on change of %minChange | at least every %maxSeconds s"
    //% slot.min=1 slot.max=8 slot.defl=1
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
