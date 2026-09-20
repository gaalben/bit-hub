// bit:hub — HUB mód.
//
// Ezt EGYETLEN micro:bit futtatja, USB-n a géphez kötve. Nem mér és nem
// vezérel semmit: kétirányú híd a rádió és a soros port között.
//
//    rádió  --->  soros port  (a böngésző átjáró lapja ezt olvassa)
//    soros port  --->  rádió  (a felületről jövő parancsok)
//
// FONTOS: egy micro:bit vagy eszköz, vagy hub — a kettőt ne tedd
// ugyanabba a programba.

namespace bithub {

    let _hubRunning = false

    /**
     * Starts HUB mode: writes every line heard on the radio to the serial
     * port, and sends every line received on serial out over the radio.
     * @param room the room (radio group), 0-255
     */
    //% blockId=bithub_start_hub
    //% block="bit:hub start HUB | room %room"
    //% block.loc.hu="bit:hub HUB mód indítása | szoba %room"
    //% jsdoc.loc.hu="Elindítja a HUB módot: a rádión hallott sorokat kiírja a soros portra, a soros porton kapott sorokat pedig továbbküldi rádión."
    //% room.loc.hu="a szoba (rádiócsoport), 0-255"
    //% room.min=0 room.max=255 room.defl=1
    //% weight=60
    //% group="Hub"
    export function startHub(room: number): void {
        if (_hubRunning) return
        _hubRunning = true

        radio.setGroup(Math.constrain(Math.round(room), 0, 255))
        radio.setTransmitPower(7)

        serial.redirectToUSB()
        serial.setBaudRate(BaudRate.BaudRate115200)

        // rádió -> soros
        radio.onReceivedString(function (received: string) {
            serial.writeLine(received)

            // A hello nyugtázása HELYBEN történik, nem a szerverről.
            // Így a rádiós kézfogás akkor is lezárul, ha az átjáró lap még
            // nincs megnyitva — az eszköz elkezdhet jelenteni. Az átjáró
            // később a saját A-üzenetével pontosítja a szerveridőt.
            if (received.length > 1 && received.charAt(0) == "!") {
                const parts = split(received.substr(1, received.length - 1), ",")
                if (parts.length > 0) {
                    const id = parseInt(parts[0])
                    if (id > 0) {
                        radio.sendString("A" + id + "," + seconds())
                    }
                }
            }
        })

        // soros -> rádió (külön szálon, mert a readUntil blokkol)
        control.inBackground(function () {
            while (true) {
                const raw = serial.readUntil(serial.delimiters(Delimiters.NewLine))
                const line = stripCR(raw)
                if (line.length > 0) {
                    radio.sendString(line.length > MAX_LINE
                        ? line.substr(0, MAX_LINE)
                        : line)
                }
            }
        })

        basic.showIcon(IconNames.Yes)
    }
}
