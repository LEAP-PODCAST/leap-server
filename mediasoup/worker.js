const consola = require("consola");

const os = require("os");
const mediasoup = require("mediasoup");

mediasoup.observer.on("newworker", worker => {
  consola.info(`@newworker: [pid:${worker.pid}]`);
});

// One worker per CPU. Only use 1 worker aka 1 CPU for development
// This is just here because we don't need tons of workers while developing (generally speaking)
const numWorkers =
  process.env.NODE_ENV === "production" ? Object.keys(os.cpus()).length : 1;
let lastUsedWorkerIndex = -1;

module.exports = {
  /**
   * Create all mediasoup workers (runs once at launch)
   */
  createWorkers: async () => {
    consola.info("****CREATING MEDIASOUP WORKERS****");
    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: "debug"
      });
      workers.push(worker);
    }
    consola.info(`****CREATED ${numWorkers} MEDIASOUP WORKERS ****`);
  },

  /**
   * Get a worker from a CPU core, balances load across CPU
   */
  getWorker: () => {
    lastUsedWorkerIndex++;
    if (lastUsedWorkerIndex >= numWorkers) {
      lastUsedWorkerIndex = 0;
    }

    return workers[lastUsedWorkerIndex];
  }
};
