// bit:hub — protokoll-alapok.
//
// A micro:bit rádiócsomagja 32 bájt, a radio.sendString gyakorlatilag
// 19 karakter. EZ A LEGSZŰKEBB KORLÁT a teljes rendszerben: minden mező
// ezért rövidített kód, nem beszédes név. A hosszú, emberi nevek
// (mértékegység, címke) a szerver katalógusában élnek, nem a rádión.
//
// Üzenetalak:  <típusjel><eszközID>,<mezők vesszővel>

/**
 * Szenzortípusok, amelyeket egy bit:hub eszköz bejelenthet.
 */
enum BitHubSensor {
    //% block="temperature"
    //% block.loc.hu="hőmérséklet"
    Temperature = 1,
    //% block="light"
    //% block.loc.hu="fény"
    Light = 2,
    //% block="humidity"
    //% block.loc.hu="páratartalom"
    Humidity = 3,
    //% block="soil moisture"
    //% block.loc.hu="talajnedvesség"
    SoilMoisture = 4,
    //% block="distance"
    //% block.loc.hu="távolság"
    Distance = 5,
    //% block="sound"
    //% block.loc.hu="hang"
    Sound = 6,
    //% block="acceleration"
    //% block.loc.hu="gyorsulás"
    Acceleration = 7,
    //% block="button"
    //% block.loc.hu="gomb"
    Button = 8,
    //% block="potentiometer"
    //% block.loc.hu="potméter"
    Potentiometer = 9,
    //% block="other"
    //% block.loc.hu="egyéb"
    OtherSensor = 10
}

/**
 * Honnan olvassa a bit:hub a szenzor értékét.
 * A bejelentéskor EGYSZER kell megadni — onnantól a háttérszál olvas és
 * jelent, a diáknak nem kell ciklust írnia, és nem kell a helyszámot
 * másodszor is eltalálnia.
 */
enum BitHubSource {
    //% block="built-in sensor"
    //% block.loc.hu="beépített szenzor"
    Builtin = 0,
    //% block="P0 (analog)"
    //% block.loc.hu="P0 (analóg)"
    AnalogP0 = 1,
    //% block="P1 (analog)"
    //% block.loc.hu="P1 (analóg)"
    AnalogP1 = 2,
    //% block="P2 (analog)"
    //% block.loc.hu="P2 (analóg)"
    AnalogP2 = 3,
    //% block="P0 (digital)"
    //% block.loc.hu="P0 (digitális)"
    DigitalP0 = 4,
    //% block="P1 (digital)"
    //% block.loc.hu="P1 (digitális)"
    DigitalP1 = 5,
    //% block="P2 (digital)"
    //% block.loc.hu="P2 (digitális)"
    DigitalP2 = 6,
    //% block="P8 (digital)"
    //% block.loc.hu="P8 (digitális)"
    DigitalP8 = 7,
    //% block="P16 (digital)"
    //% block.loc.hu="P16 (digitális)"
    DigitalP16 = 8,
    //% block="manual (report block)"
    //% block.loc.hu="kézi (jelentés blokkal)"
    Manual = 99
}

/**
 * Aktuátortípusok, amelyeket egy bit:hub eszköz bejelenthet.
 */
enum BitHubActuator {
    //% block="LED"
    //% block.loc.hu="LED"
    Led = 1,
    //% block="relay"
    //% block.loc.hu="relé"
    Relay = 2,
    //% block="pump"
    //% block.loc.hu="pumpa"
    Pump = 3,
    //% block="servo"
    //% block.loc.hu="szervo"
    Servo = 4,
    //% block="motor"
    //% block.loc.hu="motor"
    Motor = 5,
    //% block="buzzer"
    //% block.loc.hu="zsongor"
    Buzzer = 6,
    //% block="LED matrix"
    //% block.loc.hu="LED-mátrix"
    Matrix = 7,
    //% block="other"
    //% block.loc.hu="egyéb"
    OtherActuator = 8
}

namespace bithub {
    // --- protokoll-állandók ---------------------------------------------

    export const MAX_LINE = 19          // rádió-korlát karakterben
    export const MAX_MODULES = 8        // eszközönként (a gyakorlati plafon 3-4)
    export const HEARTBEAT_MS = 10000   // életjel, ha nincs más forgalom
    export const DEFAULT_MAX_INTERVAL_MS = 5000

    // Az időmező körbefordul 65536 másodpercenként (18,2 óra), hogy legfeljebb
    // 5 karakter legyen. Az átjáró a SAJÁT órájából tekeri vissza az abszolút
    // időt, ezért a körbefordulás nem okoz kétértelműséget — csak akkor, ha egy
    // eszköz 18 óránál tovább néma, de az addigra amúgy is offline és újra
    // bemutatkozik.
    export const TIME_MOD = 65536

    // --- típuskódok (3 karakter) ----------------------------------------
    // A szerver ebből tudja a megjelenítendő nevet és a mértékegységet.

