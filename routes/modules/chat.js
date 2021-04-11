const ExpressRoute = require("../ExpressRoute.js");

const { getLocalStamp } = require("../../methods.js");

module.exports = ({ io }) => {
  const {
    verifySocketId,
    verifyRoomId,
    verifyUserToken
  } = require("../middleware.js")({ io });

  return {
    /**
     * Join a room by roomId, get or create the Router
     * @param {string} roomId
     */
    message: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          text: {
            type: "string",
            required: true,
            maxLength: 256
          }
        }
      },

      middleware: [verifySocketId, verifyRoomId, verifyUserToken],

      function(req, res) {
        const { text } = req.body;

        // TODO change username to userId
        io.in(req.socket.roomId).emit("chat/message", {
          type: "message",
          text,
          socketId: req.socket.id
        });

        return { ok: true };
      }
    })
  };
};
