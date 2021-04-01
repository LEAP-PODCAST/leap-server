const ExpressRoute = require("../ExpressRoute.js");
const consola = require("consola");
const crypto = require("crypto");

const Room = require("../../classes/Room");
const Router = require("../../mediasoup/router.js");

module.exports = ({ io }) => {
  const {
    verifySocketId,
    verifyUserToken,
    verifyPodcastExists,
    verifyUserIsHostOfPodcast,
    verifyEpisodeExists
  } = require("../middleware.js")({
    io
  });

  return {
    /**
     * Start live episode
     * @param {number} podcastId
     * @param {number} episodeId
     */
    start: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          podcastId: {
            type: "number",
            required: true
          },
          episodeId: {
            type: "number",
            required: true
          }
        }
      },

      middleware: [
        verifySocketId,
        verifyUserToken,
        verifyPodcastExists,
        verifyUserIsHostOfPodcast,
        verifyEpisodeExists
      ],

      async function(req, res) {
        const { podcast, episode } = req;

        // Delete episode from scheduled episodes
        const [
          result
        ] = await mysql.exec("DELETE FROM scheduled_podcast WHERE id = ?", [
          episode.id
        ]);
        if (!result) {
          return {
            error:
              "There was an error removing that podcast episode from the database",
            status: 500
          };
        }

        // Add episode with podcast info to episodes database
        const [result2] = await mysql.exec(
          `INSERT INTO podcast_${podcast.id}_episodes (
          podcastId,
          name,
          urlName,
          hosts,
          guests,
          description,
          visibility,
          startTime,
          isLive
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            podcast.id,
            episode.name,
            episode.urlName,
            episode.hosts,
            episode.guests,
            episode.description,
            episode.visibility,
            episode.startTime,
            true
          ]
        );
        if (!result2) {
          return {
            error: "Failed to add live episode to the database",
            status: 500
          };
        }

        // TODO notify everyone that episode is starting

        return { ok: true };
      }
    }),

    /**
     * Watch a live episode
     * @param {string} podcastUrlName
     * @param {string} episodeUrlName
     */
    watch: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          podcastUrlName: {
            type: "string",
            required: true
          },
          episodeUrlName: {
            type: "string",
            required: true
          }
        }
      },

      middleware: [verifySocketId, verifyUserToken],

      async function(req, res) {
        const { podcastUrlName, episodeUrlName } = req.body;

        // Get podcast and episode and verify they exist
        const [
          podcasts
        ] = await mysql.exec(
          "SELECT * FROM podcasts WHERE urlName = ? LIMIT 1",
          [podcastUrlName]
        );
        if (!podcasts.length) {
          return {
            error: `No podcast by urlName ${podcastUrlName} found`,
            status: 400
          };
        }

        const [
          episodes
        ] = await mysql.exec(
          "SELECT * FROM scheduled_podcast WHERE urlName = ? LIMIT 1",
          [episodeUrlName]
        );
        if (!episodes.length) {
          return {
            error: `No podcast episode by urlName ${episodeUrlName} found`,
            status: 400
          };
        }

        const podcast =
          // Get the roomId, used as an id in rooms and join socket room
          (req.socket.roomId = req.socket.key = req.ip);

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
        io.in(roomId).emit("chat/message", {
          type: "action",
          text: `${username} joined the room`
        });

        // Update users array for all users
        io.in(roomId).emit("chat/users", room.users);

        // Respond to client with router capabilites and streams array
        return {
          ok: true,
          data: {
            routerRtpCapabilities,
            streams,
            room,
            key: req.socket.key
          }
        };
      }
    })
  };
};
