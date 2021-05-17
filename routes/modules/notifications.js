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
        // 999999 because thats assuming no more than 999999 elements in notifications array
        const lastId = req.query.lastId || 999999;

        const [notifications] = await mysql.exec(
          `SELECT * FROM notifications WHERE id < ? AND toEmail = ? ORDER BY createdAt DESC LIMIT 10`,
          [lastId, "a@a.com"]
        );

        console.log(notifications);

        const items = [];
        for (const notification of notifications) {
          const { tableName, itemId } = notification;
          const [i] = await mysql.exec(
            `SELECT * FROM ${tableName} WHERE id = ?`,
            [itemId]
          );
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
