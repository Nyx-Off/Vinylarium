-- Per-user Spotify OAuth tokens (Authorization Code flow).
ALTER TABLE "users" ADD COLUMN     "spotifyRefreshToken" TEXT,
ADD COLUMN     "spotifyAccessToken" TEXT,
ADD COLUMN     "spotifyTokenExpires" TIMESTAMP(3),
ADD COLUMN     "spotifyId" TEXT,
ADD COLUMN     "spotifyName" TEXT;
