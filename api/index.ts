import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import serverless from 'serverless-http';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { storage } from '../server/storage';
import { setupAuth } from '../server/auth';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Set up authentication routes
setupAuth(app);

// Manual venue routes registration
app.get("/api/venues", async (_req, res) => {
  try {
    const venues = await storage.getVenues();
    // Ensure all IDs are strings in response
    const venuesWithStringIds = venues.map(venue => ({
      ...venue,
      _id: venue._id.toString()
    }));
    res.json(venuesWithStringIds);
  } catch (error) {
    console.error('Error fetching venues:', error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/api/venues/:id", async (req, res) => {
  try {
    const venueId = req.params.id;
    
    // Try to fetch venue
    const venue = await storage.getVenueById(venueId);

    if (!venue) {
      console.log('Venue not found:', venueId);
      return res.status(404).json({ message: "Venue not found" });
    }

    // Ensure ID is a string in response
    const venueData = {
      ...venue,
      _id: typeof venue._id === 'object' ? venue._id.toString() : venue._id
    };

    res.json(venueData);
  } catch (error) {
    console.error('Error fetching venue:', error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Database connection management for serverless
let cachedConnection: typeof mongoose | null = null;

async function connectToDatabase() {
  // If we have a cached connection and it's connected, reuse it
  if (cachedConnection && cachedConnection.connection.readyState === 1) {
    return cachedConnection;
  }

  try {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error('Missing MONGODB_URI environment variable');
    }

    // Create new connection
    const connection = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, // Shorter timeout for serverless
      socketTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      retryWrites: true,
      retryReads: true,
      maxPoolSize: 1, // Single connection for serverless
      minPoolSize: 0,
      maxIdleTimeMS: 10000,
      bufferCommands: false,
      autoCreate: false
    });

    cachedConnection = connection;
    console.log('Connected to MongoDB Atlas successfully');
    return connection;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    cachedConnection = null;
    throw error;
  }
}

// Serverless handler
const handler = serverless(app);

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    await connectToDatabase();
    return handler(req, res);
  } catch (error) {
    console.error('Serverless function error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};