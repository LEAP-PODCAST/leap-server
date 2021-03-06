const ExpressRoute = require("../ExpressRoute.js");
const consola = require("consola");
const crypto = require("crypto");

const Room = require("../../classes/Room");
const Router = require("../../mediasoup/router.js");

const { getLocalStamp } = require("../../methods.js");

module.exports = ({ io }) => {
  const {
    verifySocketId,
    verifyUserToken,
    verifyRoomId,
    verifyUserIsHostOfRoom
  } = require("../middleware.js")({
    io
  });

  return {
    /**
     * Join a room by roomId, get or create the Router
     * @param {string} roomId
     */
    join: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          roomId: {
            type: "string",
            required: true
          }
        }
      },

      middleware: [verifySocketId, verifyUserToken],

      async function(req, res) {
        const { roomId } = req.body;

        // TODO verify roomID is in database as scheduled podcast or something similar

        // Get the roomId, used as an id in rooms and join socket room
        req.socket.roomId = roomId;

        // Get the username from the userProfile with profileId
        const [
          userProfiles
        ] = await mysql.exec(
          `SELECT id FROM user_profiles WHERE id = ? LIMIT 1`,
          [req.user.userAccount.profileId]
        );
        if (!userProfiles.length) {
          return {
            error: `Couldn't find a user profile by id ${req.user.userAccount.profileId}`,
            status: 500
          };
        }

        const userProfile = userProfiles[0];
        const { username } = userProfile;

        // TODO temporary limit on viewers / podcasts in a room
        if (io.getSocketCount(roomId) >= 16) {
          return {
            ok: false,
            error: `Max users of 16 in room ${roomId}`,
            status: 400
          };
        }

        // Create or join a room by the id
        const router = await Router.getOrCreate(roomId);

        if (!router) {
          return {
            ok: false,
            error: "Unknown error, no router was found or created."
          };
        }

        // TODO functionize joining room to condense logic
        let room = rooms.get(roomId);
        if (!room) {
          room = new Room();
          rooms.set(roomId, room);
        }

        // Join the Socket.IO room
        req.socket.join(roomId);
        room.users[req.socket.id] = {
          id: userProfile.id,
          username,
          producerIds: {
            webcam: "",
            mic: ""
          }
        };

        // Get all streams for connection later (deep copy)
        const streams = JSON.parse(JSON.stringify(router.$streams));

        // Get the RTP capabilities of the router
        const routerRtpCapabilities = router.rtpCapabilities;

        // Tell all clients that user has joined
        // io.in(roomId).emit("chat/message", {
        //   type: "action",
        //   text: `${username} joined the room`
        // });

        // Update users array for all users
        io.in(roomId).emit("chat/users", room.users);

        // Respond to client with router capabilites and streams array
        return {
          ok: true,
          data: {
            routerRtpCapabilities,
            streams,
            room
          }
        };
      }
    }),

    requestToJoinAsGuest: new ExpressRoute({
      type: "POST",

      model: {},

      middleware: [verifySocketId, verifyUserToken, verifyRoomId],

      async function(req, res) {
        // TODO check if user has been blocked from podcast

        if (req.room.users[req.socket.id].isRequestingToJoinAsGuest) {
          return {
            ok: false,
            error: "You're already requesting to join as a guest"
          };
        }
        req.room.users[req.socket.id].isRequestingToJoinAsGuest = true;

        io.in(req.socket.roomId).emit("chat/users", req.room.users);

        return { ok: true };
      }
    }),

    changeUserRole: new ExpressRoute({
      type: "PUT",

      model: {
        body: {
          socketId: {
            type: "string",
            required: true
          },
          role: {
            type: "string",
            required: true,
            minLength: 0,
            validator: role => ({
              isValid: ["", "guest"].includes(role),
              error: `${role} is not a valid role`
            })
          }
        }
      },

      middleware: [
        verifySocketId,
        verifyRoomId,
        verifyUserToken,
        verifyUserIsHostOfRoom
      ],

      async function(req, res) {
        const { socketId, role } = req.body;

        // Check if user is found in room by socketId
        if (!req.room.users[socketId]) {
          return {
            error: `No user found by socketId ${socketId} in room ${req.socket.roomId}`
          };
        }

        // Check if user is producing
        // Emit events for all producers and consumers that the stream has ended
        const sendTransport = sendTransports.get(socketId);

        if (sendTransport) {
          const producerIds = Array.from(sendTransport._producers.keys());

          // Tell all consumers and the producer that the stream has handed (possibly in error)
          producerIds.forEach(producerId => {
            io.in(req.socket.roomId).emit(`producer/close/${producerId}`);

            const { success, error } = Router.removeStreamByProducerId({
              roomId: req.socket.roomId,
              producerId
            });

            if (!success) {
              console.error(error);
            }
          });
        }

        req.room.users[socketId].role = role;

        io.to(req.socket.roomId).emit("chat/users", req.room.users);

        return { ok: true };
      }
    })
  };
};
