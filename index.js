console.clear();

// =============================================================
// SIMULATION SETTINGS
// =============================================================

const TICK_RATE = 30; // per second
const MAP_SIZE = 700;

const DEFAULT_SETTINGS = {
  IMMUNITY_RATIO: 0.01,
  TRANSMISSION_PROBABILITY: 0.01,
  SELF_QUARANTINED: 0.01,
  TRANSMISSION_RADIUS: 15,
  STARTING_POPULATION: 100,
  STARTING_INFECTIONS: 3,
  DEATH_RATE: 3, // %
  RECOVERY_TIME: 2000
};

// =============================================================
// UTILS
// =============================================================

const distance = (thing1, thing2) => {
  const dx = thing1.x - thing2.x;
  const dy = thing1.y - thing2.y;
  return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
};

const exposed = (person1, person2, radius) => {
  const d = distance(person1, person2);
  return d < radius ? 1 : 0;
};

// e.g. 10% + 10% = 19%
const compoundProbability = (exposures, probability) => {
  return new Array(exposures)
    .fill(null)
    .reduce(total => total + (1 - total) * probability, 0);
};

// =============================================================
// CHART
// =============================================================

const initPlot = () => {
  var data = [
    {
      x: [],
      y: [],
      fill: "tozeroy",
      type: "scatter",
      mode: "lines",
      name: "Infected",
      line: { color: "#80CAF6" }
    },
    {
      x: [],
      y: [],
      fill: "tozeroy",
      type: "scatter",
      mode: "lines",
      name: "Deaths",
      line: { color: "#f00" }
    }
  ];

  Plotly.plot("graph", data);
};

const appendData = (x, y1, y2) => {
  Plotly.extendTraces(
    "graph",
    {
      x: [[x], [x]],
      y: [[y1], [y2]]
    },
    [0, 1]
  );
};

const resetPlot = () => {
  Plotly.deleteTraces("graph", 0);
  Plotly.deleteTraces("graph", 0);
  initPlot();
};

// =============================================================
// CLASSES
// =============================================================

const DECEASED = "DECEASED";
const INFECTED = "INFECTED";
const RECOVERED = "RECOVERED";
const QUARANTINED = "QUARANTINED";
const IMMUNE = "IMMUNE";

class Map {
  constructor() {
    this.settings = DEFAULT_SETTINGS;

    this.canvas = null;
    this.c = null;
    this.people = null;
    this.interval = null;
    this.animation = null;
    this.infectedCount = this.settings.STARTING_INFECTIONS;
    this.prevInfectedCount = null;
    this.deceasedCount = 0;
    this.prevDeceasedCount = null;
    this.frame = 0;

    this.$dom = {};
  }

  init = () => {
    this.$dom = {
      canvas: document.querySelector("canvas"),
      resetButton: document.querySelector(".actions__reset"),
      startButton: document.querySelector(".actions__start"),
      stopButton: document.querySelector(".actions__stop"),
      inputs: [...(document.querySelectorAll(".settings input") || [])]
    };

    this.c = this.$dom.canvas.getContext("2d");
    this.$dom.canvas.height = MAP_SIZE;
    this.$dom.canvas.width = MAP_SIZE;

    return this;
  };

  addEventListeners = () => {
    this.$dom.resetButton.addEventListener("click", this.reset);
    this.$dom.startButton.addEventListener("click", this.start);
    this.$dom.stopButton.addEventListener("click", this.stop);
    this.$dom.inputs.forEach(input =>
      input.addEventListener("input", this.handleChange)
    );

    return this;
  };

  handleChange = ({ currentTarget }) => {
    const { name, value } = currentTarget;

    const _value = value !== "" ? Number(value) : DEFAULT_SETTINGS[value];
    const __value = currentTarget.hasAttribute("data-percent")
      ? _value / 100
      : _value;

    this.settings = {
      ...this.settings,
      [name]: __value
    };
  };

  stop = () => {
    cancelAnimationFrame(this.animation);
    clearInterval(this.interval);
    this.$dom.startButton.style.display = "inline-block";
    this.$dom.stopButton.style.display = "none";

    this.animation = null;
    this.interval = null;
  };

  reset = () => {
    this.frame = 0;
    this.populate();
    this.draw();
    this.infectedCount = this.settings.STARTING_INFECTIONS;
    this.deceasedCount = 0;
    resetPlot();

    return this;
  };

