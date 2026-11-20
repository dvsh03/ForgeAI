const mongoose = require('mongoose');

let memoryServer = null;

const connectDB = async (uri) => {
  let mongoURI = uri || process.env.MONGODB_URI;

  if (!mongoURI) {
    console.log('[MongoDB] MONGODB_URI not found in .env. Starting automatic in-memory MongoDB for $0 local dev...');
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      mongoURI = memoryServer.getUri();
      console.log(`[MongoDB] In-Memory MongoDB instance active at: ${mongoURI}`);
    } catch (memErr) {
      throw new Error(`MONGODB_URI is missing and in-memory server failed: ${memErr.message}`);
    }
  }

  try {
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: process.env.NODE_ENV !== 'production', // Don't build indexes on every boot in high-scale prod
    });

    console.log(`[MongoDB] Connected to database: ${conn.connection.name} @ ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error(`[MongoDB] Connection error: ${err.message}`);
    throw err;
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    if (memoryServer) {
      await memoryServer.stop();
      memoryServer = null;
    }
    console.log('[MongoDB] Disconnected gracefully');
  } catch (err) {
    console.error(`[MongoDB] Disconnection error: ${err.message}`);
  }
};

module.exports = { connectDB, disconnectDB };

