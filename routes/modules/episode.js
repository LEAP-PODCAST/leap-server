const ExpressRoute = require("../ExpressRoute.js");
const consola = require("consola");
const crypto = require("crypto");

const Room = require("../../classes/Room");
const Router = require("../../mediasoup/router.js");

module.exports = ({ io }) => {
  const {
    verifySocketId,
    verifyUserToken,
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
    })
  };
};
