// Példaprogramok. Ez a fájl NEM kerül bele a diák projektjébe,
// amikor a bit:hubot bővítményként hozzáadja — csak itt, a bővítmény
// szerkesztésekor fut.

// ---------------------------------------------------------------
// 1. PÉLDA — ESZKÖZ, ciklus nélkül
// A forrást a bejelentésnél adjuk meg EGYSZER, onnantól magától olvas
// és jelent. Nincs forever, és a helyszámot sem kell kétszer eltalálni.
// ---------------------------------------------------------------
bithub.start(1, 1)
bithub.declareSensor(1, BitHubSensor.Temperature, BitHubSource.Builtin)
bithub.declareSensor(2, BitHubSensor.Light, BitHubSource.Builtin)
bithub.declareSensor(3, BitHubSensor.SoilMoisture, BitHubSource.AnalogP0)

// ---------------------------------------------------------------
// 2. PÉLDA — KÉZI érték (számított adat, amit a micro:bit nem tud magától)
// ---------------------------------------------------------------
// bithub.start(2, 1)
// bithub.declareSensor(1, BitHubSensor.OtherSensor, BitHubSource.Manual)
// basic.forever(function () {
//     bithub.report(1, input.acceleration(Dimension.X) - input.acceleration(Dimension.Y))
//     basic.pause(500)
// })

// ---------------------------------------------------------------
// 3. PÉLDA — HUB: ezt egy MÁSIK micro:bitre töltsd (USB-n a géphez)
// ---------------------------------------------------------------
// bithub.startHub(1)
