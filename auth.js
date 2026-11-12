import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient } from "mongodb";
import "dotenv/config";

// Connect directly to MongoDB for the auth adapter
const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db("StudioSpace"); // Use your database name

export const auth = betterAuth({
  database: mongodbAdapter(db),
  baseURL: process.env.BETTER_AUTH_URL , // Your backend URL
  secret: process.env.BETTER_AUTH_SECRET, // Add a random string secret in your .env file
  
  emailAndPassword: {
    enabled: true,
  },
  
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  trustedOrigins: [
    "http://localhost:3000",
    "https://studio-space-client-m30ijltbr-nujhat-s-project.vercel.app" //  Your live Vercel frontend UR
  ], // Explicitly trust your Next.js frontend
 
});