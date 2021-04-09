const ExpressRoute = require("../ExpressRoute.js");
const consola = require("consola");
const crypto = require("crypto");

const Room = require("../../classes/Room");
const Router = require("../../mediasoup/router.js");

module.exports = ({ io }) => {
  const {
    verifySocketId,
    verifyRoomId,
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
            0,
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

        return {
          ok: true,
          data: {
            podcast,
            episode
          }
        };
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

      middleware: [verifySocketId],

      async function(req, res) {
        const { podcastUrlName, episodeUrlName } = req.body;

        const roomId = `episode/${episodeUrlName}`;

        // Get podcast and episode
        const [
          podcasts
        ] = await mysql.getPodcasts(
          "SELECT * FROM podcasts WHERE urlName = ?",
          [podcastUrlName]
        );
        if (!podcasts.length) {
          return {
            error: "No podcast found by that urlName",
            status: 400
          };
        }

        const podcast = podcasts[0];

        const [
          episodes
        ] = await mysql.getEpisodes(
          `SELECT * FROM podcast_${podcast.id}_episodes WHERE urlName = ?`,
          [episodeUrlName]
        );
        if (!episodes.length) {
          return {
            error: "No episode found by that urlName",
            status: 400
          };
        }

        const episode = episodes[0];

        // Get the roomId, used as an id in rooms and join socket room
        req.socket.roomId = roomId;

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
            error: "Unknown error, no router was found or created.",
            status: 500
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

        // Get all streams for connection later (deep copy)
        const streams = JSON.parse(JSON.stringify(router.$streams));

        // Get the RTP capabilities of the router
        const routerRtpCapabilities = router.rtpCapabilities;

        // Respond to client with router capabilites and streams array
        return {
          ok: true,
          data: {
            routerRtpCapabilities,
            streams,
            room,
            podcast,
            episode
          }
        };
      }
    }),

    /**
     * Join a room by roomId, get or create the Router
     * @param {string} roomId
     */
    authenticate: new ExpressRoute({
      type: "POST",

      model: {},

      middleware: [verifySocketId, verifyRoomId, verifyUserToken],

      async function(req, res) {
        // TODO verify live episode exists in database;

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

        const { roomId } = req.socket;

        // TODO temporary limit on viewers / podcasts in a room
        if (io.getSocketCount(roomId) >= 16) {
          return {
            ok: false,
            error: `Max users of 16 in room ${roomId}`,
            status: 400
          };
        }

        const room = rooms.get(roomId);

        // Add user as user in room
        room.users[req.socket.id] = {
          id: userProfile.id,
          username,
          producerIds: {
            webcam: "",
            mic: ""
          }
        };

        // Update users array for all users
        io.in(roomId).emit("chat/users", room.users);

        return { ok: true };
      }
    }),

    end: new ExpressRoute({
      type: "POST",

      model: {},

      middleware: [
        verifyUserToken,
        verifyPodcastExists,
        verifyUserIsHostOfPodcast,
        verifyEpisodeExists
      ],

      async function(req, res) {}
    })
  };
};
