const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(uri);
    console.log('MongoDB connected successfully');

    // Cleanup: drop problematic unique index on email if it exists
    try {
      const userCollection = mongoose.connection.collection('users');
      const indexes = await userCollection.indexes();
      const emailIndex = indexes.find(idx => idx.key && idx.key.email && idx.unique);
      if (emailIndex) {
        await userCollection.dropIndex(emailIndex.name);
        console.log('Dropped problematic unique email index:', emailIndex.name);
      }
    } catch (e) {
      // Ignore — collection may not exist yet
    }

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...');
    });

  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
