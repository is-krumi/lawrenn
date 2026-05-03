import { google } from "googleapis";
import http from "http";
import url from "url";

const CLIENT_ID     = "";
const CLIENT_SECRET = "";
const REDIRECT_URI  = "http://localhost:3000/api/auth/google/callback";

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/calendar"],
  prompt: "consent",
});

console.log("Open this URL in your browser:");
console.log(authUrl);

const server = http.createServer(async (req, res) => {
  const code = new url.URL(req.url, "http://localhost:3000").searchParams.get("code");
  if (code) {
    const { tokens } = await oauth2Client.getToken(code);
    console.log("\n✅ Your tokens:");
    console.log("GOOGLE_REFRESH_TOKEN=", tokens.refresh_token);
    console.log("GOOGLE_ACCESS_TOKEN=", tokens.access_token);
    res.end("Got it! You can close this tab.");
    server.close();
  }
});

server.listen(3000, () => {
  console.log("\nWaiting for Google callback on port 3000...");
  console.log("(Make sure npm run dev is NOT running)");
});