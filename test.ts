// Példaprogramok. Ez a fájl NEM kerül bele a diák projektjébe,
// amikor a bit:hubot bővítményként hozzáadja — csak itt, a bővítmény
// szerkesztésekor fut.
//
// Blokk-nézetben a modul helyén NEM szám látszik, hanem a diák által adott
// NÉV a legördülőben ("hőmérő", "talaj", ...). Itt, a szöveges nézetben a
// mögöttes sorszám szerepel — a kettő ugyanaz.

// ---------------------------------------------------------------
// 1. PÉLDA — ESZKÖZ két szenzorral
// A bejelentés a program elejére való, egyszer; az értéket az "állandóan"
// ciklusban a jelentés blokk adja.
// ---------------------------------------------------------------
bithub.start(1, 1)
bithub.declareSensor(1, BitHubSensor.Temperature)
bithub.declareSensor(2, BitHubSensor.SoilMoisture)

basic.forever(function () {
    bithub.report(1, input.temperature())
    bithub.report(2, pins.analogReadPin(AnalogPin.P0))
    basic.pause(500)
})

// ---------------------------------------------------------------
// 2. PÉLDA — HUB: ezt egy MÁSIK micro:bitre töltsd (USB-n a géphez)
// ---------------------------------------------------------------
// bithub.startHub(1)

// ---------------------------------------------------------------
// 3. PÉLDA — TŰZJELZŐ: hőmérő + a micro:bit BEÉPÍTETT hangszórója és
// LED-kijelzője mint aktuátor. Semmit nem kell rákötni: a felületen a
// csempén kapcsolhatók, a zsongor "Próba" gombja pedig 3 mp-re
// megszólaltatja, aztán az eszköz magától elhallgat.
// A riasztást az ESZKÖZ dönti el (30 fok fölött szól) — a "kapcsolás"
// blokk miatt ez a felületen is azonnal látszik.
// ---------------------------------------------------------------
// bithub.start(1, 1)
// bithub.declareSensor(1, BitHubSensor.Temperature)
// bithub.declareBuiltIn(2, BitHubBuiltIn.Speaker)
// bithub.declareBuiltIn(3, BitHubBuiltIn.Display)
//
// basic.forever(function () {
//     bithub.report(1, input.temperature())
//     bithub.setActuator(2, input.temperature() > 30 ? 1 : 0)
//     basic.pause(500)
// })
