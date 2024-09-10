import type { Config } from "tailwindcss";
import { tailwindConfig } from "@repo/tailwind-config/config";

const config: Config = {
  presets: [tailwindConfig],
  content: ["./src/**/*.tsx"],
  plugins: [require("daisyui")],
};

export default config;
