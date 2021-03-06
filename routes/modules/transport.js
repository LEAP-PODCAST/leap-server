const ExpressRoute = require("../ExpressRoute.js");
const consola = require("consola");

const Transport = require("../../mediasoup/transport.js");

const { getLocalStamp } = require("../../methods.js");
const e = require("express");

module.exports = ({ io }) => {
  const {
    verifySocketId,
    verifyRoomId,
    verifyUserToken
  } = require("../middleware.js")({ io });

  return {
    // Create a new recieve or send transport
    create: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          type: {
            type: "string",
            required: true,
            validator: type => ({
              isValid: ["send", "recv"].includes(type),
              error: "Type must be send or recv"
            })
          },
          roomId: {
            type: "string",
            required: true
          }
        }
      },

      middleware: [verifySocketId, verifyRoomId],

      async function(req, res) {
        const { type, roomId } = req.body;

        // Create a Transport and add it to the global Transport set
        const { transport, success, error } = await Transport.create({
          type,
          socketId: req.socket.id,
          routerId: roomId
        });

        if (!success) {
          return {
            ok: false,
            error
          };
        }

        // Tell client the info about the created transport
        return {
          ok: true,
          data: {
            transportOptions: {
              id: transport._internal.transportId,
              iceParameters: transport._data.iceParameters,
              iceCandidates: transport._data.iceCandidates,
              dtlsParameters: transport._data.dtlsParameters,
              sctpParameters: transport._data.sctpParameters
            }
          }
        };
      }
    }),

    /**
     * Connect the server transport to client transport
     * @param {string} type Transport type (send or recv)
     * @param {object} transportOptions Transport Options
     */
    connect: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          type: {
            type: "string",
            required: true,
            validator: type => ({
              isValid: ["send", "recv"].includes(type),
              error: "Type must be send or recv"
            })
          },
          transportOptions: {
            type: "object",
            required: true
          }
        }
      },

      middleware: [verifySocketId],

      async function(req, res) {
        const { type, transportOptions } = req.body;

        // Connect the Transport
        const { success, error } = await Transport.connect({
          type,
          socketId: req.socket.id,
          transportOptions
        });

        if (!success) {
          return { ok: false, error };
        }

        // Respond to client
        return { ok: true };
      }
    }),

    /**
     * Create a producer
     * @param {string} requestId Unique ID for request
     * @param {object} producerOptions Producer options
     */
    produce: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          producerOptions: {
            type: "object",
            required: true
          },
          type: {
            type: "string",
            validator: type => ({
              isValid: ["webcam", "mic"].includes(type),
              error: "Stream type is invalid"
            })
          }
        }
      },

      middleware: [verifySocketId, verifyRoomId, verifyUserToken],

      async function(req, res) {
        const { producerOptions, type } = req.body;

        // TODO check if user is permissed to produce in this room

        // If user is already producing stream type
        if (req.room.users[req.socket.id].producerIds[type]) {
          return {
            ok: false,
            error: `Already producing a ${type} stream`
          };
        }

        // If max streams of type produced in room
        // TODO discuss the limit
        if (req.router.$streams[type].length >= 3) {
          return {
            ok: false,
            error: `Max ${type} streams reached in room ${req.socket.roomId} of 3`
          };
        }

        // Create a producer and get it's id
        const { producer, success, error } = await Transport.produce({
          socketId: req.socket.id,
          producerOptions
        });

        if (!success) {
          return {
            ok: false,
            error
          };
        }

        // Add this stream to stream types
        req.room.users[req.socket.id].producerIds[type] = producer.id;

        const stream = {
          producerId: producer.id,
          startedAt: getLocalStamp(),
          isPaused: false,
          socketId: req.socket.id
        };

        // Add stream to corresponding streams array
        req.router.$streams[type].push(stream);

        // Respond to client with server producer id
        return {
          ok: true,
          data: {
            id: producer.id
          }
        };
      }
    }),

    /**
     * Producer ready for consumers
     * @param {string} type Type of stream to start producing
     */
    produced: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          type: {
            type: "string",
            validator: type => ({
              isValid: ["webcam", "mic"].includes(type),
              error: "Stream type is invalid"
            })
          }
        }
      },

      middleware: [verifySocketId, verifyRoomId],

      function(req, res) {
        const { type } = req.body;

        // Get the stream in question
        const producerId = req.room.users[req.socket.id].producerIds[type];
        const find = s => s.producerId === producerId;
        const stream = req.router.$streams[type].find(find);

        if (!stream) {
          return {
            ok: false,
            error: `No ${type} stream found by Producer ID ${producerId}`
          };
        }

        // If Webcam stream, tell all clients including producer the stream was added
        if (type === "webcam") {
          io.in(req.socket.roomId).emit(`stream/${type}`, stream);
        }

        // If audio, tell everyone EXCEPT the producer. Producer does not need to hear themselves
        else {
          req.socket.in(req.socket.roomId).emit(`stream/${type}`, stream);
        }

        // Update users array for all users
        io.in(req.socket.roomId).emit("chat/users", req.room.users);

        return { ok: true };
      }
    }),

    /**
     * Create a consumer
     * @param {object} consumerOptions Consumer options
     */
    consume: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          consumerOptions: {
            type: "object",
            required: true
          }
        }
      },

      middleware: [verifySocketId],

      async function(req, res) {
        const { consumerOptions } = req.body;

        // TODO check if user is permissed to consume in room

        // Create a consumer
        const { success, consumer, error } = await Transport.consume({
          socketId: req.socket.id,
          routerId: req.socket.roomId,
          consumerOptions
        });

        if (!success) {
          return {
            ok: false,
            error
          };
        }

        // Respond to client with the needed consumer info
        return {
          ok: true,
          data: {
            consumerOptions: {
              id: consumer._internal.consumerId,
              producerId: consumer._internal.producerId,
              kind: consumer._data.kind,
              rtpParameters: consumer._data.rtpParameters
            }
          }
        };
      }
    })
  };
};
