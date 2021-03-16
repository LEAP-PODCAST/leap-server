const ExpressRoute = require("../ExpressRoute.js");
const consola = require("consola");
const regex = require("../../data/regex");

module.exports = ({ io }) => {
  const { verifyUserToken } = require("../middleware")({ io });

  return {
    /**
     * Create a new user account and user profile
     * @param {string} username
     */
    create: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          name: {
            type: "string",
            required: true,
            maxLength: 64,
            validator: name => ({
              isValid: regex.nameWithSpaces.test(name),
              error: "That podcast name cannot be used"
            })
          },
          hosts: {
            type: "array",
            required: true
          }
        }
      },

      middleware: [verifyUserToken],

      async function(req, res) {
        const { name, hosts } = req.body;
        console.log(name, hosts);

        // Verify hosts are legit hosts
        for (const host of hosts) {
          if (typeof host !== "number") {
            return {
              error: `One of the hosts, ${host}, was not type number`,
              error: 400
            };
          }

          const [
            selectedHosts
          ] = await mysql.execute(
            "SELECT id FROM user_profiles WHERE id = ? LIMIT 1",
            [host]
          );
          if (!selectedHosts.length) {
            return {
              error: `One of the hosts, ${host}, was not found in the database`,
              status: 400
            };
          }
        }

        // Create the podcast
        const [result] = await mysql.execute(
          `INSERT INTO podcasts (
          name, hosts
        ) VALUES (?, ?)`,
          [name, hosts.toString()]
        );
        if (!result || typeof result.insertId !== "number") {
          return {
            error: "An error occurred creating this podcast",
            status: 500
          };
        }

        // Create table for episodes

        // Create table for clips

        // Respond
        return {
          ok: true,
          data: {
            id: result.insertId,
            name,
            hosts
          }
        };
      }
    })
  };
};
