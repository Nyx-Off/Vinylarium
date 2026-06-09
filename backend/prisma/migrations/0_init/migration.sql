-- CreateEnum
CREATE TYPE "ReleaseSource" AS ENUM ('DISCOGS', 'MANUAL');

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'QUEUED', 'ENRICHING', 'ENRICHED', 'FAILED', 'MANUAL', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PARSING', 'ENRICHING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RoleCategory" AS ENUM ('INSTRUMENT', 'VOCAL', 'WRITING', 'PRODUCTION', 'TECHNICAL', 'PERFORMANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ImageType" AS ENUM ('PRIMARY', 'SECONDARY', 'BACK', 'LABEL', 'OTHER');

-- CreateEnum
CREATE TYPE "ExternalSource" AS ENUM ('DISCOGS', 'MUSICBRAINZ', 'GENIUS', 'WIKIPEDIA', 'OTHER');

-- CreateEnum
CREATE TYPE "TextSource" AS ENUM ('DISCOGS', 'MUSICBRAINZ', 'GENIUS', 'WIKIPEDIA', 'MANUAL', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "avatarPath" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releases" (
    "id" TEXT NOT NULL,
    "source" "ReleaseSource" NOT NULL DEFAULT 'DISCOGS',
    "enrichmentStatus" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "enrichmentError" TEXT,
    "enrichedAt" TIMESTAMP(3),
    "discogsReleaseId" INTEGER,
    "discogsMasterId" INTEGER,
    "discogsUri" TEXT,
    "title" TEXT NOT NULL,
    "sortTitle" TEXT,
    "artistDisplay" TEXT NOT NULL,
    "year" INTEGER,
    "decade" INTEGER,
    "releasedRaw" TEXT,
    "releasedFormatted" TEXT,
    "country" TEXT,
    "countryId" TEXT,
    "catalogNumber" TEXT,
    "notes" TEXT,
    "dataQuality" TEXT,
    "rating" INTEGER,
    "collectionFolder" TEXT,
    "mediaCondition" TEXT,
    "sleeveCondition" TEXT,
    "collectionNotes" TEXT,
    "dateAdded" TIMESTAMP(3),
    "coverPath" TEXT,
    "backCoverPath" TEXT,
    "thumbUrl" TEXT,
    "isStudio" BOOLEAN NOT NULL DEFAULT true,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "isCompilation" BOOLEAN NOT NULL DEFAULT false,
    "isReissue" BOOLEAN NOT NULL DEFAULT false,
    "isRemaster" BOOLEAN NOT NULL DEFAULT false,
    "isSpecialEdition" BOOLEAN NOT NULL DEFAULT false,
    "storageLocationId" TEXT,
    "storageSlot" TEXT,
    "addedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortName" TEXT,
    "discogsArtistId" INTEGER,
    "realName" TEXT,
    "profile" TEXT,
    "imagePath" TEXT,
    "discogsUri" TEXT,
    "originCountryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_artists" (
    "releaseId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "anv" TEXT,
    "joinRel" TEXT,
    "role" TEXT,

    CONSTRAINT "release_artists_pkey" PRIMARY KEY ("releaseId","artistId","position")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "RoleCategory" NOT NULL DEFAULT 'OTHER',

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credits" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "detail" TEXT,
    "tracks" TEXT,
    "rawRole" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discogsLabelId" INTEGER,
    "profile" TEXT,
    "imagePath" TEXT,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_labels" (
    "releaseId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "catno" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "release_labels_pkey" PRIMARY KEY ("releaseId","labelId","catno")
);

-- CreateTable
CREATE TABLE "genres" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_genres" (
    "releaseId" TEXT NOT NULL,
    "genreId" TEXT NOT NULL,

    CONSTRAINT "release_genres_pkey" PRIMARY KEY ("releaseId","genreId")
);

-- CreateTable
CREATE TABLE "styles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "styles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_styles" (
    "releaseId" TEXT NOT NULL,
    "styleId" TEXT NOT NULL,

    CONSTRAINT "release_styles_pkey" PRIMARY KEY ("releaseId","styleId")
);

-- CreateTable
CREATE TABLE "release_formats" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" TEXT,
    "text" TEXT,
    "descriptions" TEXT[],

    CONSTRAINT "release_formats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "position" TEXT,
    "title" TEXT NOT NULL,
    "duration" TEXT,
    "durationSec" INTEGER,
    "trackIndex" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL DEFAULT 'track',

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "images" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "type" "ImageType" NOT NULL DEFAULT 'SECONDARY',
    "localPath" TEXT,
    "sourceUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lyrics" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "trackId" TEXT,
    "text" TEXT NOT NULL,
    "source" "TextSource" NOT NULL DEFAULT 'MANUAL',
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lyrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anecdotes" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT,
    "artistId" TEXT,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "source" "TextSource" NOT NULL DEFAULT 'MANUAL',
    "sourceUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anecdotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_locations" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "furniture" TEXT,
    "shelf" TEXT,
    "column" TEXT,
    "row" TEXT,
    "bin" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_tags" (
    "releaseId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "release_tags_pkey" PRIMARY KEY ("releaseId","tagId")
);

