import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    authInterrupts: true,
  },
  // next dev logs every request with its whole address, "?" part included (next start
  // logs none), and can only leave a request out, not cut it (#185). Left out:
  // - any link with a "token" parameter (AGENTS.md: a token in a link always goes
  //   there), also encoded once or twice inside another parameter: without a session,
  //   a page sends the visitor to /login?callbackUrl=<its address> (auth.config.ts)
  // - the data export download (#165), whatever its parameter is called. The path is
  //   in three places: here, nginx/app.conf and check 18 of scripts/nginx.test.sh
  logging: {
    incomingRequests: {
      ignore: [
        // "?" "&" "=" as they are, encoded once (%3F %26 %3D) or twice (%253F...)
        /(?:[?&]|%(?:25)?3F|%(?:25)?26)token(?:=|%(?:25)?3D)/i,
        // Any id, slashes included, like nginx/app.conf: next dev sees the path still
        // encoded, so a "?" in it can only be the start of the "?" part
        /^\/api\/gdpr\/export\/[^?]+\/download\/?(?:\?|$)/,
      ],
    },
  },
};

export default nextConfig;