    export function sensorCode(kind: BitHubSensor): string {
        switch (kind) {
            case BitHubSensor.Temperature: return "tmp"
            case BitHubSensor.Light: return "lgt"
            case BitHubSensor.Humidity: return "hum"
            case BitHubSensor.SoilMoisture: return "soi"
            case BitHubSensor.Distance: return "dst"
            case BitHubSensor.Sound: return "snd"
            case BitHubSensor.Acceleration: return "acc"
            case BitHubSensor.Button: return "btn"
            case BitHubSensor.Potentiometer: return "pot"
            default: return "oth"
        }
    }

    export function actuatorCode(kind: BitHubActuator): string {
        switch (kind) {
            case BitHubActuator.Led: return "led"
            case BitHubActuator.Relay: return "rly"
            case BitHubActuator.Pump: return "pmp"
            case BitHubActuator.Servo: return "srv"
            case BitHubActuator.Motor: return "mot"
            case BitHubActuator.Buzzer: return "buz"
            case BitHubActuator.Matrix: return "mtx"
            default: return "oth"
        }
    }

    /**
     * Az aktuátor iránykódja: o = digitális, a = analóg (PWM), v = szervo.
     * A dashboard ebből tudja, milyen vezérlőt rajzoljon (kapcsoló vagy csúszka).
     */
    export function actuatorDir(kind: BitHubActuator): string {
        switch (kind) {
            case BitHubActuator.Servo: return "v"
            case BitHubActuator.Motor: return "a"
            default: return "o"
        }
    }

    // --- segédfüggvények -------------------------------------------------

    /**
     * Sztring darabolása elválasztó mentén.
     * Saját implementáció: a MakeCode statikus TypeScriptjében a
     * String.split nem megbízhatóan elérhető minden célplatformon.
     */
    export function split(s: string, sep: string): string[] {
        const out: string[] = []
        let cur = ""
        for (let i = 0; i < s.length; i++) {
            const c = s.charAt(i)
            if (c == sep) {
                out.push(cur)
                cur = ""
            } else {
                cur = cur + c
            }
        }
        out.push(cur)
        return out
    }

    /**
     * Szám szöveggé ADOTT SZÉLESSÉGBE.
     * Előbb 2 tizedessel próbálja, aztán 1-gyel, aztán egészre kerekítve —
     * és csak legvégső esetben vág. A 19 karakteres keret nem tágul, ezért
     * a hívó megmondja, mennyi hely maradt a számnak.
     */
    export function fitNumber(v: number, maxLen: number): string {
        if (maxLen < 1) return "0"
        let s = "" + Math.roundWithPrecision(v, 2)
        if (s.length <= maxLen) return s
        s = "" + Math.roundWithPrecision(v, 1)
        if (s.length <= maxLen) return s
        s = "" + Math.round(v)
        if (s.length <= maxLen) return s
        return s.substr(0, maxLen)
    }

    /**
     * Az eszköz futásideje másodpercben, 18,2 óránként körbefordulva
     * (lásd TIME_MOD). A micro:bitnek nincs órája — az abszolút időt az
     * átjáró számolja ebből és a saját órájából.
     */
    export function seconds(): number {
        return Math.idiv(input.runningTime(), 1000) % TIME_MOD
    }

    /**
     * Van-e beépített szenzor ehhez a típuskódhoz?
     * Ha nincs, a bejelentés csendben kézi módra vált — a talajnedvességet
     * nem tudja magától olvasni a micro:bit, azt lábról kell.
     */
    export function hasBuiltin(code: string): boolean {
        return code == "tmp" || code == "lgt" || code == "snd"
            || code == "acc" || code == "btn"
    }

    /** A beépített szenzor olvasása típuskód alapján. */
    export function readBuiltin(code: string): number {
        if (code == "tmp") return input.temperature()
        if (code == "lgt") return input.lightLevel()
        if (code == "snd") return input.soundLevel()
        if (code == "acc") return input.acceleration(Dimension.Strength)
        if (code == "btn") return input.buttonIsPressed(Button.A) ? 1 : 0
        return 0
    }

    /** Egy láb olvasása a forrás-kód alapján. */
    export function readSource(source: BitHubSource, code: string): number {
        switch (source) {
            case BitHubSource.Builtin: return readBuiltin(code)
            case BitHubSource.AnalogP0: return pins.analogReadPin(AnalogPin.P0)
            case BitHubSource.AnalogP1: return pins.analogReadPin(AnalogPin.P1)
            case BitHubSource.AnalogP2: return pins.analogReadPin(AnalogPin.P2)
            case BitHubSource.DigitalP0: return pins.digitalReadPin(DigitalPin.P0)
            case BitHubSource.DigitalP1: return pins.digitalReadPin(DigitalPin.P1)
            case BitHubSource.DigitalP2: return pins.digitalReadPin(DigitalPin.P2)
            case BitHubSource.DigitalP8: return pins.digitalReadPin(DigitalPin.P8)
            case BitHubSource.DigitalP16: return pins.digitalReadPin(DigitalPin.P16)
            default: return 0
        }
    }

    /** Soros sor végéről a kocsivissza levágása (CRLF kezelés). */
    export function stripCR(s: string): string {
        let end = s.length
        while (end > 0) {
            const c = s.charAt(end - 1)
            if (c == "\r" || c == "\n") end = end - 1
            else break
        }
        return s.substr(0, end)
    }
}
