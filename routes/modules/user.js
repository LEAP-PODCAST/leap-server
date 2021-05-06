const ExpressRoute = require("../ExpressRoute.js");
const consola = require("consola");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const regex = require("../../data/regex");

module.exports = ({ io }) => {
  const { verifySocketId, verifyUserToken } = require("../middleware")({ io });

  return {
    /**
     * Create a new user account and user profile
     * @param {string} username
     * @param {string} firstName
     * @param {string} lastName
     * @param {string} email,
     * @param {string} password
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
        },
        headers: {
          "device-id": {
            type: "string",
            required: true,
            maxLength: 16
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
        ] = await mysql.getUserProfiles(
          "SELECT id FROM user_profiles WHERE username = ? LIMIT 1",
          [lowerUsername]
        );
        if (users.length) {
          return { error: "That username is not available", status: 400 };
        }

        // Verify that the email is not taken
        var [
          users
        ] = await mysql.exec(
          "SELECT profileId FROM user_accounts WHERE email = ? LIMIT 1",
          [lowerEmail]
        );
        if (users.length) {
          return { error: "That email is not available", status: 400 };
        }

        // // Create a user profile
        var [result] = await mysql.exec(
          `INSERT INTO user_profiles (
          username,
          fullUsername,
          firstName,
          lastName,
          podcasts
        ) VALUES (?, ?, ?, ?, ?)`,
          [lowerUsername, username, firstName, lastName, ""]
        );
        if (!result || typeof result.insertId !== "number") {
          return {
            error: "An error occurred creating this user profile",
            status: 500
          };
        }

        const [
          userProfiles
        ] = await mysql.getUserProfiles(
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
        const hash = crypto
          .createHash("sha256")
          .update(password)
          .digest("base64");

        // Create a user account with profile id
        var [result] = await mysql.exec(
          `INSERT INTO user_accounts (
          profileId,
          email,
          password,
          salt,
          receiveNotifications,
          isEmailVerified
        ) VALUES (?, ?, ?, ?, ?, ?)`,
          [userProfile.id, lowerEmail, hash, salt, receiveNotifications, false]
        );

        if (!result || typeof result.insertId !== "number") {
          return {
            error: "An error occurred creating this user account",
            status: 500
          };
        }

        // TODO at some point there will be a duplicate string in db
        const emailId = crypto.randomBytes(16).toString("base64").substr(0, 16);

        // Add email to verification table for awaitng email verification
        const [result2] = await mysql.exec(
          `INSERT INTO user_account_email_validations (
          profileId,
          id
        ) VALUES (?, ?)`,
          [userProfile.id, emailId]
        );

        SES.sendEmail({
          to: email,
          subject: "Welcome to Leap!",
          message: `
            <body>
              <h1>Thank you for joining leap</h1>
              <p>Please click the link below to confirm your email address.</p>
              <a href="https://staging.joinleap.co/verifyemail?id=${emailId}">Confirm my Email!</a>
            </body>
          `,
          from: "support@joinleap.co"
        });

        const [
          userAccounts
        ] = await mysql.exec(
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

        const data = {
          userProfile,
          userAccount: {
            email: userAccount.email,
            receiveNotifications: userAccount.receiveNotifications,
            salt: userAccount.salt
          },
          token: jwt.sign({ userAccount }, req.headers["device-id"], {
            expiresIn: "30d"
          })
        };

        if (!data.token.length) {
          return { error: "Could not create Bearer token", status: 500 };
        }

        // Respond with user account information including auth token
        return {
          ok: true,
          data
        };
      }
    }),

    /**
     * Log in to an existing user account
     * @param {string} email,
     * @param {string} password
     */
    logIn: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          email: {
            type: "string",
            required: true,
            maxLength: 32
          },
          password: {
            type: "string",
            required: true,
            maxLength: 64
          }
        },
        headers: {
          "device-id": {
            type: "string",
            required: true,
            maxLength: 16
          }
        }
      },

      middleware: [],

      async function(req, res) {
        const { email, password } = req.body;

        const lowerEmail = email.toLowerCase();

        // Check if a user account exists with this email
        const [
          userAccounts
        ] = await mysql.exec(
          "SELECT * FROM user_accounts WHERE email = ? LIMIT 1",
          [lowerEmail]
        );
        if (!userAccounts.length) {
          return { error: "Incorrect login details", status: 400 };
        }

        const userAccount = userAccounts[0];

        // Check if hashed password = stored hashed password
        const hash = crypto
          .createHash("sha256")
          .update(password)
          .digest("base64");

        if (hash !== userAccount.password) {
          return { error: "Incorrect login details", status: 400 };
        }

        // Get user profile by profileId
        const [
          userProfiles
        ] = await mysql.getUserProfiles(
          "SELECT * FROM user_profiles WHERE id = ? LIMIT 1",
          [userAccount.profileId]
        );
        if (!userProfiles.length) {
          return {
            error: `No user profile by id ${userAccount.profileId} associated with user account`,
            status: 500
          };
        }

        const userProfile = userProfiles[0];

        // Create JWT auth token
        const data = {
          userProfile,
          userAccount: {
            email: userAccount.email,
            receiveNotifications: userAccount.receiveNotifications,
            salt: userAccount.salt
          },
          token: jwt.sign({ userAccount }, req.headers["device-id"], {
            expiresIn: "30d"
          })
        };

        if (!data.token.length) {
          return { error: "Could not create Bearer token", status: 500 };
        }

        // Respond with user account information including auth token
        return {
          ok: true,
          data
        };
      }
    }),

    /**
     * Verify user token is still valid (usually used when user comes back to app intially)
     */
    verifyUserToken: new ExpressRoute({
      type: "POST",

      model: {},

      middleware: [verifySocketId, verifyUserToken],

      async function(req, res) {
        const id = req.user.userAccount.profileId;

        const [
          userProfiles
        ] = await mysql.getUserProfiles(
          "SELECT * FROM user_profiles WHERE id = ? LIMIT 1",
          [id]
        );
        if (!userProfiles.length) {
          return { error: `No user profile found by id ${id}`, status: 500 };
        }

        // Add user to io users store
        io.users.set(id, socket.id);

        return {
          ok: true,
          data: {
            userProfile: userProfiles[0],
            userAccount: {
              email: req.user.userAccount.email,
              receiveNotifications: req.user.userAccount.receiveNotifications,
              salt: req.user.userAccount.salt
            },
            token: req.headers.authorization
          }
        };
      }
    })
  };
};
