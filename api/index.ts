import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import serverless from 'serverless-http';
import { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcrypt';
import { Venue, User } from '../shared/schema';

const app = express();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://hall-project.vercel.app', 'https://hall-project.netlify.app']
    : 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Simplified authentication routes (without sessions)
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();

    res.status(201).json({ message: 'User registered successfully', userId: user._id });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ message: 'Login successful', userId: user._id, username: user.username });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  res.json({ message: 'Logout successful' });
});

app.get('/api/user', (req, res) => {
  // Without sessions, we can't maintain user state
  // This endpoint now returns unauthorized for serverless compatibility
  res.status(401).json({ error: 'Not authenticated' });
});

// Venue routes
app.get('/api/venues', async (req, res) => {
  try {
    const venues = await Venue.find();
    res.json(venues);
  } catch (error) {
    console.error('Error fetching venues:', error);
    res.status(500).json({ error: 'Failed to fetch venues' });
  }
});

app.get('/api/venues/:id', async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }
    res.json(venue);
  } catch (error) {
    console.error('Error fetching venue:', error);
    res.status(500).json({ error: 'Failed to fetch venue' });
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