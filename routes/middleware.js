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

    // If user has key tied to them
    if (req.socket.key) {
      const key = req.headers["user-key"];

      if (!key) {
        return {
          ok: false,
          error: "No user-key header on request"
        };
      }

      // Keys do not match
      if (req.socket.key !== key) {
        return {
          ok: false,
          error: "You're not authenticated for this route"
        };
      }
    }

    return { ok: true };
  },

  /**
   * Check if router exists by roomId
   * @param {Request} req
   * @param {Response} res
   */
  verifyRoomId(req, res) {
    const { roomId } = req.body;
    const router = routers.get(roomId);
    const room = rooms.get(roomId);

    if (!router || !room) {
      return {
        ok: false,
        error: `No router or room found by room ID ${roomId}`
      };
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
      req.user = jwt.verify(token, req.ip);
      return { ok: true };
    } catch (err) {
      console.error(err);
      return { error: "Authentication unsuccessful", status: 401 };
    }
  },

  /**
   * Verify the user is a host of the podcast
   * @param {Request} req
   * @param {Response} res
   */
  async verifyUserIsHostOfPodcast(req, res) {
    // Check if user object is attached to request
    const { user } = req;
    if (!user) {
      return {
        error: "User object not attached to request object",
        status: 500
      };
    }

    const { podcastId } = req.body;
    if (!podcastId) {
      return {
        error:
          "Well, how am I supposed to check if you are a part of the podcast if you don't give me the podcastId?",
        status: 400
      };
    }

    // Check if that podcast exists
    const [podcasts] = await mysql.exec("SELECT * FROM podcasts WHERE id = ?", [
      podcastId
    ]);
    if (!podcasts.length) {
      return { error: "No podcast found by that id", status: 400 };
    }

    const podcast = podcasts[0];
    const hosts = podcast.hosts.split(",");

    // Check if the user is a host in that podcast
    if (!hosts.includes(`${podcastId}`)) {
      return { error: "You are not a host of this podcast", status: 400 };
    }

    req.podcast = podcast;

    return { ok: true };
  }
});