  populate = () => {
    let remainingInfected = this.settings.STARTING_INFECTIONS;

    this.people = new Array(this.settings.STARTING_POPULATION)
      .fill(null)
      .map(person => {
        let status = null;

        if (Math.random() < this.settings.SELF_QUARANTINED) {
          status = QUARANTINED;
        } else if (Math.random() < this.settings.IMMUNITY_RATIO) {
          status = IMMUNE;
        } else if (--remainingInfected >= 0) {
          status = INFECTED;
        }

        return new Person(status);
      });

    return this;
  };

  draw = () => {
    this.c.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    this.people.forEach(person => person.draw(this.c));

    return this;
  };

  tick = () => {
    const stats = this.people.reduce(
      (total, person, index) => {
        const statusChange = person.tick(
          this.people,
          this.settings,
          this.removePerson,
          index
        );

        if (statusChange) {
          total[statusChange]++;
        }

        return total;
      },
      { INFECTED: 0, DECEASED: 0, RECOVERED: 0 }
    );

    this.infectedCount += stats.INFECTED;
    this.deceasedCount += stats.DECEASED;

    return this;
  };

  initTick = (rate = TICK_RATE) => {
    this.interval = setInterval(this.tick, rate / 1000);

    return this;
  };

  animate = () => {
    this.frame++;

    if (this.infectedCount !== this.prevInfectedCount) {
      appendData(this.frame, this.infectedCount, this.deceasedCount);
      this.prevInfectedCount = this.infectedCount;
    }

    if (this.deceasedCount !== this.prevDeceasedCount) {
      appendData(this.frame, this.infectedCount, this.deceasedCount);
      this.prevDeceasedCount = this.deceasedCount;
    }

    this.draw();
    this.animation = window.requestAnimationFrame(this.animate);
  };

  start = () => {
    this.$dom.startButton.style.display = "none";
    this.$dom.stopButton.style.display = "initial";

    this.animate();
    this.initTick();

    return this;
  };

  removePerson = index => {
    this.people.splice(index, 1);
  };
}

class Person {
  constructor(status) {
    const isQuarantined = status === QUARANTINED;
    this.status = status;
    this.infectionDuration = null;
    this.size = 2;
    this.x = Math.random() * MAP_SIZE;
    this.y = Math.random() * MAP_SIZE;
    this.vx = isQuarantined ? 0 : Math.random() - 0.5;
    this.vy = isQuarantined ? 0 : Math.random() - 0.5;
  }

  draw = context => {
    // draw circle
    context.beginPath();
    // fill in red if infected
    context.fillStyle = this.color();
    context.arc(this.x, this.y, 3, 0, Math.PI * 2);
    context.fill();
  };

  color = () => {
    switch (this.status) {
      case IMMUNE: {
        return "lime";
      }
      case INFECTED: {
        return "red";
      }
      case QUARANTINED: {
        return "blue";
      }
      case RECOVERED: {
        return "darkgreen";
      }
      default:
        return "#fff";
    }
  };

  tick = (people, settings, remove, index) => {
    // dont move if quarantined
    if (this.status === QUARANTINED) return null;

    // bounce when hitting edges
    if (this.x > MAP_SIZE || this.x < 0) this.vx *= -1;
    if (this.y > MAP_SIZE || this.y < 0) this.vy *= -1;

    // change coords based on velocity
    this.x += this.vx;
    this.y += this.vy;

    // if the person is infected, check if they're going to die
    if (this.status === INFECTED) {
      this.infectionDuration++;

      const deathProbability =
        settings.DEATH_RATE / settings.RECOVERY_TIME / 100;
      const died = Math.random() < deathProbability;

      if (died) {
        remove(index);
        return DECEASED;
      }

      if (this.infectionDuration > settings.RECOVERY_TIME) {
        this.infected = false;
        this.recovered = true;
        this.status = RECOVERED;
        return RECOVERED;
      }
    }

    // if the person is immune skip ignore infection probability
    if (
      this.status === IMMUNE ||
      this.status === INFECTED ||
      this.status === RECOVERED
    )
      return null;

    // calculate number of times exposed
    const exposures = people.reduce((exposures, person) => {
      // skip self, and non infected
      if (this === person || person.status !== INFECTED) return exposures;

      return exposures + exposed(person, this, settings.TRANSMISSION_RADIUS);
    }, 0);

    // calculate probability of infection
    // by compounding exposure risk
    if (exposures) {
      const probability = compoundProbability(
        exposures,
        settings.TRANSMISSION_PROBABILITY
      );

      const infected = Math.random() < probability;

      if (infected) {
        this.status = INFECTED;
        this.infectionDuration = 1;
        return INFECTED;
      }
    }

    return null;
  };
}

new Map()
  .init()
  .addEventListeners()
  .populate();

initPlot();
