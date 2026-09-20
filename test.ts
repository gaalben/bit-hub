// Példaprogramok. Ez a fájl NEM kerül bele a diák projektjébe,
// amikor a bit:hubot bővítményként hozzáadja — csak itt, a bővítmény
// szerkesztésekor fut.

// ---------------------------------------------------------------
// 1. PÉLDA — ESZKÖZ: beépített hőmérő és fényérzékelő
// ---------------------------------------------------------------
bithub.start(1, 1)
bithub.declareSensor(1, BitHubSensor.Temperature)
bithub.declareSensor(2, BitHubSensor.Light)

basic.forever(function () {
    bithub.report(1, input.temperature())
    bithub.report(2, input.lightLevel())

    // A csatlakozás állapota a kijelzőn
    if (bithub.connected()) {
        basic.showIcon(IconNames.Yes, 0)
    } else {
        basic.showIcon(IconNames.Sad, 0)
    }
    basic.pause(500)
})

// ---------------------------------------------------------------
// 2. PÉLDA — HUB: ezt egy MÁSIK micro:bitre töltsd (USB-n a géphez)
// ---------------------------------------------------------------
// bithub.startHub(1)
