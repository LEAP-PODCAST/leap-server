const ExpressRoute = require("../ExpressRoute.js");

module.exports = ({ io }) => {
  const { verifySocketId, verifyRoomId } = require("../middleware")({ io });

  return {
    /**
     * Mute or unmute mic
     * @param {string} producerId Producer ID
     */
    getAll: new ExpressRoute({
      type: "GET",

      model: {
        query: {
          endTime: {
            type: "number"
          }
        }
      },

      middleware: [verifySocketId, verifyRoomId],

      function(req, res) {
        const endTime = 

        const [notifications] = await mysql.exec(`SELECT * FROM notifications`)
      }
    })
  };
};
