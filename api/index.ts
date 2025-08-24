import { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { registerRoutes } from '../server/routes';
import { setupAuth } from '../server/auth';
import mongoose from '../server/db';
import { importVenues } from '../server/import-venues';
import serverless from 'serverless-http';

// Create Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add CORS middleware for Vercel
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Setup authentication
setupAuth(app);

// Register venue routes manually for Vercel Functions
app.get('/api/venues', async (_req, res) => {
  try {
    const { storage } = await import('../server/storage');
    const venues = await storage.getVenues();
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

app.get('/api/venues/:id', async (req, res) => {
  try {
    const { storage } = await import('../server/storage');
    const venueId = req.params.id;
    const venue = await storage.getVenueById(venueId);

    if (!venue) {
      return res.status(404).json({ message: "Venue not found" });
    }

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

// Serve static files for non-API routes
app.get('*', (req, res) => {
  // For Vercel, we'll let the static files be handled by the routes in vercel.json
  res.status(404).json({ message: 'Not found' });
});

// Initialize database connection
let isConnected = false;

const connectToDatabase = async () => {
  if (isConnected) {
    return;
  }

  try {
    await mongoose.connection.readyState;
    if (mongoose.connection.readyState === 1) {
      isConnected = true;
      return;
    }

    await new Promise((resolve, reject) => {
      mongoose.connection.once('open', resolve);
      mongoose.connection.once('error', reject);
    });

    // Import venues if needed
    await importVenues();
    isConnected = true;
    console.log('Connected to MongoDB and imported venues');
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
};

// Create serverless handler
const serverlessApp = serverless(app);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Handle the request
    return await serverlessApp(req, res);
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}