const ExpressRoute = require("../ExpressRoute.js");

module.exports = ({ io }) => {
  const { verifyUserToken } = require("../middleware")({ io });

  return {
    /**
     * Mute or unmute mic
     * @param {string} producerId Producer ID
     */
    getAll: new ExpressRoute({
      type: "GET",

      model: {
        query: {
          lastId: {
            type: "number"
          }
        }
      },

      middleware: [verifyUserToken],

      async function(req, res) {
        const lastId = req.query.lastId || 0;

        const [notifications] = await mysql.exec(
          `SELECT * FROM notifications WHERE id > ? AND toUserEmail = ? LIMIT 10`,
          [lastId, req.user.userAccount.email]
        );

        const items = [];
        for (const notification of notifications) {
          const { tableName, itemId } = notification;
          const [i] = await mysql.exec("SELECT * FROM ? WHERE id = ?", [
            tableName,
            itemId
          ]);
          items.push(i[0]);
        }

        return {
          ok: true,
          data: items
        };
      }
    })
  };
};
