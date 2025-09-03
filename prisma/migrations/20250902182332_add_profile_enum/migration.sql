/*
  Warnings:

  - The `inferredGender` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `inferredAgeGroup` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `confirmedGender` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `confirmedAgeGroup` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "public"."Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "public"."AgeGroup" AS ENUM ('AGE_13_17', 'AGE_18_25', 'AGE_26_35', 'AGE_36_45', 'AGE_46_55', 'AGE_55_PLUS');

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "inferredGender",
ADD COLUMN     "inferredGender" "public"."Gender",
DROP COLUMN "inferredAgeGroup",
ADD COLUMN     "inferredAgeGroup" "public"."AgeGroup",
DROP COLUMN "confirmedGender",
ADD COLUMN     "confirmedGender" "public"."Gender",
DROP COLUMN "confirmedAgeGroup",
ADD COLUMN     "confirmedAgeGroup" "public"."AgeGroup";
