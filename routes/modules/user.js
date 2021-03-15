const ExpressRoute = require("../ExpressRoute.js");
const consola = require("consola");
const crypto = require("crypto");

const regex = require("../../data/regex");

module.exports = ({ io }) => {
  return {
    /**
     * Create a new user account and user profile
     * @param {string} username
     * @param {string} firstName
     * @param {string} lastName
     * @param {string} email
     * @param {boolean} receiveNotifications
     */
    signUp: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          username: {
            type: "string",
            required: true,
            maxLength: 20,
            validator: username => ({
              isValid: regex.username.test(username),
              error: "That username is invalid"
            })
          },
          firstName: {
            type: "string",
            required: true,
            maxLength: 20,
            validator: firstName => ({
              isValid: regex.name.test(firstName),
              error: "That firstName is invalid"
            })
          },
          lastName: {
            type: "string",
            required: true,
            maxLength: 20,
            validator: lastName => ({
              isValid: regex.name.test(lastName),
              error: "That lastName is invalid"
            })
          },
          email: {
            type: "string",
            required: true,
            maxLength: 32,
            validator: email => ({
              isValid: regex.email.test(email),
              error: "That email is invalid"
            })
          },
          password: {
            type: "string",
            required: true,
            maxLength: 64
          },
          receiveNotifications: {
            type: "boolean",
            required: true
          }
        }
      },

      middleware: [],

      async function(req, res) {
        const {
          username,
          firstName,
          lastName,
          email,
          password,
          receiveNotifications
        } = req.body;

        const lowerUsername = username.toLowerCase();
        const lowerEmail = email.toLowerCase();

        // Verify that the username is not taken
        var [
          users
        ] = await mysql.execute(
          "SELECT id FROM user_profiles WHERE username = ? LIMIT 1",
          [lowerUsername]
        );
        if (users.length) {
          return { error: "That username is not available", status: 400 };
        }

        // Verify that the email is not taken
        var [
          users
        ] = await mysql.execute(
          "SELECT profileId FROM user_accounts WHERE email = ? LIMIT 1",
          [lowerEmail]
        );
        if (users.length) {
          return { error: "That email is not available", status: 400 };
        }

        // Create a user profile
        var [result] = await mysql.execute(
          `INSERT INTO user_profiles (
          username,
          fullUsername,
          firstName,
          lastName
        ) VALUES (?, ?, ?, ?)`,
          [lowerUsername, username, firstName, lastName]
        );
        if (!result || typeof result.insertId !== "number") {
          return {
            error: "An error occurred creating this user profile",
            status: 500
          };
        }

        const [
          userProfiles
        ] = await mysql.execute(
          "SELECT * FROM user_profiles WHERE id = ? LIMIT 1",
          [result.insertId]
        );
        if (!userProfiles.length) {
          return {
            error:
              "This is a pretty bad internal server erorr. No idea how you got here",
            status: 500
          };
        }

        const userProfile = userProfiles[0];

        // Hash password with unique salt
        const salt = crypto.randomBytes(64).toString("base64").substr(0, 64);
        const hash = await crypto
          .pbkdf2Sync(
            password,
            salt,
            Number(process.env.HASH_ITERATIONS),
            64,
            "sha256"
          )
          .toString();

        // Create a user account with profile id
        var [result] = await mysql.execute(
          `INSERT INTO user_accounts (
          profileId,
          email,
          password,
          salt,
          receiveNotifications
        ) VALUES (?, ?, ?, ?, ?)`,
          [userProfile.id, lowerEmail, hash, salt, receiveNotifications]
        );

        if (!result || typeof result.insertId !== "number") {
          return {
            error: "An error occurred creating this user account",
            status: 500
          };
        }

        const [
          userAccounts
        ] = await mysql.execute(
          "SELECT * FROM user_accounts WHERE profileId = ? LIMIT 1",
          [userProfile.id]
        );
        if (!userAccounts.length) {
          return {
            error:
              "This is a pretty bad internal server erorr. No idea how you got here",
            status: 500
          };
        }

        const userAccount = userAccounts[0];
        console.log(userProfile, userAccount);

        // Some sort of JTW

        // Respond with user account information including auth token
        return {
          ok: true,
          data: {}
        };
      }
    })
  };
};
