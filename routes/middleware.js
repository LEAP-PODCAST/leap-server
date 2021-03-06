const jwt = require("jsonwebtoken");

module.exports = ({ io }) => ({
  /**
   * Check if socket-id id is present, and if a socket exits
   * @param {Request} req
   * @param {Response} res
   */
  verifySocketId(req, res) {
    // Check if the socketId header exists
    const socketId = req.headers["socket-id"];
    if (!socketId) {
      return {
        ok: false,
        error: "No socket-id header in request"
      };
    }

    // Check if the socket exists
    const socket = io.sockets.connected[socketId];
    if (!socket) {
      return {
        ok: false,
        error: `No socket found by Socket ID: ${socketId}`
      };
    }

    // Attach socket to req
    req.socket = socket;

    return { ok: true };
  },

  /**
   * Check if router exists by roomId
   * @param {Request} req
   * @param {Response} res
   */
  verifyRoomId(req, res) {
    const roomId = req.body.roomId || req.socket.roomId;
    const router = routers.get(roomId);
    const room = rooms.get(roomId);

    if (!roomId) {
      return { error: "No roomId provided" };
    }

    if (!router || !room) {
      return { error: `No router or room found by room ID ${roomId}` };
    }

    req.router = router;
    req.room = room;

    return { ok: true };
  },

  /**
   * Verify JWT token
   * @param {Request} req
   * @param {Response} res
   */
  verifyUserToken(req, res) {
    try {
      const token = req.headers.authorization;
      if (!token) {
        return { error: "No authorization header present", status: 401 };
      }
      const deviceId = req.headers["device-id"];
      if (!deviceId) {
        return { error: "No device-id header present", status: 401 };
      }
      req.user = jwt.verify(token, deviceId);
      req.deviceId = deviceId;
      return { ok: true };
    } catch (err) {
      console.error(err);
      return { error: "Authentication unsuccessful", status: 401 };
    }
  },

  /**
   * Verify the user is a host in the room
   * @param {Request} req
   * @param {Response} res
   */
  verifyUserIsHostOfRoom(req, res) {
    const { id, roomId } = req.socket;

    // Get the room
    const room = rooms.get(roomId);

    if (!room) {
      return { error: `No room found by roomId ${roomId}`, status: 500 };
    }

    return { ok: room.users[id] && room.users[id].role === "host" };
  },

  /**
   * Verify the episode exists in the database
   * @param {Request} req
   * @param {Response} res
   */
  async verifyPodcastExists(req, res) {
    const { podcastId } = req.body;

    if (!podcastId) {
      return { error: "No podcastId provided", status: 400 };
    }

    const [podcasts] = await mysql.exec("SELECT * FROM podcasts WHERE id = ?", [
      podcastId
    ]);
    if (!podcasts.length) {
      return { error: "No podcast found by that id", status: 400 };
    }

    req.podcast = podcasts[0];

    return { ok: true };
  },

  /**
   * Verify podcast exists and user is host of it
   * @param {Request} req
   * @param {Response} res
   */
  async verifyUserIsHostOfPodcast(req, res) {
    // Check if user object is attached to request
    const { podcast, user } = req;
    if (!podcast) {
      return {
        error: "Podcast object not attached to request object",
        status: 500
      };
    }
    if (!user) {
      return {
        error: "User object not attached to request object",
        status: 500
      };
    }

    // Check if the user is a host in that podcast
    if (
      !podcast.hosts
        .split(",")
        .find(hostId => hostId == user.userAccount.profileId)
    ) {
      return { error: "You are not a host of this podcast", status: 400 };
    }

    return { ok: true };
  },

  /**
   * Verify the episode exists in the database
   * @param {Request} req
   * @param {Response} res
   */
  async verifyScheduledEpisodeExists(req, res) {
    const { episodeId } = req.body;

    if (!episodeId) {
      return { error: "No episodeId provided", status: 400 };
    }

    const [
      episodes
    ] = await mysql.exec("SELECT * FROM scheduled_podcast WHERE id = ?", [
      episodeId
    ]);
    if (!episodes.length) {
      return { error: "No scheduled episode found by that id", status: 400 };
    }

    // Verify podcastId and episode.podcastId match
    if (episodes[0].podcastId !== req.podcast.id) {
      return { error: "Episode id does not match podcastId", status: 400 };
    }

    req.episode = episodes[0];

    return { ok: true };
  },

  async verifyEpisodeExists(req, res) {
    const { podcastId, episodeId } = req.body;

    if (!episodeId) {
      return { error: "No episodeId provided", status: 400 };
    }
    if (!req.podcast) {
      return { error: "No podcast attached to request object", stats: 400 };
    }

    const [
      episodes
    ] = await mysql.exec(
      `SELECT * FROM podcast_${podcastId}_episodes WHERE id = ?`,
      [episodeId]
    );
    if (!episodes.length) {
      return { error: "No episode found by that id", status: 400 };
    }

    // Verify podcastId and episode.podcastId match
    if (episodes[0].podcastId !== req.podcast.id) {
      return { error: "Episode id does not match podcastId", status: 400 };
    }

    req.episode = episodes[0];

    return { ok: true };
  },

  verifyAdminPassword(req, res) {
    const password = req.headers["admin-password"];
    if (!password) {
      return { error: "admin-password header is required", status: 400 };
    }
    if (password !== process.env.ADMIN_PASSWORD) {
      return { error: "That password is invalid", status: 400 };
    }

    return { ok: true };
  }
});
