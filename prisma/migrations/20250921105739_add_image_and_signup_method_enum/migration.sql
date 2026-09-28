-- CreateEnum
CREATE TYPE "public"."ThoughtStatus" AS ENUM ('PENDING', 'POSTED', 'REPOSTED');

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "signupMethod" VARCHAR(20) NOT NULL DEFAULT 'email',
ADD COLUMN     "subscriptionType" TEXT NOT NULL DEFAULT 'Free',
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."admins" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSuper" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "backgroundImage" TEXT,
    "icon" TEXT,
    "color" TEXT,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."meditations" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "duration" INTEGER NOT NULL,
    "link" TEXT NOT NULL,
    "thumbnail" TEXT,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "subcategoryId" TEXT,
    "type" TEXT,

    CONSTRAINT "meditations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."meditation_tags" (
    "meditationId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "meditation_tags_pkey" PRIMARY KEY ("meditationId","tagId")
);

-- CreateTable
CREATE TABLE "public"."subcategories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "color" TEXT,

    CONSTRAINT "subcategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."liked_meditations" (
    "id" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "meditationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liked_meditations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ThoughtOfTheDay" (
    "id" TEXT NOT NULL,
    "thumbnail" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "public"."ThoughtStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThoughtOfTheDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."playlists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" BIGINT NOT NULL,

    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."playlist_meditations" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "meditationId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "order" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_meditations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "public"."admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "public"."tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subcategories_name_categoryId_key" ON "public"."subcategories"("name", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "liked_meditations_userId_meditationId_key" ON "public"."liked_meditations"("userId", "meditationId");

-- CreateIndex
CREATE UNIQUE INDEX "playlist_meditations_playlistId_meditationId_key" ON "public"."playlist_meditations"("playlistId", "meditationId");

-- AddForeignKey
ALTER TABLE "public"."meditations" ADD CONSTRAINT "meditations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meditations" ADD CONSTRAINT "meditations_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "public"."subcategories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meditation_tags" ADD CONSTRAINT "meditation_tags_meditationId_fkey" FOREIGN KEY ("meditationId") REFERENCES "public"."meditations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meditation_tags" ADD CONSTRAINT "meditation_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subcategories" ADD CONSTRAINT "subcategories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."liked_meditations" ADD CONSTRAINT "liked_meditations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."liked_meditations" ADD CONSTRAINT "liked_meditations_meditationId_fkey" FOREIGN KEY ("meditationId") REFERENCES "public"."meditations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."playlists" ADD CONSTRAINT "playlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."playlist_meditations" ADD CONSTRAINT "playlist_meditations_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "public"."playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."playlist_meditations" ADD CONSTRAINT "playlist_meditations_meditationId_fkey" FOREIGN KEY ("meditationId") REFERENCES "public"."meditations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
