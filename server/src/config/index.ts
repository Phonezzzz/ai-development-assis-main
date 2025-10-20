import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const parsedPort = Number.parseInt(process.env.SERVER_PORT ?? "4000", 10);

if (Number.isNaN(parsedPort)) {
  throw new Error("Invalid SERVER_PORT value. It must be a number.");
}

const workspacePath =
  process.env.SERVER_WORKSPACE_PATH !== undefined
    ? path.resolve(process.env.SERVER_WORKSPACE_PATH)
    : path.resolve(process.cwd(), "..", "storage");

export const config = {
  port: parsedPort,
  apiToken: process.env.SERVER_API_TOKEN ?? "",
  workspacePath,
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY ?? ""
  }
};

export type AppConfig = typeof config;