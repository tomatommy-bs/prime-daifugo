import type { Config } from "tailwindcss";
import { tailwindConfig } from "@repo/tailwind-config/config";

const config: Pick<Config, "content" | "presets"> = {
  // presets: [tailwindConfig],
  content: ["./src/app/**/*.tsx"],
};

export default config;
