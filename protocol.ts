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
    Temperature = 1,
    //% block="light"
    Light = 2,
    //% block="humidity"
    Humidity = 3,
    //% block="soil moisture"
    SoilMoisture = 4,
    //% block="distance"
    Distance = 5,
    //% block="sound"
    Sound = 6,
    //% block="acceleration"
    Acceleration = 7,
    //% block="button"
    Button = 8,
    //% block="potentiometer"
    Potentiometer = 9,
    //% block="other"
    OtherSensor = 10
}

/**
 * Aktuátortípusok, amelyeket egy bit:hub eszköz bejelenthet.
 */
enum BitHubActuator {
    //% block="LED"
    Led = 1,
    //% block="relay"
    Relay = 2,
    //% block="pump"
    Pump = 3,
    //% block="servo"
    Servo = 4,
    //% block="motor"
    Motor = 5,
    //% block="buzzer"
    Buzzer = 6,
    //% block="LED matrix"
    Matrix = 7,
    //% block="other"
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
