require("dotenv").config();
const fs = require("fs");
const express = require("./express.js");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
const Worker = require("./mediasoup/worker");
const http = require("http");
const consola = require("consola");
const { runAtEveryMSInterval } = require("./methods");

// Create http server if not https
let server;
let io;

// All workers representing CPU vCores
global.workers = [];

// All routers representing rooms
global.routers = new Map();

// All live episodes
global.liveEpisodes = new Map();

// All rooms
global.rooms = new Map();

// All transports representing streamer sending data
global.sendTransports = new Map();

// All transports representing viewer receiving data
global.recvTransports = new Map();

// All producers
global.producers = new Map();

// All consumers
global.consumers = new Map();

// Define MySQL tables
(async () => {
  global.mysql = await require("mysql2/promise").createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQL_PORT)
  });

  global.mysql.exec = async (query, params) => {
    try {
      const res = await global.mysql.execute(query, params);
      return res;
    } catch (err) {
      // TODO error logging service
      consola.error(err);
      return [[], []];
    }
  };

  global.mysql.getUserProfiles = async (query, params) => {
    const res = await global.mysql.exec(query, params);
    for (let i = 0; i < res[0].length; i++) {
      const p = res[0][i];
      !p.socials
        ? (p.socials = [])
        : (p.socials = p.socials.split(",").map(v => parseInt(v)));
      !p.podcasts
        ? (p.podcasts = [])
        : (p.podcasts = p.podcasts.split(",").map(v => parseInt(v)));

      if (p.podcasts.length) {
        const [podcasts] = await mysql.exec(
          "SELECT * FROM podcasts WHERE `id` IN (?)",
          p.podcasts
        );
        p.podcasts = podcasts;
      }
    }
    return res;
  };

  global.mysql.getPodcasts = async (query, params) => {
    const res = await global.mysql.exec(query, params);
    for (let i = 0; i < res[0].length; i++) {
      const p = res[0][i];
      !p.hosts
        ? (p.hosts = [])
        : (p.hosts = p.hosts.split(",").map(v => parseInt(v)));

      console.log(p.hosts);

      if (p.hosts.length) {
        const [hosts] = await mysql.exec(
          "SELECT * FROM user_profiles WHERE `id` IN (?)",
          p.hosts
        );
        p.hosts = hosts;
      }
    }
    return res;
  };

  await require("./create_sql_tables.js")();

  const runScheduledCheckOnScheduledEpisodes = async () => {
    const [episodes] = await mysql.exec("SELECT * FROM scheduled_podcast");

    if (episodes.length) {
      for (const episode of episodes) {
        // If scheduled episode timeToAlert
        if (episode.startTime - episode.timeToAlert * 1000 * 60 >= Date.now()) {
          // Email / notify users that episode is to begin in X amount of minutes
        }

        // If episode is still scheduled but over 24 hours late, remove it from the DB
        const _24hours = 1000 * 60 * 60 * 24;
        if (episode.startTime <= Date.now() + _24hours) {
          const [
            result
          ] = await mysql.exec("DELETE FROM scheduled_podcast WHERE id = ?", [
            episode.id
          ]);

          if (!result) {
            consola.error(
              `Failed to delete scheduled episode id: ${episode.id}`
            );
          }
        }
      }
    }
  };
  // Check scheduled episodes every 1 minute
  runAtEveryMSInterval(runScheduledCheckOnScheduledEpisodes, 1000 * 60);
})();

main();

async function main() {
  global.SERVER_IP = await new Promise(resolve => {
    require("dns").lookup(require("os").hostname(), (err, addr) => {
      resolve(addr);
    });
  });

  await Worker.createWorkers();

  // Create http or https server depending on NODE_ENV
  if (process.env.NODE_ENV === "development") {
    server = http.createServer(app);

    server.listen(process.env.PORT, () => {
      consola.success(
        `Leap server listening on ${global.SERVER_IP}:${process.env.PORT}`
      );
    });
  } else if (process.env.NODE_ENV === "production") {
    server = require("greenlock-express")
      .init({
        packageRoot: __dirname,
        configDir: "./greenlock.d",
        cluster: false,
        maintainerEmail: "trystonmperry@gmail.com"
      })
      .serve(app);

    consola.success(`Leap server listening on ${global.SERVER_IP}`);
  } else {
    consola.error(
      `${process.env.NODE_ENV} is not a valid NODE_ENV env variable`
    );
  }

  // Attack Socket.IO to express server
  io = require("socket.io")(server);
  createSocketApp();

  createExpressApp();
}

function createExpressApp() {
  console.log("****CREATING EXPRESS APP****");

  app.use(cors());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json({ extended: true }));
  app.use((req, res, next) => {
    // If API method
    if (/^\/api/.test(req.path)) {
      next();
      return;
    }

    // Check if static file matches path url
    const path = `${__dirname}/public/${req.path}`;

    // If static file exists, send it
    if (fs.existsSync(path)) {
      res.sendFile(path);
    }

    // If static file doesn't exist, assume it's a SPA url
    else {
      res.sendFile(`${__dirname}/public/index.html`);
    }
  });

  // Generate routes from /routes/index.js and /rotues/modules
  require("./routes/index.js")({ app, io });

  console.log("****CREATED EXPRESS APP****");
}

function createSocketApp() {
  console.log("****CREATING SOCKET APP****");

  const socketEvents = require("./sockets/sockets.js");
  socketEvents({ io });

  console.log("****CREATED SOCKET APP****");
}
