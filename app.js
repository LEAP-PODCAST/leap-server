require("dotenv").config();
const fs = require("fs");
const express = require("./express.js");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
const Worker = require("./mediasoup/worker");
const http = require("http");
const consola = require("consola");

// Define MySQL tables
(async () => {
  global.mysql = await require("mysql2/promise").createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQL_PORT)
  });

  await require("./create_sql_tables.js")();
})();

// Create http server if not https
let server;
let io;

// All workers representing CPU vCores
global.workers = [];

// All routers representing rooms
global.routers = new Map();

// All Doice rooms
global.rooms = new Map();

// All transports representing streamer sending data
global.sendTransports = new Map();

// All transports representing viewer receiving data
global.recvTransports = new Map();

// All producers
global.producers = new Map();

// All consumers
global.consumers = new Map();

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