-- CreateTable
CREATE TABLE "identifiers" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_links" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT,
    "artistId" TEXT,
    "source" "ExternalSource" NOT NULL,
    "url" TEXT NOT NULL,
    "externalId" TEXT,

    CONSTRAINT "external_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "filename" TEXT NOT NULL,
    "storedFilePath" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "releases_discogsReleaseId_key" ON "releases"("discogsReleaseId");

-- CreateIndex
CREATE INDEX "releases_year_idx" ON "releases"("year");

-- CreateIndex
CREATE INDEX "releases_decade_idx" ON "releases"("decade");

-- CreateIndex
CREATE INDEX "releases_country_idx" ON "releases"("country");

-- CreateIndex
CREATE INDEX "releases_sortTitle_idx" ON "releases"("sortTitle");

-- CreateIndex
CREATE INDEX "releases_artistDisplay_idx" ON "releases"("artistDisplay");

-- CreateIndex
CREATE INDEX "releases_enrichmentStatus_idx" ON "releases"("enrichmentStatus");

-- CreateIndex
CREATE INDEX "releases_storageLocationId_idx" ON "releases"("storageLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "artists_discogsArtistId_key" ON "artists"("discogsArtistId");

-- CreateIndex
CREATE INDEX "artists_name_idx" ON "artists"("name");

-- CreateIndex
CREATE INDEX "artists_sortName_idx" ON "artists"("sortName");

-- CreateIndex
CREATE INDEX "release_artists_artistId_idx" ON "release_artists"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "roles_category_idx" ON "roles"("category");

-- CreateIndex
CREATE INDEX "credits_releaseId_idx" ON "credits"("releaseId");

-- CreateIndex
CREATE INDEX "credits_artistId_idx" ON "credits"("artistId");

-- CreateIndex
CREATE INDEX "credits_roleId_idx" ON "credits"("roleId");

-- CreateIndex
CREATE INDEX "credits_artistId_roleId_idx" ON "credits"("artistId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "labels_name_key" ON "labels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "labels_discogsLabelId_key" ON "labels"("discogsLabelId");

-- CreateIndex
CREATE INDEX "labels_name_idx" ON "labels"("name");

-- CreateIndex
CREATE INDEX "release_labels_labelId_idx" ON "release_labels"("labelId");

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");

-- CreateIndex
CREATE INDEX "release_genres_genreId_idx" ON "release_genres"("genreId");

-- CreateIndex
CREATE UNIQUE INDEX "styles_name_key" ON "styles"("name");

-- CreateIndex
CREATE INDEX "release_styles_styleId_idx" ON "release_styles"("styleId");

-- CreateIndex
CREATE INDEX "release_formats_releaseId_idx" ON "release_formats"("releaseId");

-- CreateIndex
CREATE INDEX "tracks_releaseId_idx" ON "tracks"("releaseId");

-- CreateIndex
CREATE INDEX "images_releaseId_idx" ON "images"("releaseId");

-- CreateIndex
CREATE INDEX "lyrics_releaseId_idx" ON "lyrics"("releaseId");

-- CreateIndex
CREATE INDEX "anecdotes_releaseId_idx" ON "anecdotes"("releaseId");

-- CreateIndex
CREATE INDEX "anecdotes_artistId_idx" ON "anecdotes"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "countries_name_key" ON "countries"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "release_tags_tagId_idx" ON "release_tags"("tagId");

-- CreateIndex
CREATE INDEX "identifiers_releaseId_idx" ON "identifiers"("releaseId");

-- CreateIndex
CREATE INDEX "external_links_releaseId_idx" ON "external_links"("releaseId");

-- CreateIndex
CREATE INDEX "external_links_artistId_idx" ON "external_links"("artistId");

-- CreateIndex
CREATE INDEX "import_jobs_status_idx" ON "import_jobs"("status");

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artists" ADD CONSTRAINT "artists_originCountryId_fkey" FOREIGN KEY ("originCountryId") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_artists" ADD CONSTRAINT "release_artists_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_artists" ADD CONSTRAINT "release_artists_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_labels" ADD CONSTRAINT "release_labels_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_labels" ADD CONSTRAINT "release_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_genres" ADD CONSTRAINT "release_genres_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_genres" ADD CONSTRAINT "release_genres_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_styles" ADD CONSTRAINT "release_styles_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_styles" ADD CONSTRAINT "release_styles_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_formats" ADD CONSTRAINT "release_formats_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lyrics" ADD CONSTRAINT "lyrics_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lyrics" ADD CONSTRAINT "lyrics_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anecdotes" ADD CONSTRAINT "anecdotes_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anecdotes" ADD CONSTRAINT "anecdotes_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anecdotes" ADD CONSTRAINT "anecdotes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_tags" ADD CONSTRAINT "release_tags_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_tags" ADD CONSTRAINT "release_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identifiers" ADD CONSTRAINT "identifiers_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_links" ADD CONSTRAINT "external_links_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_links" ADD CONSTRAINT "external_links_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

