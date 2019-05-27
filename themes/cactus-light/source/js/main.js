class StaticPageManager {

  constructor () {
    this.initData()

    $(document).ready(() => {
      this.initReveal()
      this.initContent()
    })
  }

  initData () {
    this.config = {
      minLoadingDuration: 1500
    }
    this.state = {
      startTime: Date.now(),
      loadedTime: null,
      isLoading: true
    }
    this.$map = {}
  }

  initContent () {
    this.$map.$yahLoading = document.querySelector('.yah-loading-indicator')
    this.$map.$contentContainer = document.querySelector('.content-container')

    // Remove Loading
    this.state.loadedTime = Date.now()
    const loadingCost = this.state.loadedTime - this.state.startTime
    const renderDelay = loadingCost > this.config.minLoadingDuration
      ? 0
      : Math.max(0, this.config.minLoadingDuration - loadingCost)

    const removeLoading = () => {
      this.$map.$contentContainer.classList.add('appeared')
      anime({
        targets: this.$map.$yahLoading,
        opacity: 0,
        duration: 618,
        complete: () => {
          this.$map.$yahLoading.remove()
          new StoryOrigin()
        }
      })
    }

    setTimeout(() => {
      removeLoading()
    }, renderDelay)
  }

  initReveal () {
    Reveal.initialize({
      margin: 0,
      minScale: 1,
      maxScale: 1,

      // slideNumber: 'c/t',
      touch: true,
      // controls: false,
      history: true,
      controlsLayout: 'top-center',
      progress: false,
      autoSlideStoppable: false,

      transition: 'fade'
    })
  }

}

Pts.namespace(window)
class StoryOrigin {

  constructor () {
    this.config = {
      bgcolor: '#e3e1dc',
      cellSize: 4,
    }

    this.init()
  }

  init () {
    // Create Space
    const space = new CanvasSpace('#story-origin-perform')
      .setup({
        bgcolor: this.config.bgcolor
      })
    const form = space.getForm()
    let comb, samples, sampler

    Pt.prototype.normalize = function () {
      const m = this.magnitude()
      let pt

      if(m === 0) {
        pt = new Pt()
      } else {
        pt = new Pt( this.x/m, this.y/m, this.z/m )
      }

      this.to(pt)

      return this
    }

    // A Circle that follows mouse and comb the VectorLines
    class Comb {
      start () {
        this.lastPos = new Pt()
        this.offset = new Pt()
        this.radius = 20
        this.$circle = Circle.fromCenter(space.center, this.radius)
      }

      move (x, y) {
        this.lastPos.to(this.$circle.p1)
        this.$circle.p1.to(x, y)
        this.offset = this.$circle.p1.$subtract(this.lastPos).normalize()
        this.lastPos.to(x, y)
      }

      action (type, x, y, evt) {
        evt.stopPropagation()

        if (type == 'move') {
          this.move(x, y)
        }
      }
    }

    // VectorLine is a hair-like point that can be "combed"
    class VectorLine extends Pt {
      constructor (...args) {
        super(...args)

        this.direction = new Pt() // hair direction
        this.pointer = new Pt() // hair

        this.pulled = false // has it been pulled by comb
        this.moved = false // has it been touched and not yet reset

        this.pull_power = 9
        this.mag = 20
        this.intensity = 0.3

        this.resetTimer = -1
      }

      initVec (...args) {
        this.direction.to(...args).normalize()
        this.pointer.to(...args)
        this.pointer.multiply(this.mag / 4)
        return this
      }

      animate (time, frame, ctx) {
        const color = this.checkRange()
        form.stroke(color).line([this, this.$add(this.pointer)])

        // Reset to initial direction (when clicked)
        if (this.resetTimer >= 0) this.resetTimer += frame
        if (this.resetTimer > 0 && this.resetTimer < 2000) {
          const ang = space.center.$subtract(this).angle()
          const dir = new Pt(Math.cos(ang), Math.sin(ang))
          this.direction.to(dir)
          this.pointer.add(dir).divide(1.2)
        }
      }

      // Track mouse up
      action (type, x, y, evt) {
        if (type == 'up' && this.moved) {
          this.resetTimer = 0
          this.moved = false
        }
      }

      checkRange () {
        let color

        // Pull it when intersecting with comb
        if (Circle.withinBound(comb.$circle, this)) {
          this.intensity = 0.5
          const dm = 1 - (this.$subtract(comb.$circle.p1).magnitude() / comb.radius)

          this.pull_power = this.pull_power > 0 ? this.pull_power - 0.25 : 0
          this.pointer.add(comb.offset.$multiply(dm * this.pull_power))
          this.direction.to(this.pointer).normalize()
          this.pulled = true
          this.moved = true
          color = `rgba(${Math.ceil(this.pointer.y / comb.radius * 100 + 150)}, 50, ${Math.ceil(this.pointer.x / comb.radius * 100 + 150)}`
        } else {
          // Not pulled
          this.pull_power = 9 // Reset pull power

          if (this.pulled) { // Transition back to maximum magnitude value
            const _mag = this.pointer.magnitude()
            if (_mag > this.mag) {
              this.pointer.set(this.direction.$multiply(_mag * 0.95))
            } else {
              this.pulled = false
            }
            this.intensity = Math.min(0.4, Math.max(5, _mag / (this.mag * 5)))
          }

          color = (this.pointer.y < 0) ? 'rgba(230,25,93' : 'rgba(54,53,51'
        }

        return `${color}, ${this.intensity})`
      }
    }

    // Create comb and add to space
    comb = new Comb()
    space.add(comb)

    // Fill canvas in white initially and no refresh
    let lastTime = 0
    let counter = 0
    space.refresh(false)
    space.clear(this.config.bgcolor)

    space.add({
      start: () => {
        // Create samples
        sampler = poissonDiscSampler(
          space.innerBound.width,
          space.innerBound.height,
          this.config.cellSize
        )
        samples = []
      },

      animate: function (time, frameTime, ctx) {
        if (counter > 3000) { // to complete at 3000 points
          samples.map(p => {
            p = new Pt(p)
            const vecline = new VectorLine(p)
            const dir = space.center.$subtract(p).angle()
            vecline.initVec(Math.cos(dir), Math.sin(dir))
            space.add(vecline)
          })

          // Remove this actor when done
          space.remove(this)
          space.refresh(true)
        } else {
          // Fade in animation
          // Add 50 points per 25ms
          let count = 0
          while (time - lastTime < 25 && count++ < 50) {
            let s = sampler()
            ctx.fillStyle = '#fff'
            if (s) {
              samples.push(s)
              form.fill('rgba(50,0,20,.15)').stroke(false).point(s, 1)
              counter++
            } else {
              counter = 3001 // Assuming completion if no more
              document.querySelector('.story-origin').classList.add('inited')
            }
          }
        }

        lastTime = time
      }
    })

    // Start playing
    space
      .bindMouse()
      .bindTouch()
      .play()
  }

}

const pageManager = new StaticPageManager()
