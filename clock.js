let sound
function preload() {
  sound = loadSound("misc_menu.wav")
}

function pad(n, totalDigits = 2) {
  let s = n.toString()
  while (s.length < totalDigits) {
    s = "0" + s
  }
  return s
}

class Clock {
    // when "active" stores the timestamp when time will run out inside this.value
    // when not active, stores the time left on the click inside this.value
    // active or not is inferred from whether this.value is big or small
    // all methods take current time as argument: can supply firebase server-adjusted timestamp here
  constructor(maintime = 1, increment = 1, cap = Infinity) {
    this.increment = increment*1000
    this.value = maintime*60*1000 // + this.increment
    this.cap = cap*60*1000
  }
  
  get active() {
    return this.value > 1e12
  }
  
  start(t = Date.now()) {
    if (this.active) return
    this.value = t + this.value
  }
  
  stop(t = Date.now()) {
    if (!this.active) return
    this.value += (this.increment - t)
    if (this.value > this.cap) this.value = this.cap
    
  }
  
  toggle(t = Date.now()) {
    if (this.active) {
      this.stop(t)
    } else {
      this.start(t)
    }
  }
  
  timeLeft(t = Date.now()) {
    let out = this.value
    if (this.active) {
      out -= t
    }
    return max(0, out)
  }
  
  toString(t = Date.now(), debug = false) {
    let timeLeft = this.timeLeft()
    
    if (debug) {
      return (timeLeft/1000).toFixed(3)
    }
    
    let sign = ""
    
//     if (timeLeft < 0) {
//       timeLeft = -timeLeft
//       sign = "-"
//     }
    timeLeft = floor(timeLeft) // count whole milliseconds
    
    // let hundreds = floor(timeLeft / 10) % 100
    
    let tenths = floor(timeLeft / 100) % 10
    
    let milliSeconds = timeLeft % 1000
    timeLeft = floor(timeLeft / 1000)
    
    let seconds = timeLeft % 60
    timeLeft = floor(timeLeft / 60)
    
    let minutes = timeLeft % 60
    timeLeft = floor(timeLeft / 60)
    
    let out = [sign, pad(minutes) + ":" + pad(seconds)]
    if (this.timeLeft() < 10 * 1000) {
      out.push(".", tenths)
      // out.push(".", pad(hundreds))
    }
    return out.join("")
  }
  
  col() {
    if (!this.active) return "gray"
    if (this.timeLeft() < 1000) {
      return "red"
    }
    if (this.timeLeft() < 5000) {
      return ["black", "red"][floor(this.timeLeft() / 500) % 2]
    }
    return "black"
  }
  
  draw(x, y, s = 30) {
    let col = this.col()
    if (this.lastCol == "black" && col == "red") {
      sound.play()
    }
    textSize(s)
    fill(this.col())
    text(this.toString(), x, y)
    this.lastCol = col
  }
  
  giveExtraTime(t = Date.now(), s = 15) {
    if (this.timeLeft() === 0) this.value = t
    this.value += s*1000
  }
}

let clock1 = new Clock(0.1, 3, 1)
let clock2 = new Clock(0.1, 3, 1)

function setup() {
  createCanvas(400, 400)
  textAlign(CENTER, CENTER)
  clock1.start()
}

function draw() {
  background(220);
  clock1.draw(100, 200)
  clock2.draw(300, 200)
  
  let y = map(clock1.timeLeft(), 0, 60*1000, 0, 200)
  rect(0, 0, 10, y)
}

function mousePressed() {
  clock1.toggle()
  clock2.toggle()
}

function keyPressed() {
  if (key == "+") {
    clock1.giveExtraTime(Date.now(), 5)
  }
}