const ExpressRoute = require("../ExpressRoute.js");

const { getLocalStamp } = require("../../methods.js");

module.exports = ({ io }) => {
  const { verifySocketId, verifyRoomId } = require("../middleware.js")({ io });

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

      middleware: [verifySocketId, verifyRoomId],

      function(req, res) {
        const { text } = req.body;

        // TODO change username to userId
        io.in(req.socket.roomId).emit("chat/message", {
          type: "message",
          text,
          username: req.socket.username,
          socketId: req.socket.id
        });

        return { ok: true };
      }
    })
  };
};
