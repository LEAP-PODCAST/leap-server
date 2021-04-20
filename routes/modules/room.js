const ExpressRoute = require("../ExpressRoute.js");
const consola = require("consola");
const crypto = require("crypto");

const Room = require("../../classes/Room");
const Router = require("../../mediasoup/router.js");

const { getLocalStamp } = require("../../methods.js");

module.exports = ({ io }) => {
  const { verifySocketId, verifyUserToken } = require("../middleware.js")({
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
        req.socket.username = username;

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
    })
  };
};
