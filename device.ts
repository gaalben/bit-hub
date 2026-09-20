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
 * bit:hub — IoT devices with the micro:bit.
 */
//% color=#1E88E5 icon="" block="bit:hub"
//% jsdoc.loc.hu="bit:hub — IoT-eszközök micro:bittel."
//% groups='["Setup", "Modules", "Sending", "Hub"]'
namespace bithub {

    class Module {
        slot: number
        code: string
        dir: string          // i | o | a | v
        source: BitHubSource // honnan olvassa magát (szenzornál)
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
            this.source = BitHubSource.Manual
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
                       needsPower: boolean, pin: number,
                       source: BitHubSource): void {
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
        // Ha beépített forrást kért, de ehhez a típushoz nincs (pl.
        // talajnedvesség), csendben kézi módra váltunk — a diák a
        // jelentés blokkal adhatja meg az értéket.
        m.source = (source == BitHubSource.Builtin && !hasBuiltin(code))
            ? BitHubSource.Manual
            : source
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
                if (m.dir != "i") continue

                // Önálló olvasás: a bejelentésnél megadott forrásból.
                // Így a diáknak nem kell ciklust írnia, és a helyszámot sem
                // kell másodszor eltalálnia.
                if (m.source != BitHubSource.Manual) {
                    m.value = readSource(m.source, m.code)
                    m.hasValue = true
                }

                if (!m.hasValue) continue
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
     * Starts the bit:hub device: sets up the radio and begins announcing itself.
     * @param device the device id within the room, 1-99
     * @param room the room (radio group), 0-255
     */
    //% blockId=bithub_start
    //% block="bit:hub start | device %device | room %room"
    //% block.loc.hu="bit:hub indítása | eszköz %device | szoba %room"
    //% jsdoc.loc.hu="Elindítja a bit:hub eszközt: beállítja a rádiót és elkezd bemutatkozni."
    //% device.loc.hu="az eszköz azonosítója a szobán belül, 1-99"
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
     * Announces a sensor and says where to read it from. This is what makes
     * its tile appear on the dashboard. With any source other than "manual"
     * the value is read and reported on its own — no loop needed.
     * @param slot the module position on the device, 1-8
     * @param kind the sensor type
     * @param source where the value comes from
     */
    //% blockId=bithub_declare_sensor
    //% block="announce sensor | slot %slot | type %kind | source %source"
    //% block.loc.hu="szenzor bejelentése | hely %slot | típus %kind | forrás %source"
    //% jsdoc.loc.hu="Bejelent egy szenzort, és megmondja, honnan olvassa. A felületen ettől jelenik meg a csempéje. A „kézi” kivételével minden forrásnál magától olvas és jelent — nem kell ciklust írni hozzá."
    //% slot.loc.hu="a modul helye az eszközön, 1-8"
    //% kind.loc.hu="a szenzor típusa"
    //% source.loc.hu="honnan jön az érték"
    //% slot.min=1 slot.max=8 slot.defl=1
    //% source.defl=BitHubSource.Builtin
    //% weight=90 blockGap=8
    //% group="Modules"
    export function declareSensor(slot: number, kind: BitHubSensor,
                                  source: BitHubSource): void {
        addModule(slot, sensorCode(kind), "i", false, -1, source)
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
    //% block="announce actuator | slot %slot | type %kind | pin %pin | needs external power %power"
    //% block.loc.hu="aktuátor bejelentése | hely %slot | típus %kind | láb %pin | külső táp kell %power"
    //% jsdoc.loc.hu="Bejelent egy aktuátort. A „külső táp kell” jelzést a felület kiírja a csempére — motor és pumpa a micro:bit lábáról közvetlenül NEM megy."
    //% slot.loc.hu="a modul helye az eszközön, 1-8"
    //% kind.loc.hu="az aktuátor típusa"
    //% pin.loc.hu="melyik lábon van"
    //% power.loc.hu="igaz, ha külső tápot igényel"
    //% slot.min=1 slot.max=8 slot.defl=3
    //% power.shadow="toggleYesNo"
    //% weight=85 blockGap=8
    //% group="Modules"
    export function declareActuator(slot: number, kind: BitHubActuator,
                                    pin: DigitalPin, power: boolean): void {
        addModule(slot, actuatorCode(kind), actuatorDir(kind), power, pin,
            BitHubSource.Manual)
    }

    /**
     * Gives a sensor its latest value. It is not sent immediately: bit:hub
     * forwards it when the value has changed or the maximum interval elapsed.
     * So it is safe to call often, inside a loop.
     * @param slot which module the value belongs to
     * @param value the measured value
     */
    //% blockId=bithub_report
    //% block="bit:hub report | slot %slot | value %value"
    //% block.loc.hu="bit:hub jelentés | hely %slot | érték %value"
    //% jsdoc.loc.hu="Megadja egy szenzor friss értékét. Nem küld azonnal: a bit:hub akkor továbbítja, ha az érték változott, vagy lejárt a maximális időköz. Ezért nyugodtan hívható sűrűn, ciklusban."
    //% slot.loc.hu="melyik modul értéke"
    //% value.loc.hu="a mért érték"
    //% slot.min=1 slot.max=8 slot.defl=1
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
    //% block="bit:hub reporting | slot %slot | on change of %minChange | at least every %maxSeconds s"
    //% block.loc.hu="bit:hub jelentési ütem | hely %slot | küldés ennyi változásra %minChange | legalább ennyi másodpercenként %maxSeconds"
    //% jsdoc.loc.hu="Finomhangolja, milyen sűrűn jelent egy modul."
    //% slot.loc.hu="melyik modul"
    //% minChange.loc.hu="ennyivel kell változnia, hogy azonnal menjen"
    //% maxSeconds.loc.hu="ennyi másodpercenként akkor is jelent, ha nem változott"
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
