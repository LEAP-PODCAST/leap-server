module.exports = async () => {
  await mysql.execute(`CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(20) UNIQUE NOT NULL,
    fullUsername VARCHAR(20) NOT NULL,
    avatarUrl TEXT,
    firstName VARCHAR(20) NOT NULL,
    lastName VARCHAR(20) NOT NULL,
    bio VARCHAR(128),
    socials TEXT,
    createdAt TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await mysql.execute(`CREATE TABLE IF NOT EXISTS user_accounts (
    profileId INTEGER PRIMARY KEY NOT NULL,
    email VARCHAR(32) UNIQUE NOT NULL,
    password VARCHAR(64) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    receiveNotifications BOOLEAN NOT NULL
  )`);

  await mysql.execute(`CREATE TABLE IF NOT EXISTS podcasts (
    name VARCHAR(64) PRIMARY KEY NOT NULL,
    iconUrl TEXT,
    hosts TEXT
  )`);

  // TODO create unique tables for podcast_mypodcast_clips and podcast_mypodcast_episodes

  // TODO for each podcast create a seperate table for the corresponding comments

  // await mysql.execute(`CREATE TABLE IF NOT EXISTS comments (
  //   id INTEGER PRIMARY KEY AUTO_INCREMENT,
  //   text VARCHAR(256) NOT NULL,
  //   profileId INTEGER NOT NULL,
  //   createdAt TIMESTAMP NOT NULL DEFAULT NOW()
  //   timestamp INTEGER
  // )`)

  await mysql.execute(`CREATE TABLE IF NOT EXISTS scheduled_podcast (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(64) NOT NULL,
    screenshotUrl TEXT,
    hosts TEXT,
    guests TEXT,
    description VARCHAR(1024),
    visibility TINYINT,
    timeToAlert SMALLINT
  )`);
};
